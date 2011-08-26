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
  var htmlData = new Buffer(html, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8'
                     , 'Content-Length': html.length
                     });
  res.write(html);
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

// route: /:imgUrl
//var handleRootReq = function (req, res) {
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
  Cache.check(src, curry([res, src], gotCacheResponse));
});


var gotCacheResponse = function (res, src, err, exists) {
  if (err) { 
    cryMeARiver(err); 
    send500(res);
    return;
  }
  
  if (exists === 1) {
    winston.info('cache hit for ' + src);
    Cache.load(src, curry([res, src], gotCached));
  } else {
    winston.info('cache miss for ' + src);
    enrage.enrageUrl(src, curry([res, src], gotRage));
  }
}


var gotCached = function (res, src, err, data) {
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
  
  sendPNG(res, new Buffer(data, 'base64'));
}


var gotRage = function(res, src, err, data, info) {
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
  
  sendPNG(res, data);
  Cache.save(src, data.toString('base64'));
}



/*** MAIN (INITIALIZATION)  ***************************************************/

flags.defineString('conf', 'conf.json', 'Configuration file');
flags.parse();
var confPath = flags.get('conf');
var confText = fs.readFileSync(confPath, 'utf8');
try {
  var conf = JSON.parse(confText);
} catch(err) { 
  console.error(err);
  console.error(err.stack);
}

rc = redis.createClient(conf.redis.port, conf.redis.host);
Cache.configure(rc);
enrage.configure(conf.face_com.api_key, conf.face_com.api_secret);
winston.add(winston.transports.File, { filename: conf.log.path
                                     , level:    conf.log.level
                                     }) 
winston.remove(winston.transports.Console);
winston.handleExceptions(new winston.transports.File(
  { filename: conf.log.exceptions }
))

app.listen(conf.server.port);
