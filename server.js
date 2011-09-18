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
var winston = require('winston');

var enrage = require(__dirname + '/lib/enrage.js');


/*** RUNTIME #DEFINES *********************************************************/

var I_DONE_GOOFED = 'I DONE GOOFED (ERROR 500)';

var NO_FACES_MSG = 'No faces found'
var NO_FACES_SYM = 'nofaces';
var LOAD_JPG_SYM = 'hit';

// If the contents of a cache file are longer than this, we assume it's a valid
// JPEG image; otherwise, we assume it's a special symbol denoting that, e.g., 
// there are no faces in the image, or Face.com couldn't get a valid image. If 
// any of these symbols exceed this length ceiling, bad things will happen.
var SYM_LENGTH_CEIL = 100;

var QUEEN_ELIZABETH = 'http://www.librarising.com/astrology/celebs/images2' +
                      '/QR/queenelizabethii.jpg';

// This is safe to use when pairing integers and face.com API error messages, 
// since neither of these things will contain a pipe.
var FACE_COM_SAFE_DELIMITER = '|';
var FACE_COM_ERR_CACHE_TTL = 600;

var RAGE_ERR_REGEX = /(^\d{2,3})\|([^\|]*)\|(\d+)$/;

var IMAGES_DIR = 'resources/images';

// these are all in seconds
var ONE_DAY = 24 * 60 * 60;
var ONE_WEEK = ONE_DAY * 7;
var ONE_YEAR = ONE_DAY * 365;

// when there's a change in how images are drawn, this field should be updated.
// used in image caching headers
var IMAGE_DRAWING_LAST_CHANGE = enrage.lastModificationDate;


/*** GLOBALS ******************************************************************/

// express.js app object
var app = express.createServer();

// jade function 
var renderIndex;

// track in-flight cache misses so other requests for the same image can hook
// into it, minimizing work for each cache miss.
var inFlight = {};


/*** UTILITY BELT *************************************************************/

var cryMeARiver = function (err) {
  winston.error(err);
  winston.error(err.stack);
}

var inTheFuture = function (interval) {
  var now = new Date();
  var then = new Date(now.getTime() + interval * 1000);
  return then.toGMTString();
}

var sendImg = function (req, res, type, imageData) {
  if (req && req.headers['if-modified-since']) {
    var lastSaw = new Date(req.headers['if-modified-since']);
    if (lastSaw >= IMAGE_DRAWING_LAST_CHANGE || lastSaw > new Date()) {
      res.writeHead(304 , { 'Content-Type': 'image/' + type
                          , 'Expires': inTheFuture(ONE_DAY)
                          });
      res.end();
      return;
    }
  }
  
  res.writeHead(200, { 'Cache-Control': 'max-age=' + ONE_DAY + ', public'
                     , 'Content-Type': 'image/' + type
                     , 'Content-Length': imageData.length
                     , 'Expires': inTheFuture(ONE_DAY)
                     , 'Last-Modified': IMAGE_DRAWING_LAST_CHANGE.toGMTString()
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
  res.writeHead(200, { 'Cache-Control': 'max-age=' + ONE_YEAR
                     , 'Content-Type': 'text/html;charset=utf-8'
                     , 'Content-Length': NO_FACES_MSG.length
                     , 'Expires': inTheFuture(ONE_YEAR)
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
  var wres = {res: res, expects: 'text'};
  fs.readFile(fname, curry([req, wres, src, fname], gotFile));
})

app.get('/image/', function (req, res) {
  var request = url.parse(req.url, true);
  var src = request.query.src;
  if (!src) { sendErr(res, 400, 'No "src" param found'); return }
    
  winston.info('enraging URL "' + src + '"');
  var fname = imagePath(src);
  var wres = {res: res, expects: 'image'};
  fs.readFile(fname, curry([req, wres, src, fname], gotFile));
})

app.get('/favicon.png', function (req, res) {
 var wres = {res: res, expects: 'image'};
 fs.readFile('resources/favicon.png', curry([req, wres, null, null], gotFile));
})

app.get('/:b64?', function (req, res) {
  var request = url.parse(req.url, true);
  var src = request.query.src;
  
  if (req.params.b64) {
    var imgUrl = (new Buffer(req.params.b64, 'base64')).toString('utf8');
  }
  var index = renderIndex({image: imgUrl || QUEEN_ELIZABETH });
  sendHTML(res, null, index);
  return;
})


var gotFile = function (req, wres, src, fname, err, data) {
  var res = wres.res;
  var expects = wres.expects;
  
  if (err) {
    // if it's just a ENOENT error, then the cache file DNE
    if (err.code === 'ENOENT') {
      // see if there's an in-flight request for this image 
      if (inFlight[src] === undefined) {
        // nope, set the key to signal we've got this
        inFlight[src] = [];
        enrage.enrageUrl(src, curry([wres, src], gotRage));
      } else {
        // yup, add the response object to the list of those to be responded to
        // upon completion
        inFlight[src].push(wres);
      }
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
  
  if (expects === 'image') {
    sendImg(req, res, 'jpeg', data);
  } else if (true || expects === 'text') {
    sendHTML(res, null);
  }
}


var gotRage = function(wres, src, err, data, info) {
  var res = wres.res;
  var expects = wres.expects;
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
  
  inFlight[src].push(wres);
  var wresps = inFlight[src];
  for (var ri in wresps) {
    var res = wresps[ri].res;
    var expects = wresps[ri].expects;
    if (!data) {
      sendNoFaces(res);
    } else if (expects === 'image') {
      sendImg(null, res, 'png', data);
    } else if (true || expects === 'text') {
      sendHTML(res, null);
    }
  }
  delete inFlight[src];
  
  if (!data) {
    var fname = path + '.jpg';
    fs.writeFile(fname, new Buffer(NO_FACES_SYM), curry([fname], deleteIfErr));
  } else {
    fs.writeFile(path + '.png', data, curry([src, path], convertToJPEG));
  }
}


var convertToJPEG = function (src, path, err) {
  gm(path + '.png').write(path + '.prg.jpg', curry([path], conversionComplete));
}

var conversionComplete = function (path, err) {
  if (err) {
    removeCachedFile(path + '.jpg');
    return;
  } 
  
  fs.rename(path + '.prg.jpg', path + '.jpg', reportIfErr);
  fs.unlink(path + '.png', reportIfErr);
}

var removeCachedFile = function (fname) {
  fs.unlink(fname, reportIfErr);
}


/*** MAIN & INITIALIZATION ****************************************************/

var switchToOwner = function (err, stats) {
  if (err) {
    cryMeARiver(err);
    return;
  }
  process.setuid(stats.uid);
}

flags.defineString('conf', 
                   __dirname + '/conf/default.json', 
                   'Configuration file');
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

var indexTemplate = fs.readFileSync(__dirname + '/views/index.jade');
renderIndex = jade.compile(indexTemplate, {});

enrage.configure(conf.face_com.api_key, conf.face_com.api_secret);

if (conf.log.path !== "STDOUT") {
  winston.add(winston.transports.File, { filename:         conf.log.path
                                       , handleExceptions: true
                                       , level:            conf.log.level
                                       })
  winston.remove(winston.transports.Console);
}

app.listen(conf.server.port, function() {
  if (process.getuid() === 0) {
    fs.stat(__filename, switchToOwner);
  }
})
