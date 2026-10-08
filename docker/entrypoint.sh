#!/bin/sh
set -eu

STATE_DIR="${STATE_DIR:-/data/wrangler}"
mkdir -p "$STATE_DIR"

node ./node_modules/wrangler/bin/wrangler.js d1 execute site-creator-d1 \
  --local \
  --config ./dist/server/wrangler.json \
  --persist-to "$STATE_DIR" \
  --file ./docker/init.sql

exec node ./node_modules/wrangler/bin/wrangler.js dev \
  --config ./dist/server/wrangler.json \
  --local \
  --persist-to "$STATE_DIR" \
  --ip 0.0.0.0 \
  --port 3000 \
  --inspector-port 0
