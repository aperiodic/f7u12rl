#!/usr/bin/env node

var canvas = require('canvas');

var fc = require('../lib/faceclient.js');


var gotFaceData = function (err, data) {
  //data = JSON.parse(data);
  console.log(data);
}

var imgUrl = process.argv[2];

if (!imgUrl || imgUrl === "-h" || imgUrl === "--help") {
  console.error("usage: faceclient_tester url [url ...]");
  process.exit(1);
}

console.log("Fetching face data for image at url: " + imgUrl);
fc.getFaceDataForUrl(imgUrl, gotFaceData);
