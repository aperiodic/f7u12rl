#!/bin/bash

# Yeah, no *real* tests yet, just a basic sanity check.

# cd to directory containing this file (hope nobody's piping this into bash from
# curl or something weird like that).
cd `dirname $0`

# launch the server backgrounded
printf "launching server..."
../server.js --conf ../conf/default.json &
sleep 1
printf "OK\n"


# wget it (it's using the default conf, so it'll be on port 24712 (note 247 is
# the decimal value of the hex 0xf7, 'u' is elided as it's not a hex 
# character, and 18 is the decimal value of 0x12.
echo "Retrieving index..."
wget localhost:24718
WGET_STATUS=$?

kill %1 &>/dev/null
rm index.html*

if (( WGET_STATUS == 0 )); then
  echo "Index retrieved!"
  echo ""
  echo "test passed!"
else
  printf "ERR\n"
  echo ""
  echo "Test failed!"
  echo "If you have a github account, please open an issue at"
  echo "http://github.com/aperiodic/f7u12rl/issues. Make sure to include any output that"
  echo "appeared in your terminal from the server or wget, as well as the version of"
  echo "node that you're using."
  exit 1
fi
