#!/bin/bash

EXP_START=4
EXP_STOP=9

if [[ $1 == '-h' || $1 == '--help' ]]; then
  echo "Usage: $0 [exp_start] [exp_stop]" 1>&2
  echo "" 1>&2
  echo "Produces scaled versions of all png images in the ./originals directory, saving" 1>&2
  echo 'them in the ./mipmaps directory. The scaled images start at 2^exp_start pixels' 1>&2 
  echo 'tall, and end at 2^exp_stop pixels tall, inclusive. By default, exp_start is 4,' 1>&2
  echo 'and exp_stop is 9.' 1>&2
  exit 1
fi

if [[ ! -z $1 ]]; then
  EXP_START=$1
fi
if [[ ! -z $2 ]]; then
  EXP_STOP=$2
fi

if [[ ! -d 'mipmaps' ]]; then 
  mkdir mipmaps;
fi

source_images=`ls originals/*.png`
for img in $source_images; do
  img_name=`basename $img`
  for (( exp=$EXP_START; exp <= $EXP_STOP; exp++ )); do
    size=$(( 2**$exp ))
    resized_img_name=`echo $img_name | sed "s/.png$/_$size.png/"`
    convert $img -filter hamming -resize x$size mipmaps/$resized_img_name
  done
done
