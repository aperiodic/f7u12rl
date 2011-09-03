#!/usr/bin/env node


/*** MODULES ******************************************************************/

var fs = require('fs');
var http = require('http');
var url = require('url');
var util = require('util');

var curry = require('curry');
var express = require('express');
var flags = require('flags');
var gm = require('gm');
var jade = require('jade');
var redis = require('redis');
var winston = require('winston');

var enrage = require(__dirname + '/lib/enrage.js');
var Cache = require(__dirname + '/lib/cache.js');


/*** RUNTIME #DEFINES *********************************************************/

var I_DONE_GOOFED = 'I DONE GOOFED (ERROR 500)';

var NO_FACES_MSG = 'No faces found'
var NO_FACES_SYM = 'nofaces';
var LOAD_JPG_SYM = 'hit';

// If a cached value from redis has a length longer than this, we assume it's a
// base64-encoded PNG image; otherwise, we assume it's a special symbol denoting
// that, e.g., there are no faces in the image, or Face.com couldn't get a valid
// image. If any of these symbols exceed this length ceiling, bad things will
// happen.
var SYM_LENGTH_CEIL = 100;

var QUEEN_ELIZABETH = 'http://www.librarising.com/astrology/celebs/images2' +
                      '/QR/queenelizabethii.jpg';

// This is safe to use when pairing integers and face.com API error messages, 
// since neither of these things will contain a pipe.
var FACE_COM_SAFE_DELIMITER = '|';
var FACE_COM_ERR_CACHE_TTL = 600;

var RAGE_ERR_REGEX = /(^\d{2,3})\|([^\|]*)\|(\d+)$/;

var IMAGES_DIR = 'resources/images';


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


var sendImg = function (res, type, imageData) {
  res.writeHead(200, { 'Content-Type': 'image/' + type
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

var deleteIfErr = function (path, err) {
  if (err) {
    cryMeARiver(err);
    fs.unlink(path, reportIfErr);
  }
}

var reportIfErr = function (err) {
  if (err) cryMeARiver(err);
}

var imagePath = function (src, extension) {
  var b64 = (new Buffer(src)).toString('base64');
  if (extension === undefined) extension = '.jpg';
  return IMAGES_DIR + '/' + b64 + extension;
}


/*** SERVER LOGIC *************************************************************/

// This is almost exactly the same as the handler below, except that we don't
// send the image, just an empty 200 response, if all goes well. 
// This is used by the client-side js to check for bad requests and whatnot, so
// it can display error messages to the user, without fetching the image all
// over again.
app.get('/status/', function (req, res) {
  var request = url.parse(req.url, true);
  var src = request.query.src;
  if (!src) { sendErr(res, 400, 'No "src" param found'); return }
  
  var fname = imagePath(src);
  fs.readFile(fname, curry([res, src, fname, false], gotFile));
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
  var fname = imagePath(src);
  fs.readFile(fname, curry([res, src, fname, true], gotFile));
})


var gotFile = function (res, src, fname, sendImage, err, data) {
  if (err) {
    // if it's just a ENOENT error, then the cache file DNE
    if (err.code === 'ENOENT') {
      enrage.enrageUrl(src, curry([res, src, sendImage], gotRage));
    } else {
      send500(res);
      if (err.message !== 'Could not load image') {
        cryMeARiver(err);
      }
    }
    return;
  }
  
  if (data.length <= SYM_LENGTH_CEIL) {
    if (data.toString('utf8') === NO_FACES_SYM) {
      sendNoFaces(res);
    } else if ((rage_err = data.toString('utf8').match(RAGE_ERR_REGEX))) {
      var code = rage_err[1] * 1;
      var msg = rage_err[2];
      var timeout = rage_err[3] * 1;
      sendErr(res, code, msg);
      if (timeout < ((new Date) * 1)) {
        removeCachedFile(fname);
      }
    } else {
      var code_and_message = data.toString('utf8').split(FACE_COM_SAFE_DELIMITER);
      sendErr(res, code_and_message[0], code_and_message[1]);
    }
    return;
  }
  
  if (sendImage) {
    sendImg(res, 'jpeg', data);
  } else {
    sendHTML(res, null);
  }
}


var gotRage = function(res, src, sendImage, err, data, info) {
  var path = imagePath(src, '');
  if (err) {
    if (err.statuscode) {
      sendErr(res, err.statuscode, err.message);
      if (err.statuscode === 404) {
        // a 404 statuscode means the input image was screwed up somehow. this
        // should be cached indefinitely because it's unlikely to be a transient
        // issue
        var expiration = 0;
      } else {
        // 500s are errors that could be transient (for example, if we go over
        // our API usage)
        var expiration = (new Date) * 1 + FACE_COM_ERR_CACHE_TTL;
        if (err.message !== 'Could not load image') {
          cryMeARiver(err);
        }
      }
      
      var RAGE_ERR = err.statuscode + FACE_COM_SAFE_DELIMITER + err.message +
                     FACE_COM_SAFE_DELIMITER + expiration;
      var fname = path + '.jpg';
      fs.writeFile(fname, new Buffer(RAGE_ERR), curry([fname], deleteIfErr));
    } else {
      send500(res);
      cryMeARiver(err);
    }
    return;
  }
  
  if (!data) {
    sendNoFaces(res);
    var fname = path + '.jpg';
    fs.writeFile(fname, new Buffer(NO_FACES_SYM), curry([fname], deleteIfErr));
    return;
  }
  
  if (sendImage) {
    sendImg(res, 'png', data);
  } else {
    sendHTML(res, null);
  }
  fs.writeFile(path + '.png', data, curry([src, path], convertToJPEG));
}


var convertToJPEG = function (src, path, err) {
  gm(path + '.png').write(path + '.jpg', curry([path], removePNG));
}

var removePNG = function (path, err) {
  if (err) {
    removeCachedFile(path + '.jpg');
  } else {
    fs.unlink(path + '.png', reportIfErr);
  }
}

var removeCachedFile = function (fname) {
  fs.unlink(fname, reportIfErr);
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
