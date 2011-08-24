#!/usr/bin/env node


/*** MODULES ******************************************************************/

var http = require('http');
var url = require('url');

var curry = require('curry');
var redis = require('redis');

var enrage = require(__dirname + '/lib/enrage.js');
var Cache = require(__dirname + '/lib/cache.js');


/*** RUNTIME #DEFINES *********************************************************/

var NO_SRC_ERR_MSG = 'No "src" parameter found';
var NO_FACES_MSG = 'No faces found'
var I_DONE_GOOFED = 'I done goofed';

var NO_FACES_SYM = 'nofaces';
var REDIS_SYM_LENGTH_CEIL = 100;


// This is safe to use when pairing integers and face.com API error messages, 
// since neither of those things will contain a pipe.
var FACE_COM_SAFE_DELIMITER = '|';


/*** GLOBALS ******************************************************************/

// redis client
var rc;



/*** UTILITY BELT *************************************************************/

var cryMeARiver = function (err) {
  console.error(err);
  console.error(err.stack);
}

var sendPNG = function (res, imageData) {
  res.writeHead(200, { 'Content-Type': 'image/png'
                     , 'Content-Length': imageData.length
                     });
  res.write(imageData);
  res.end();
}


var sendNoFaces = function(res) {
  res.writeHead(200, NO_FACES_MSG, { 'Content-Type': 'text/plain'
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

var handleRootReq = function (req, res) {
  var request = url.parse(req.url, true);
  var src = request.query.src;
  
  if (!src) {
    sendErr(res, 400, NO_SRC_ERR_MSG);
    return;
  }
  
  console.info('enraging URL "' + src + '"');
  Cache.requested(src, req);
  Cache.check(src, curry([res, src], gotCacheResponse));
}


var gotCacheResponse = function (res, src, err, exists) {
  if (err) { 
    cryMeARiver(err); 
    send500(res);
    return;
  }
  
  if (exists === 1) {
    console.info('cache hit');
    Cache.load(src, curry([res, src], gotCached));
  } else {
    console.info('cache miss');
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
    } else {
      console.error(err);
      console.error(err.stack);
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



/*** MAIN *********************************************************************/

process.on('uncaughtException', function (err) {
  console.log('Caught uncaught exception: ' + err);
  console.log(err.stack);
});


rc = redis.createClient();
Cache.configure(rc);
http.createServer(handleRootReq).listen(24712, '0.0.0.0');
