#!/usr/bin/env node


/*** MODULES ******************************************************************/

var fs = require('fs');
var http = require('http');
var url = require('url');

var curry = require('curry');
var express = require('express');
var flags = require('flags');
var jade = require('jade');
var redis = require('redis');
var winston = require('winston');

var enrage = require(__dirname + '/lib/enrage.js');
var Cache = require(__dirname + '/lib/cache.js');


/*** RUNTIME #DEFINES *********************************************************/

var I_DONE_GOOFED = 'I DONE GOOFED (ERROR 500)';

var NO_FACES_MSG = 'No faces found'
var NO_FACES_SYM = 'nofaces';

// If a cached value from redis has a length longer than this, we assume it's a
// base64-encoded PNG image; otherwise, we assume it's a special symbol denoting
// that, e.g., there are no faces in the image, or Face.com couldn't get a valid
// image. If any of these symbols exceed this length ceiling, bad things will
// happen.
var REDIS_SYM_LENGTH_CEIL = 100;

var QUEEN_ELIZABETH = 'http://www.librarising.com/astrology/celebs/images2' +
                      '/QR/queenelizabethii.jpg';

// This is safe to use when pairing integers and face.com API error messages, 
// since neither of these things will contain a pipe.
var FACE_COM_SAFE_DELIMITER = '|';
var FACE_COM_ERR_CACHE_TTL = 600;


/*** GLOBALS ******************************************************************/

// redis client
var rc;

// express.js app object
var app = express.createServer();


/*** UTILITY BELT *************************************************************/

var cryMeARiver = function (err) {
  winston.error(err);
  winston.error(err.stack);
}


var sendPNG = function (res, imageData) {
  res.writeHead(200, { 'Content-Type': 'image/png'
                     , 'Content-Length': imageData.length
                     });
  res.write(imageData);
  res.end();
}

var sendHTML = function (res, err, html) {
  if (err) {
    cryMeARiver(err);
    send500(res);
    return;
  }
  
  // make a buffer so we know the byte length
  var htmlData = html ? new Buffer(html, 'utf8') : {length: 0};
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8'
                     , 'Content-Length': htmlData.length
                     });
  if (html) {
    res.write(htmlData);
  }
  res.end();
}

var sendNoFaces = function(res) {
  res.writeHead(200, { 'Content-Type': 'text/plain'
                     , 'Content-Length': NO_FACES_MSG.length
                     });
  res.write(NO_FACES_MSG);
  res.end();
}

var sendErr = function(res, errCode, errMsg) {
  res.writeHead(errCode, errMsg, { 'Content-Type': 'text/plain'
                                 , 'Content-Length': errMsg.length
                                 });
  res.write(errMsg);
  res.end();
}

var send500 = function(res) {
  sendErr(res, 500, I_DONE_GOOFED);
}



/*** SERVER LOGIC *************************************************************/

// This is almost exactly the same as the above handler, except that we don't
// send the image, just an empty 200 response, if all goes well. 
// This is used by the client-side js to check for bad requests and whatnot, so
// it can display error messages to the user.
app.get('/status/', function (req, res) {
  var request = url.parse(req.url, true);
  var src = request.query.src;
  if (!src) { sendErr(res, 400, 'No "src" param found'); return }
  
  Cache.check(src, curry([res, src, false], gotCacheResponse));
})


app.get('/:b64?', function (req, res) {
  var request = url.parse(req.url, true);
  var src = request.query.src;
  
  if (!src) {
    if (req.params.b64) {
      var imgUrl = (new Buffer(req.params.b64, 'base64')).toString('utf8');
    }
    jade.renderFile('views/index.jade', 
                    { locals: { image: imgUrl || QUEEN_ELIZABETH }}, 
                    curry([res], sendHTML));
    return;
  }
  
  winston.info('enraging URL "' + src + '"');
  Cache.requested(src, req);
  Cache.check(src, curry([res, src, true], gotCacheResponse));
})


var gotCacheResponse = function (res, src, sendImage, err, exists) {
  if (err) { 
    cryMeARiver(err); 
    send500(res);
    return;
  }
  
  if (exists === 1) {
    winston.info('cache hit for ' + src);
    Cache.load(src, curry([res, src, sendImage], gotCached));
  } else {
    winston.info('cache miss for ' + src);
    enrage.enrageUrl(src, curry([res, src, sendImage], gotRage));
  }
}


var gotCached = function (res, src, sendImage, err, data) {
  if (err) {
    cryMeARiver(err);
    send500(res);
    return;
  }
  
  if (data === NO_FACES_SYM) {
    sendNoFaces(res);
    return;
  } else if (data.length <= REDIS_SYM_LENGTH_CEIL) {
    var code_and_message = data.split(FACE_COM_SAFE_DELIMITER);
    sendErr(res, code_and_message[0], code_and_message[1]);
  }
  
  if (sendImage) {
    sendPNG(res, new Buffer(data, 'base64'));
  } else {
    sendHTML(res, null);
  }
}


var gotRage = function(res, src, sendImage, err, data, info) {
  if (err) {
    if (err.code) {
      sendErr(res, err.code, err.message);
      Cache.save(src, err.code + FACE_COM_SAFE_DELIMITER + err.message);
      Cache.expire(src, FACE_COM_ERR_CACHE_TTL);
    } else {
      winston.error(err);
      winston.error(err.stack);
      sendErr(res, 500, err.message);
    }
    return;
  }
  
  if (!data) {
    sendNoFaces(res);
    Cache.save(src, NO_FACES_SYM);
    return;
  }
  
  if (sendImage) {
    sendPNG(res, data);
  } else {
    sendHTML(res, null);
  }
  Cache.save(src, data.toString('base64'));
}



/*** MAIN (INITIALIZATION) ****************************************************/

process.on('uncaughtException', function (err) {
  console.error(err);
  console.error(err.stack);
})

flags.defineString('conf', 'conf.json', 'Configuration file');
flags.parse();
var confPath = flags.get('conf');
var confText = fs.readFileSync(confPath, 'utf8');
try {
  var conf = JSON.parse(confText);
} catch(err) { 
  console.error(err);
  console.error(err.stack);
  process.exit(1);
}

rc = redis.createClient(conf.redis.port, conf.redis.host);
Cache.configure(rc);
enrage.configure(conf.face_com.api_key, conf.face_com.api_secret);
winston.add(winston.transports.File, { filename:         conf.log.path
                                     //, handleExceptions: true
                                     , level:            conf.log.level
                                     })
//winston.handleExceptions();
//winston.remove(winston.transports.Console);

app.listen(conf.server.port);
