var curry = require('curry');
var redis = require('redis');

var ALL_HITS = 'hits';
var ALL_REFS = 'refs';
var POPULARITY = 'hot';

var rc;
 

var hitsKey = function(key) { return key + '-hits'}
var refsKey = function(key) { return key + '-refs'}

exports.hit = function (key, req) {
  rc.incr(hitsKey(key));
  rc.incr(ALL_HITS);
  rc.zincrby(POPULARITY, 1, key);
  
  var referrer = req.headers['referer'] || 'none';
  rc.zincrby(refsKey(key), 1, referrer);
  rc.zincrby(ALL_REFS, 1, referrer);
}

exports.configure = function (redisClient) {
  rc = redisClient;
}
