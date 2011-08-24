var curry = require('curry');
var redis = require('redis');

var ALL_HITS = 'hits';
var ALL_REFS = 'refs';

var rc;
 

var dataKey = function(src) { return src }
var hitsKey = function(src) { return src + '-hits'}
var refsKey = function(src) { return src + '-refs'}
 
exports.check = function (src, cb) {
  rc.exists(dataKey(src), cb);
}
 
exports.load = function (src, cb) {
  rc.get(dataKey(src), cb);
}
 
exports.save = function (src, data) {
  rc.set(dataKey(src), data);
}

exports.requested = function (src, req) {
  rc.incr(hitsKey(src));
  rc.incr(ALL_HITS);
  
  var referrer = req.headers['referer'] || 'none';
  rc.zincrby(refsKey(src), 1, referrer);
  rc.zincrby(ALL_REFS, 1, referrer);
}

exports.configure = function (redisClient) {
  rc = redisClient;
}
