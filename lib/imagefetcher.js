#!/usr/bin/env node

var earl = require('url');
var http = require('http');

var curry = require('curry');



var getImage = function(url, callback) {
  var urlInfo = earl.parse(url);
  var reqOpts = {}
  reqOpts.host = urlInfo.host;
  reqOpts.port = 80;
  reqOpts.path = urlInfo.pathname;
  
  http.get(reqOpts, curry(gettingImgData, [callback]));
}


var gettingImgData = function(res, callback) {
  res.setEncoding('binary');
  var imgData = '';
  res.on('data', function (chunk) {
    imgData += chunk;
  });
  res.on('error', function (err) {
    callback(err);
  });
  res.on('end', function () {
    callback(null, imgData);
  });
}

module.exports.fetch = getImage;
