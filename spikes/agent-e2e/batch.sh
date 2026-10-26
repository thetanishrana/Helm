#!/bin/zsh
# Repeat the key scenarios and the long hold; append RESULT lines to $1.
OUTF=$1; : > $OUTF
run() { label=$1; shift; echo "## $label" >> $OUTF; env "$@" node e2e-gate.mjs 2>&1 | grep -E "^RESULT|AGENT OUTPUT" -A0 | grep RESULT >> $OUTF; pkill -f "remote-debugging-port=9222"; sleep 2; }
for i in 1 2 3; do run "approve/refresh #$i" APPROVE_MS=6000 TASK=refresh; done
for i in 1 2 3; do run "approve/form #$i" APPROVE_MS=6000 TASK=form; done
for i in 1 2 3; do run "deny-text/refresh #$i" APPROVE_MS=4000 USER_DECISION=deny DENY_MODE=text TASK=refresh; done
for i in 1 2; do run "deny-text/form #$i" APPROVE_MS=4000 USER_DECISION=deny DENY_MODE=text TASK=form; done
for i in 1 2; do run "retry-fault/refresh #$i" APPROVE_MS=25000 FAULT_DROP_MS=8000 TASK=refresh; done
run "long-hold 660s" APPROVE_MS=660000 RUN_TIMEOUT_MS=800000 TASK=refresh
echo DONE >> $OUTF
