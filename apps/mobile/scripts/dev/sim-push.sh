#!/usr/bin/env bash
# Send a synthetic push to the booted iOS simulator without going through Expo's
# servers. The .apns JSON includes the same "data" payload the real server
# would send, so the push-tap-listener exercises the production code path.
#
# Usage:
#   ./scripts/dev/sim-push.sh                     # uses birthday-push.apns
#   ./scripts/dev/sim-push.sh path/to/other.apns  # any other payload
#
# Requirements:
#   • iOS Simulator booted (Xcode → Open Developer Tool → Simulator)
#   • The app installed on that sim (run `pnpm ios` once)
#   • The app NOT in the foreground when you fire — push appears as a banner
#     only when backgrounded or killed (iOS limitation; foreground delivery
#     follows a different code path that is already covered by inbox tests)
#
# The `Simulator Target Bundle` key in the .apns tells simctl which app to
# wake — must match `expo.ios.bundleIdentifier` in app.json.

set -euo pipefail

cd "$(dirname "$0")/../.."

PAYLOAD="${1:-scripts/dev/birthday-push.apns}"

if [ ! -f "$PAYLOAD" ]; then
  echo "Payload not found: $PAYLOAD" >&2
  exit 1
fi

DEVICE_ID="$(xcrun simctl list devices booted | awk -F'[()]' '/Booted/ {print $2; exit}')"
if [ -z "$DEVICE_ID" ]; then
  echo "No booted simulator found. Open Simulator and boot an iPhone first." >&2
  exit 1
fi

echo "→ Sending $PAYLOAD to simulator $DEVICE_ID"
xcrun simctl push "$DEVICE_ID" "$PAYLOAD"
echo "✓ Pushed. Background the app to see the banner, then tap it."
