#!/usr/bin/env bash
# Run before every release. Stops at the first failure.
#   1. rules tests (incl. 4-day random play with resource books audited)
#   2. production build
#   3. UI play-check through every control, rotation, night, save/reload, game over
#   4. play bot: plays with the joystick and action button, audits resources while playing
set -e
cd "$(dirname "$0")/.."
npm test
npx vite build
(npx vite preview --port 4173 >/dev/null 2>&1 &) ; sleep 2
node tools/ui-check.cjs out/ui
node tools/play-bot.cjs 2
echo "RELEASE CHECK: ALL PASSED"
