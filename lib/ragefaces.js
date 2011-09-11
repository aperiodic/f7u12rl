/*** MODULES ******************************************************************/

var fs = require('fs');

var Canvas = require('canvas');
var Image = Canvas.Image;



/*** GLOBALS and "CONSTANTS" **************************************************/

var faces = {};

var MIPMAP_FILE_REGEX = /^.*_[\d]+.png$/;
var NAME_SELECT_REGEX = /^(.*)_[\d]+.png$/;
var SIZE_SELECT_REGEX = /^.*_([\d]+).png$/; 
var MIPMAPS_PATH = __dirname + '/../resources/faces/mipmaps';



/*** INTERFACE ****************************************************************/

var face = function (size, mood) {
  if (size === undefined) {
    var targetSize = 256;
  } else {
    var targetSize = firstPowerOfTwoNotLessThan(size);
  }
  
  if (mood === undefined) {
    mood = randomMood();
  }
  return faces[mood][targetSize];
}
module.exports.face = face;



/*** UTILS ********************************************************************/

var randomMood = function () {
  var moods = [];
  for (mood in faces) {
    moods.push(mood);
  }
  return moods[Math.floor(Math.random() * moods.length)];
}

// yeah, it's a long function name, but it's also unambiguous
var firstPowerOfTwoNotLessThan = function (n) {
  return Math.round(Math.pow(2, ceilLog2(n)));
}

var ceilLog2 = function (n) {
  if (n <= 2) {
    return 1;
  } else {
    return 1 + ceilLog2(n / 2);
  }
}



/*** LOAD FACES ***************************************************************/

// note that all this code runs at require-time
var faceFiles = fs.readdirSync(MIPMAPS_PATH);
for (i in faceFiles) {
  var faceFile = faceFiles[i];
  if (faceFile.match(MIPMAP_FILE_REGEX)) {
    var face_data = fs.readFileSync(MIPMAPS_PATH + '/' + faceFile);
    var name = faceFile.match(NAME_SELECT_REGEX)[1];
    var size = faceFile.match(SIZE_SELECT_REGEX)[1] * 1;
    var face = new Image;
    face.src = face_data;
    if (faces[name] == undefined) {
      faces[name] = {}
    }
    faces[name][size] = face;
  }
}
