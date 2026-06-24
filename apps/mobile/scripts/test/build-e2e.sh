#!/usr/bin/env bash
set -euo pipefail

# Load .env.test so EXPO_PUBLIC_API_URL / APP_WEB_URL / BASE_URL get baked
# into the release JS bundle. EXPO_PUBLIC_* is read at bundle time, not at
# runtime — without these in the env, the release JS will hit whatever was
# the default when the bundle was built (usually production), not localhost.
if [ -f .env.test ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.test
  set +a
fi

PLATFORM="${1:-ios}"

export NODE_OPTIONS="--max-old-space-size=8192"

echo "==> Building E2E app for $PLATFORM (release)"

# Generate native projects
echo "==> Running expo prebuild --clean"
pnpm exec expo prebuild --clean

if [ "$PLATFORM" = "ios" ]; then
  # Pin NODE_BINARY for Xcode's build script phases. Expo's `with-node.sh`
  # defaults to `command -v node`, but several pod script phases (e.g.
  # EXConstants' app.config generation) run under a `bash -l` login shell whose
  # PATH can resolve a stale system node (e.g. an old Homebrew /usr/local/bin
  # /node) instead of the project's fnm-managed node. SDK 56's `@expo/env`
  # needs `util.parseEnv` (Node 20.12+), so an old Node 18 makes that phase
  # crash and the whole Release build fails. Capture the node active here (where
  # the project's node is on PATH) and write it so build scripts use it.
  NODE_BINARY="$(command -v node)"
  # Ensure Xcode's bundle phase uses the E2E API env baked into the release JS bundle.
  cat > ios/.xcode.env.local <<EOF
export NODE_BINARY="${NODE_BINARY}"
export NODE_OPTIONS="--max-old-space-size=8192"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-}"
export APP_WEB_URL="${APP_WEB_URL:-}"
export BASE_URL="${BASE_URL:-}"
EOF

  echo "==> Building iOS release for simulator"
  cd ios
  set -o pipefail
  if command -v xcbeautify > /dev/null 2>&1; then
    xcodebuild \
      -workspace BazaPilates.xcworkspace \
      -scheme BazaPilates \
      -configuration Release \
      -sdk iphonesimulator \
      -derivedDataPath build \
      | xcbeautify --is-ci
  else
    xcodebuild \
      -workspace BazaPilates.xcworkspace \
      -scheme BazaPilates \
      -configuration Release \
      -sdk iphonesimulator \
      -derivedDataPath build
  fi
  cd ..

  APP_PATH="ios/build/Build/Products/Release-iphonesimulator/BazaPilates.app"
  if [ -f "$APP_PATH/main.jsbundle" ]; then
    echo "==> iOS build complete: $APP_PATH"
  else
    echo "==> ERROR: Build produced no JS bundle"
    exit 1
  fi

elif [ "$PLATFORM" = "android" ]; then
  # Default ANDROID_HOME / ANDROID_SDK_ROOT to the standard macOS location
  # so `gradlew` can find the SDK without requiring a `local.properties`
  # file (which expo prebuild --clean would clobber every build anyway).
  : "${ANDROID_SDK_ROOT:=${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
  : "${ANDROID_HOME:=$ANDROID_SDK_ROOT}"
  export ANDROID_HOME ANDROID_SDK_ROOT

  # Android emulators hit the host API over adb reverse + HTTP, so allow
  # cleartext traffic in the generated E2E manifest without changing app config.
  python3 - <<'PY'
from pathlib import Path

manifest = Path("android/app/src/main/AndroidManifest.xml")
text = manifest.read_text()
if 'android:usesCleartextTraffic="true"' not in text:
    text = text.replace(
        '<application ',
        '<application android:usesCleartextTraffic="true" ',
        1,
    )
    manifest.write_text(text)
PY

  echo "==> Building Android release APK"
  # D8 dex merger OOMs on default Gradle JVM heap when bundling RN release
  # with Skia + Reanimated + gesture-handler + keyboard-controller + Prisma.
  export GRADLE_OPTS="-Xmx6144m -XX:MaxMetaspaceSize=1024m"
  cd android
  ./gradlew assembleRelease
  cd ..
  echo "==> Android build complete"

else
  echo "Unknown platform: $PLATFORM (use 'ios' or 'android')"
  exit 1
fi
