#!/bin/bash
# systemd ExecStop for waiter.service.
#
# The unit's ExecStart is `varlock run -- bun dist/index.js`, so the service's MainPID is varlock
# (a node process) and the actual app is bun, a *child* of varlock. varlock pipes the child's stdout
# through itself to redact secrets and does NOT forward signals. So we can't let systemd's own
# KillSignal do the stop:
#   - signalling varlock (main) → it dies instantly without telling bun; or
#   - signalling the whole cgroup → varlock dies first, bun's stdout pipe breaks (EPIPE) and its
#     graceful shutdown is cut off mid-way.
#
# Instead we SIGINT bun directly (its process.on("SIGINT") runs the async shutdown handlers) and
# BLOCK until it exits, keeping varlock alive the whole time so bun's logs still reach the journal.
# TimeoutStopSec in the unit is the hard backstop; systemd SIGKILLs if we exceed it.
set -u

# bun is the direct child of MainPID (varlock). $MAINPID is provided by systemd for ExecStop.
BUN=$(pgrep -P "${MAINPID:-0}" 2>/dev/null || true)

if [ -z "$BUN" ]; then
  # Nothing to signal (already gone, or MAINPID unknown) — let systemd proceed.
  exit 0
fi

# Ask the app to shut down gracefully.
kill -INT $BUN 2>/dev/null || true

# Wait for it to finish its shutdown handlers and exit. Cap the wait below TimeoutStopSec so systemd
# still owns the final SIGKILL if the app hangs.
for _ in $(seq 1 550); do   # 550 * 0.2s = 110s
  kill -0 $BUN 2>/dev/null || exit 0
  sleep 0.2
done

exit 0
