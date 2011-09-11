f7u12rl
=======

< put image of rage queen elizabeth here >


Installation
------------

If you have npm installed, then `npm install f7u12rl`.

You can also clone the git repo with 
`git clone git@github.com/aperiodic/f7u12rl.git`.


Usage
-----

Run the smoke test with `npm test` or `./test/smoketest.sh`.

If it fails, please open a github issue about it and gist the output of the test
script.

If it passes, then copy your face.com API key and secret into the
default.conf.json file, and start the server with `./server.js`.
Now you can navigate to localhost:24718 in your browser, and you'll be looking
at your local copy of f7u12rl!


Roadmap
-------

* Multiple faces for each mood.
* Draw bottoms on faces (the sharp lines look odd).
* Female faces (using face.com gender information if confidence is high, 
  choosing randomly if it's low).
* Chrome extension for automatic rage (just a minor tweak of the Mustachio
  extension).
