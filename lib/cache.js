var curry = require('curry');
var redis = require('redis');

var ALL_HITS = 'hits';
var ALL_REFS = 'refs';

var rc;
 

var hitsKey = function(key) { return key + '-hits'}
var refsKey = function(key) { return key + '-refs'}
 
exports.check = function (key, cb) {
  rc.exists(key, cb);
}
 
exports.load = function (key, cb) {
  rc.get(key, cb);
}
 
exports.save = function (key, data) {
  rc.set(key, data);
}

exports.expire = function (key, seconds) {
  rc.expire(key, seconds);
}

exports.requested = function (key, req) {
  rc.incr(hitsKey(key));
  rc.incr(ALL_HITS);
  
  var referrer = req.headers['referer'] || 'none';
  rc.zincrby(refsKey(key), 1, referrer);
  rc.zincrby(ALL_REFS, 1, referrer);
}

exports.configure = function (redisClient) {
  rc = redisClient;
}
