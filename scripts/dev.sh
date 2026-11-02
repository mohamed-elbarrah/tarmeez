#!/usr/bin/env bash

set -e

pnpm --filter api dev &
api_pid=$!

cleanup() {
  kill "$api_pid" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Waiting for the API on port 4000..."
until (echo > /dev/tcp/127.0.0.1/4000) 2>/dev/null; do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    echo "API stopped before port 4000 became available."
    exit 1
  fi
  sleep 1
done

echo "API is ready. Starting the frontend..."
pnpm --filter web dev
