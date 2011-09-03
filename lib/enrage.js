var Canvas = require('canvas');
var Image = Canvas.Image;
var curry = require('curry');

var imageFetcher = require('./imagefetcher.js');
var faceClient = require('./faceclient.js');
var rage = require('./ragefaces.js');



var intransientError = function(code) {
  switch(code) {
    case 20:
    case 21:
    case 31:
    case 33:
    case 34:
      return true;
    default:
      return false;
  }
}


var enrageUrl = function(urlString, callback) {
  var imageInfo = { data:  undefined
              , faces: undefined
              , url:   urlString
              };
  faceClient.getFacesForUrl(urlString, curry([imageInfo, callback], gotImageFaces));
  imageFetcher.fetch(urlString, curry([imageInfo, callback], gotImageData));
}


var gotImageFaces = function(imageInfo, callback, err, faceRes) {
  if (err) {
    callback(err);
    return;
  }
  
  var metadata = faceRes.metadata;
  if (metadata.status !== 'success') {
    if (intransientError(metadata.error_code)) {
      var e = new Error(metadata.error_message);
      e.type = "File not found";
      e.statuscode = 404;
    } else {
      var e = new Error("Face.com API Error: " + faceRes.metadata.error_code +
                        " " + faceRes.metadata.error_message);
      e.type = "Face.com API Error";
      e.statuscode = 500;
    }
    callback(e);
    return;
  }
  
  imageInfo.faces = faceRes.faces;
  if (imageInfo.data && imageInfo.faces) {
    drawRageFaces(imageInfo, callback);
  }
}


var gotImageData = function(imageInfo, callback, err, data) {
  if (err) {
    callback(err);
    return;
  }
  
  imageInfo.data = new Buffer(data, 'binary');
  if (imageInfo.data && imageInfo.faces) {
    drawRageFaces(imageInfo, callback);
  }
}
  
  
var drawRageFaces = function (imageInfo, callback) {
  if (imageInfo.faces.length === 0) {
    callback(null, null, imageInfo);
    return;
  }
  
  var img = new Image();
  img.src = imageInfo.data;
  var iw = img.width;
  var ih = img.height;
  
  var canvas = new Canvas(iw, ih);
  var ctx = canvas.getContext('2d');
  try {
    ctx.drawImage(img, 0, 0);
  } catch (err) {
    if (err.message === "Image given has not completed loaded") {
      var e = new Error('Could not load image');
      e.type = "Canvas drawing error";
      e.statuscode = 500;
      callback(e);
      return;
    }
    callback(err);
  }
  
  var faces = imageInfo.faces;
  for (i in faces) {
    var face = faces[i];
    var attributes = face.attributes;
    if (attributes.face.confidence <= 55) continue;
    if (attributes && attributes.mood && attributes.mood.confidence >= 60) {
      var rageface = rage.faces[attributes.mood.value];
    } else {
      var rageface = rage.random();
    }
      
    ctx.save();
    
    ctx.translate(face.center.x * iw, face.center.y * ih);
    ctx.rotate(face.roll / 180.0 * Math.PI);
    var fscale = (face.height * ih) / rageface.height * 1.5;
    var fwidth = fscale * rageface.width;
    var fheight = fscale * rageface.height;
    ctx.drawImage(rageface, -fwidth/2.0, -fheight/2.0, fwidth, fheight);
    
    ctx.restore();
  }
  
  callback(null, canvas.toBuffer(), imageInfo);
}

module.exports.enrageUrl = enrageUrl;
module.exports.configure = function (api_key, api_secret) {
  faceClient.configure(api_key, api_secret);
}
