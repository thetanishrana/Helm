#!/bin/zsh
# usage: battery.sh outfile model reps task tech...
OUTF=$1; MODEL=$2; REPS=$3; TASK=$4; shift 4
S=${OUTF%.txt}_runs
for t in "$@"; do for i in $(seq $REPS); do
  TECH=$t TASK=$TASK MODEL=$MODEL OUT=$S node e2e-attack.mjs 2>&1 | grep '^RESULT' >> $OUTF
  pkill -f "remote-debugging-port=9222"; sleep 2
done; done
echo DONE >> $OUTF
