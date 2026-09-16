#!/bin/bash
# ALL IN ARCADE — resilient booth server supervisor.
# Detached from any chat session: relaunches serve.py forever.
cd /Users/ryanmonsurate/ALLIN
while true; do
  python3 serve.py >> .fabric/server.log 2>&1
  echo "--- serve.py exited ($?) at $(date) — relaunching in 2s" >> .fabric/server.log
  sleep 2
done
