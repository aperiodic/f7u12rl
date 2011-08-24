var fs = require('fs');

var Canvas = require('canvas');
var Image = Canvas.Image;


var SIZE_FILTER_REGEX = /_256h.png$/;
var NAME_SELECT_REGEX = /^(.*)_256h.png$/;
var FACES_PATH = __dirname + '/../resources/faces';


var faceFiles = fs.readdirSync(FACES_PATH);
var faces = {};
for (i in faceFiles) {
  var faceFile = faceFiles[i];
  if (faceFile.match(SIZE_FILTER_REGEX)) {
    var face_data = fs.readFileSync(FACES_PATH + '/' + faceFile);
    var name = faceFile.match(NAME_SELECT_REGEX)[1];
    var face = new Image;
    face.src = face_data;
    faces[name] = face;
  }
}

var random = function () {
  var moods = [];
  for (mood in faces) {
    moods.push(mood);
  }
  mood = moods[Math.floor(Math.random() * moods.length)];
  return faces[mood];
}

module.exports.faces = faces;
module.exports.random = random;
