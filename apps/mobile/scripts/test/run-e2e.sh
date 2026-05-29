#!/usr/bin/env bash
set -euo pipefail

# Load .env.test into the environment so subsequent commands (and the
# backgrounded Expo server) see E2E_*, RESEND/EXPO/ADMIN tokens, DATABASE_URL,
# RESET_TOKEN_TTL_MINUTES, etc. without needing dotenv-cli installed.
if [ -f .env.test ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.test
  set +a
fi

PLATFORM="${1:-ios}"
API_PORT=8010
FLOW="${2:-}" # Optional: specific flow file to run
API_BASE_URL="http://127.0.0.1:${API_PORT}"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR_NAME:-iPhone 17}"
ANDROID_AVD="${ANDROID_AVD:-Pixel_3a_API_34_extension_level_7_arm64-v8a}"
IOS_APP_ID="${APP_ID_IOS:-com.steva.borus.baza-pilates}"
ANDROID_APP_ID="${APP_ID_ANDROID:-com.steva.borus.bazapilates}"
ANDROID_APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
ANDROID_SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
ANDROID_EMULATOR_BIN="${ANDROID_SDK_DIR}/emulator/emulator"
PASSWORD_RESET_EMAIL="${E2E_CLIENT_EMAIL:-client.active.reformer@e2e.test}"
PASSWORD_RESET_NEW_PASSWORD="${E2E_CLIENT_RESET_PASSWORD:-Password123!Reset1}"
RESET_TOKEN_CAPTURE_FILE="${E2E_RESET_TOKEN_FILE:-.maestro/.tmp/password-reset-token.json}"
FORCE_API_SERVER_RESTART="false"

if [ "$FLOW" = "password-reset.yaml" ]; then
  FORCE_API_SERVER_RESTART="true"
fi

cleanup() {
  echo "==> Cleaning up background processes"
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_api_server() {
  echo "==> Waiting for API server..."
  for i in $(seq 1 30); do
    if curl -sf "${API_BASE_URL}/api/health" > /dev/null 2>&1; then
      echo "==> API server ready"
      return 0
    fi
    sleep 2
  done

  echo "==> API server failed to start"
  exit 1
}

stop_existing_api_server() {
  local existing_pids
  existing_pids="$(lsof -ti "tcp:${API_PORT}" || true)"

  if [ -n "$existing_pids" ]; then
    echo "==> Restarting API server on port $API_PORT"
    kill $existing_pids 2>/dev/null || true
    sleep 2
  fi
}

wait_for_android_boot() {
  echo "==> Waiting for Android emulator to boot"
  adb wait-for-device
  for i in $(seq 1 90); do
    if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
      echo "==> Android emulator booted"
      return 0
    fi
    sleep 2
  done

  echo "==> Android emulator failed to boot"
  exit 1
}

wait_for_android_package_service() {
  echo "==> Waiting for Android package manager"
  for i in $(seq 1 45); do
    if adb shell pm list packages > /dev/null 2>&1; then
      echo "==> Android package manager ready"
      return 0
    fi
    sleep 2
  done

  echo "==> Android package manager failed to become ready"
  return 1
}

ensure_android_emulator() {
  if adb devices | awk 'NR > 1 && $2 == "device" && $1 ~ /^emulator-/' | grep -q .; then
    echo "==> Reusing booted Android emulator"
    wait_for_android_boot
    wait_for_android_package_service || {
      echo "==> Package manager unhealthy on running emulator, rebooting"
      adb reboot
      wait_for_android_boot
      wait_for_android_package_service
    }
    return 0
  fi

  if [ ! -x "$ANDROID_EMULATOR_BIN" ]; then
    echo "==> ERROR: Android emulator binary not found at $ANDROID_EMULATOR_BIN"
    exit 1
  fi

  echo "==> Booting Android emulator: $ANDROID_AVD"
  "$ANDROID_EMULATOR_BIN" -avd "$ANDROID_AVD" -no-snapshot-load -no-boot-anim > /dev/null 2>&1 &
  wait_for_android_boot
  wait_for_android_package_service
}

install_android_app() {
  if [ ! -f "$ANDROID_APK_PATH" ]; then
    echo "==> ERROR: Android APK not found at $ANDROID_APK_PATH. Run build-e2e.sh first."
    exit 1
  fi

  adb reverse "tcp:${API_PORT}" "tcp:${API_PORT}" > /dev/null

  if ! adb install -r "$ANDROID_APK_PATH"; then
    echo "==> Android install failed, rebooting emulator and retrying once"
    adb reboot
    wait_for_android_boot
    wait_for_android_package_service
    adb reverse "tcp:${API_PORT}" "tcp:${API_PORT}" > /dev/null
    adb install -r "$ANDROID_APK_PATH"
  fi

  # Warm-launch once so first-run startup work doesn't race Maestro.
  adb shell monkey -p "$ANDROID_APP_ID" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1 || true
  sleep 2
  adb shell am force-stop "$ANDROID_APP_ID" > /dev/null 2>&1 || true
}

read_captured_reset_token() {
  for i in $(seq 1 15); do
    local token
    token="$(
      pnpm exec tsx scripts/test/get-latest-reset-token.ts "$PASSWORD_RESET_EMAIL" 2>/dev/null
    )" && {
      printf "%s" "$token"
      return 0
    }
    sleep 1
  done

  echo "==> ERROR: Failed to read captured reset token"
  return 1
}

