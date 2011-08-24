var Canvas = require('canvas');
var Image = Canvas.Image;
var curry = require('curry');

var imageFetcher = require('./imagefetcher.js');
var faceClient = require('./faceclient.js');
var rage = require('./ragefaces.js');



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
    if (metadata.error_code >= 30 && metadata.error_code < 100) {
      var e = new Error(metadata.error_message);
      e.type = "File not found";
      e.code = 404;
    } else {
      var e = new Error("Faces.com API Error: " + faceRes.metadata.error_code +
                        " " + faceRes.metadata.error_message);
      e.type = "Face.com API Error";
      e.code = 500;
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
  ctx.drawImage(img, 0, 0);
  
  var faces = imageInfo.faces;
  for (i in faces) {
    var face = faces[i];
    var attributes = face.attributes;
    if (attributes.face.confidence <= 55) continue;
    if (attributes && attributes.mood && attributes.mood.confidence >= 66) {
      var rageface = rage.faces[attributes.mood.value];
    } else {
      var rageface = rage.random();
    }
      
    ctx.save();
    
    ctx.translate(face.center.x * iw, face.center.y * ih);
    ctx.rotate(face.roll / 180.0 * Math.PI);
    var fscale = (face.height * ih) / rageface.height * 2.0;
    var fwidth = fscale * rageface.width;
    var fheight = fscale * rageface.height;
    ctx.drawImage(rageface, -fwidth/2.0, -fheight/2.0, fwidth, fheight);
    
    ctx.restore();
  }
  
  callback(null, canvas.toBuffer(), imageInfo);
}

module.exports.enrageUrl = enrageUrl;
