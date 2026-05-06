#!/usr/bin/env bash
set -euo pipefail

# Load .env.test so EXPO_PUBLIC_API_URL / APP_WEB_URL / BASE_URL get baked
# into the release JS bundle (those vars are read at bundle time, not at
# runtime — see "Bundled env vars vs runtime env vars" in the test plan).
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
  # Ensure Xcode's bundle phase uses the E2E API env baked into the release JS bundle.
  cat > ios/.xcode.env.local <<EOF
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
