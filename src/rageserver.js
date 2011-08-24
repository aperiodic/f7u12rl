#!/usr/bin/env node


/*** MODULES ******************************************************************/

var http = require('http');
var url = require('url');

var curry = require('curry');
var redis = require('redis');

var enrage = require(__dirname + '/../lib/enrage.js');
var Image = require(__dirname + '/models/image.js');


/*** RUNTIME #DEFINES *********************************************************/

var NO_SRC_ERR_MSG = 'No "src" parameter found';
var I_DONE_GOOFED = 'I done goofed';
var NO_FACES_MSG = 'No faces found'

var NO_FACES_SYM = 'nofaces';


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



/*** SERVER LOGIC *************************************************************/

var handleRootReq = function (req, res) {
  var request = url.parse(req.url, true);
  var src = request.query.src;
  
  if (!src) {
    res.writeHead(400, NO_SRC_ERR_MSG, { 'Content-Type': 'text/plain'
                                       , 'Content-Length': NO_SRC_ERR_MSG.length
                                       });
    res.end();
    return;
  }
  
  console.info('enraging URL "' + src + '"');
  Image.requested(src, req);
  Image.checkCache(src, curry([res, src], gotCacheResponse));
}


var gotCacheResponse = function (res, src, err, exists) {
  if (err) { cryMeARiver(err); return }
  
  if (exists === 1) {
    console.info('cache hit');
    Image.loadData(src, curry([res, src], gotImage));
  } else {
    console.info('cache miss');
    enrage.enrageUrl(src, curry([res, src], gotRage));
  }
}


var gotImage = function (res, src, err, data) {
  if (err) { cryMeARiver(err); return }
  
  if (data === NO_FACES_SYM) {
    sendNoFaceError(res);
    return;
  }
  
  sendPNG(res, new Buffer(data, 'base64'));
}


var gotRage = function(res, src, err, data, info) {
  if (err) {
    if (err.code) {
      res.writeHead(err.code, err.type, { 'Content-Type': 'text/plain'
                                        , 'Content-Length': err.message.length
                                        });
      res.write(err.message);
      res.end();
    } else {
      console.error(err);
      console.error(err.stack);
      res.writeHead(500, I_DONE_GOOFED, { 'Content-Type': 'text/plain'
                                        , 'Content-Length': I_DONE_GOOFED.length
                                        });
      res.write(I_DONE_GOOFED);
      res.end();
    }
    return;
  }
  
  if (!data) {
    sendNoFaceError(res);
    Image.save(src, NO_FACES_SYM);
    return;
  }
  
  sendPNG(res, data);
  Image.save(src, data.toString('base64'));
}


var sendNoFaceError = function(res) {
  res.writeHead(404, NO_FACES_MSG, { 'Content-Type': 'text/plain'
                                   , 'Content-Length': NO_FACES_MSG.length
                                   });
  res.write(NO_FACES_MSG);
  res.end();
}


process.on('uncaughtException', function (err) {
  console.log('Caught uncaught exception: ' + err);
  console.log(err.stack);
});



/*** MAIN *********************************************************************/

rc = redis.createClient();
Image.configure(rc);
http.createServer(handleRootReq).listen(24712, '0.0.0.0');
