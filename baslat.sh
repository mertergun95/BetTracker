#!/usr/bin/env bash
# Sync + serve in one go. Leave the terminal open.
cd "$(dirname "$0")" || exit 1
echo "=== Fetching bets from Stake ==="
python3 -m stakebet.cli sync || echo "Sync failed. Serving stored data instead."
echo
echo "=== Starting local server ==="
python3 -m stakebet.cli serve