# Prepare test database and seed data
echo "==> Preparing test database"
pnpm test:e2e:prepare

# Start the Expo web server in background to serve API routes
if [ "$FORCE_API_SERVER_RESTART" = "true" ]; then
  stop_existing_api_server
fi

if curl -sf "${API_BASE_URL}/api/health" > /dev/null 2>&1; then
  echo "==> Reusing existing API server on port $API_PORT"
else
  echo "==> Starting API server on port $API_PORT"
  # .env.test was sourced above; CI=1 + NODE_OPTIONS keep Metro stable.
  CI=1 NODE_OPTIONS="--max-old-space-size=8192" pnpm exec expo start --web --port "$API_PORT" &
  SERVER_PID=$!
  wait_for_api_server
fi

# Install app on simulator (iOS only)
if [ "$PLATFORM" = "ios" ]; then
  APP_PATH="ios/build/Build/Products/Release-iphonesimulator/BazaPilates.app"
  if [ ! -d "$APP_PATH" ]; then
    echo "==> ERROR: App not found at $APP_PATH. Run build-e2e.sh first."
    exit 1
  fi

  echo "==> Installing app on iOS simulator ($IOS_SIMULATOR_NAME)"
  xcrun simctl boot "$IOS_SIMULATOR_NAME" 2>/dev/null || true
  xcrun simctl install booted "$APP_PATH"
  # Warm-launch + terminate so first-run JIT doesn't race Maestro's first action.
  xcrun simctl launch booted "$IOS_APP_ID" > /dev/null 2>&1 || true
  sleep 2
  xcrun simctl terminate booted "$IOS_APP_ID" > /dev/null 2>&1 || true
elif [ "$PLATFORM" = "android" ]; then
  ensure_android_emulator
  install_android_app
fi

# Flow YAMLs declare `appId: ${APP_ID}` so the same files run on both
# platforms. Inject the right bundle/package ID per platform. iOS bundle
# ID is hyphenated (`baza-pilates`), Android package ID is squashed
# (`bazapilates`).
if [ "$PLATFORM" = "ios" ]; then
  MAESTRO_APP_ID="$IOS_APP_ID"
else
  MAESTRO_APP_ID="$ANDROID_APP_ID"
fi
BASE_ENV_ARGS=(-e "APP_ID=$MAESTRO_APP_ID")

# When set, these are appended to maestro test as `-e KEY=VALUE` so flows
# can reference dynamic IDs created by setup. apply_flow_setup populates
# them; reset_flow_env clears them between flows.
FLOW_ENV_ARGS=()

reset_flow_env() {
  FLOW_ENV_ARGS=()
}

