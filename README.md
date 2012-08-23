[![build status](https://secure.travis-ci.org/aperiodic/f7u12rl.png)](http://travis-ci.org/aperiodic/f7u12rl)
f7u12rl
=======

Check out [the live demo](http://f7u12rl.com).

Installation
------------

`npm install f7u12rl`.

You can also clone the git repo with 
`git clone git@github.com:aperiodic/f7u12rl.git`, but you'll need to install the
dependencies with `npm install` in the repo root.


Usage
-----

Copy your face.com API key and secret into the default.conf.json file, then run
the smoke test with `npm test` or `./test/smoketest.sh`.

If it fails, please open a github issue about it and gist the output of the test
script.

If it passes, then navigate to localhost:24718 in your browser, and you'll be 
looking at your local copy of f7u12rl!


Roadmap
-------

* Multiple faces for each mood.
* Draw bottoms on faces (the sharp lines look odd).
* Female faces (using face.com gender information if confidence is high, 
  choosing randomly if it's low).
* Chrome extension for automatic rage (just a minor tweak of the Mustachio
  extension).
