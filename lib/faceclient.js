var assert = require('assert');
var http = require('http');
var qstring = require('querystring');

var curry = require('curry');

var FACE_HOST = 'api.face.com';
var FACE_PATH = '/faces/detect.json';
var FACE_PARAMS = { attributes: 'all' 
                  };
var CONFIGURED = false;
var NOT_CONFIGURED_ERR = 'Must configure face.com api client with ' + 
                         'faceclient.configure(key, secret) before using!';
var FACE_FEATURES = ['center', 'eye_left', 'eye_right', 'mouth_left', 
                     'mouth_center', 'mouth_right', 'nose'];


var getFacesForUrl = function (url, callback) {
  if (!CONFIGURED) { callback(new Error(NOT_CONFIGURED_ERR)); return }
  
  var params = {};
  for (field in FACE_PARAMS) { params[field] = FACE_PARAMS[field] };
  params.urls = url
  var opts = { host: FACE_HOST
             , path: FACE_PATH + '?' + qstring.stringify(params)
             };
  http.get(opts, curry(gettingFaces, [callback]));
}


/**
 * Alright, we're gonna clean up the face.com response JSON a little bit to
 * better suit my workflow.
 * What we're gonna return is an object that looks like this:
 * 
 *    { faces:    [ <A modified Face.com 'tags' object (see below)> ]
 *    , metadata: <All the keys usually found on a face.com faces-detect 
 *                 API response object, like 'status' (see their docs)>
 *    , usage:    <A Face.com 'usage' object (see their docs)>
 *    }
 *    
 * The objects in the 'faces' array are slightly modified versions of the 'tags'
 * objects of a photo object in the face.com API response object for their
 * faces-detect endpoint. 
 * The only modification is that the dimensions on all the feature objects, such
 * as `nose` and `eye_left`, are divided by 100, so that they are normalized.
 **/
var gettingFaces = function (res, callback) {
  var faceJson = "";
  res.on('data', function (chunk) {
    faceJson += chunk;
  });
  res.on('error', function (err) {
    callback(err);
  });
  res.on('end', function () {
    try {
      faceRes = JSON.parse(faceJson);
    } catch(err) {
      callback(err);
    }
    
    faceRes.metadata = {};
    for (key in faceRes) {
      var keyType = typeof(faceRes[key]);
      if (keyType !== 'object' && keyType !== 'array') {
        faceRes.metadata[key] = faceRes[key];
        delete faceRes[key];
      }
    }
    
    faceRes.faces = [];
    if (faceRes.photos === undefined || faceRes.photos.length === 0) {
      delete faceRes.photos;
      callback(null, faceRes);
      return;
    }
    
    var photo = faceRes.photos[0];
    for (i in photo.tags) {
      faceRes.faces[i] = photo.tags[i];
      var face = faceRes.faces[i];
      face.width = face.width / 100.0;
      face.height = face.height / 100.0;
      for (j in FACE_FEATURES) {
        var feature = FACE_FEATURES[j];
        var featureInfo = face[feature];
        if (featureInfo) {
          featureInfo.x = featureInfo.x / 100.0;
          featureInfo.y = featureInfo.y / 100.0;
        }
      }
    }
    delete faceRes.photos;
    callback(null, faceRes);
  });
}


module.exports.getFacesForUrl = getFacesForUrl;
module.exports.configure = function (api_key, api_secret) {
  FACE_PARAMS.api_key = api_key;
  FACE_PARAMS.api_secret = api_secret;
  CONFIGURED = true;
}