apply_flow_setup() {
  local name="$1"
  reset_flow_env
  case "$name" in
    trainer-per-client-profile.yaml | android-trainer-note-edit-delete.yaml)
      echo "==> Linking reformer trainer ↔ active reformer client"
      pnpm exec tsx scripts/test/seed-extension.ts \
        link-trainer trainer.reformer@e2e.test client.active.reformer@e2e.test \
        > /dev/null
      ;;
  esac
}

run_password_reset_pair() {
  rm -f "$RESET_TOKEN_CAPTURE_FILE"

  # Re-seed so the previous reset doesn't invalidate the user's password.
  echo "==> Re-seeding DB for password-reset pair"
  pnpm test:e2e:prepare

  maestro test --config .maestro/config.yaml --platform "$PLATFORM" "${BASE_ENV_ARGS[@]}" ".maestro/password-reset-request.yaml"

  local token
  token="$(read_captured_reset_token)"

  maestro test \
    --config .maestro/config.yaml \
    --platform "$PLATFORM" \
    "${BASE_ENV_ARGS[@]}" \
    ".maestro/password-reset.yaml" \
    -e EMAIL="$PASSWORD_RESET_EMAIL" \
    -e RESET_TOKEN="$token" \
    -e RESET_PASSWORD="$PASSWORD_RESET_NEW_PASSWORD"
}

# Run Maestro tests
echo "==> Running Maestro E2E tests"
if [ -n "$FLOW" ]; then
  if [ "$FLOW" = "password-reset.yaml" ]; then
    run_password_reset_pair
  else
    apply_flow_setup "$FLOW"
    if [ ${#FLOW_ENV_ARGS[@]} -gt 0 ]; then
      maestro test --config .maestro/config.yaml --platform "$PLATFORM" "${BASE_ENV_ARGS[@]}" "${FLOW_ENV_ARGS[@]}" ".maestro/$FLOW"
    else
      maestro test --config .maestro/config.yaml --platform "$PLATFORM" "${BASE_ENV_ARGS[@]}" ".maestro/$FLOW"
    fi
  fi
else
  # Run every flow except the password-reset pair (which needs token capture).
  # Each flow gets a freshly-seeded DB so flow ordering and prior mutations
  # never leak in. Mirrors the per-spec-file DB reset used by Phase A
  # Playwright. Failures are recorded but don't halt the loop, so a full
  # red/green summary lands at the end.
  first_flow=1
  failed=()
  passed=()
  for flow in .maestro/*.yaml; do
    name="$(basename "$flow")"
    case "$name" in
      config.yaml|password-reset.yaml|password-reset-request.yaml)
        continue
        ;;
      android-*)
        # Flows that exercise gorhom-bottom-sheet content (e.g. CRUD inside
        # an open BottomSheetModal). XCUITest cannot traverse the sheet's
        # portal, so these only run on Android UiAutomator.
        if [ "$PLATFORM" != "android" ]; then
          continue
        fi
        ;;
    esac
    if [ "$first_flow" -eq 0 ]; then
      echo "==> Re-seeding DB before $name"
      pnpm test:e2e:prepare || true
    fi
    first_flow=0
    apply_flow_setup "$name"
    echo "==> Running $name"
    if [ ${#FLOW_ENV_ARGS[@]} -gt 0 ]; then
      maestro test --config .maestro/config.yaml --platform "$PLATFORM" "${BASE_ENV_ARGS[@]}" "${FLOW_ENV_ARGS[@]}" "$flow" \
        && passed+=("$name") || failed+=("$name")
    else
      maestro test --config .maestro/config.yaml --platform "$PLATFORM" "${BASE_ENV_ARGS[@]}" "$flow" \
        && passed+=("$name") || failed+=("$name")
    fi
  done

  echo "==> Running password-reset pair"
  if run_password_reset_pair; then
    passed+=("password-reset")
  else
    failed+=("password-reset")
  fi

  echo ""
  echo "===== Maestro suite summary ====="
  echo "Passed (${#passed[@]}):"
  for f in "${passed[@]}"; do echo "  ✓ $f"; done
  echo "Failed (${#failed[@]}):"
  for f in "${failed[@]}"; do echo "  ✗ $f"; done
  if [ ${#failed[@]} -gt 0 ]; then
    exit 1
  fi
fi
