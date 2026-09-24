#!/usr/bin/env bash
# Checks the library and runs both example apps on iOS and Android.
#
#   scripts/verify.sh [options]
#
# Steps:
#   1. JS: build, tests, and the example's typecheck.
#   2. For each app and platform: build, install, and run the Maestro flows
#      (maestro/walkthrough.yaml and maestro/regression.yaml), failing on a
#      flow failure or a crash.
#
# Options:
#   --app main|legacy   Only this example app (default: both).
#   --ios, --android    Only this platform (default: both).
#   --js-only           Only the JS checks.
#   --no-js             Skip the JS checks.
#   --pods              Run `pod install` even if Pods are already installed.
#   --ref <git-ref>     Test the library code (src/, ios/, android/) from this ref
#                       instead of the working tree, e.g. `--ref main` for a
#                       "before" run. The working tree is restored afterwards.
#
# Environment:
#   IOS_SIMULATOR   Simulator name to use (default: a booted iPhone, else the
#                   first available iPhone).
#   ANDROID_AVD     Emulator to start if no device is connected (default: the
#                   first AVD).
#
# Needs Node 22+, Xcode with CocoaPods via Bundler, JDK 17+, the Android SDK
# with an emulator, and Maestro (https://maestro.dev). Output (logs,
# screenshots, crash reports) goes to verify-output/<timestamp>/.

set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
APPS=(main legacy)
PLATFORMS=(ios android)
RUN_JS=1
RUN_APPS=1
FORCE_PODS=0
REF=""

while [ $# -gt 0 ]; do
    case "$1" in
        --app) APPS=("$2"); shift ;;
        --ios) PLATFORMS=(ios) ;;
        --android) PLATFORMS=(android) ;;
        --js-only) RUN_APPS=0 ;;
        --no-js) RUN_JS=0 ;;
        --pods) FORCE_PODS=1 ;;
        --ref) REF="$2"; shift ;;
        -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
    shift
done

OUT="$ROOT/verify-output/$(date +%Y%m%d-%H%M%S)${REF:+-$(echo "$REF" | tr '/' '-')}"
mkdir -p "$OUT"
RESULTS=()
FAILED=0
METRO_PID=""

say() { echo "==> $*"; }
record() { # status, name, detail
    RESULTS+=("$(printf '%-4s  %s%s' "$1" "$2" "${3:+  ($3)}")")
    [ "$1" = PASS ] || FAILED=1
    echo "    $1: $2${3:+ ($3)}"
}

# --- Setup ---------------------------------------------------------------

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 22 ]; then
    echo "Node 22+ is required (found $(node --version 2>/dev/null || echo none)). The repo's .node-version pins 24." >&2
    exit 1
fi

MAESTRO=$(command -v maestro || echo "$HOME/.maestro/bin/maestro")
if [ "$RUN_APPS" = 1 ] && lsof -ti tcp:8081 -sTCP:LISTEN > /dev/null 2>&1; then
    echo "Port 8081 is in use. Stop your packager before running this script." >&2
    exit 1
fi
if [ "$RUN_APPS" = 1 ] && [ ! -x "$MAESTRO" ]; then
    echo "Maestro is required: https://maestro.dev" >&2
    exit 1
fi

# With --ref, swap in the library code from that ref and restore it on exit.
LIB_PATHS=(src ios android)
BACKUP=""
restore_library() {
    if [ -n "$BACKUP" ]; then
        say "Restoring the working tree's library code"
        for p in "${LIB_PATHS[@]}"; do
            rm -rf "${ROOT:?}/$p"
            cp -R "$BACKUP/$p" "$ROOT/$p"
        done
        git -C "$ROOT" reset -q -- "${LIB_PATHS[@]}"
        rm -rf "$BACKUP"
        BACKUP=""
    fi
}
stop_metro() {
    if [ -n "$METRO_PID" ]; then
        kill "$METRO_PID" 2>/dev/null
        # npx starts Metro as a child process; whatever is still listening on the
        # port is ours because it was free when we started. (A plain lsof also
        # lists clients such as the app and the emulator's network service.)
        lsof -ti tcp:8081 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
        METRO_PID=""
    fi
}
cleanup() {
    stop_metro
    restore_library
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if [ -n "$REF" ]; then
    git -C "$ROOT" rev-parse --verify -q "$REF^{commit}" > /dev/null || { echo "Unknown ref: $REF" >&2; exit 1; }
    BACKUP=$(mktemp -d)
    for p in "${LIB_PATHS[@]}"; do
        cp -R "$ROOT/$p" "$BACKUP/$p"
        rm -rf "${ROOT:?}/$p"
    done
    git -C "$ROOT" checkout -q "$REF" -- "${LIB_PATHS[@]}"
    say "Testing library code from $REF ($(git -C "$ROOT" rev-parse --short "$REF"))"
fi

app_dir() { [ "$1" = main ] && echo "$ROOT/ReactNativeFastImageExample" || echo "$ROOT/ReactNativeFastImageExampleLegacy"; }
app_name() { [ "$1" = main ] && echo ReactNativeFastImageExample || echo ReactNativeFastImageExampleLegacy; }
ios_bundle_id() { echo "org.reactjs.native.example.$(app_name "$1")"; }
android_package() { [ "$1" = main ] && echo com.reactnativefastimageexample || echo com.reactnativefastimageexamplelegacy; }

ensure_node_modules() { # dir
    if [ ! -d "$1/node_modules" ]; then
        say "Installing dependencies in ${1#"$ROOT"/}"
        (cd "$1" && yarn install --frozen-lockfile) > "$OUT/yarn-$(basename "$1").log" 2>&1
    fi
}

start_metro() { # app
    say "Starting Metro for $1"
    (cd "$(app_dir "$1")" && exec npx react-native start --port 8081) > "$OUT/metro-$1.log" 2>&1 &
    METRO_PID=$!
    for _ in $(seq 1 60); do
        curl -s http://localhost:8081/status 2>/dev/null | grep -q running && return 0
        sleep 1
    done
    echo "Metro didn't start; see $OUT/metro-$1.log" >&2
    return 1
}

run_flows() { # app, platform, device, app id
    local ok=1 flow
    for flow in walkthrough regression; do
        local dir="$OUT/$1-$2"
        mkdir -p "$dir"
        # Flows save screenshots relative to the working directory.
        if (cd "$dir" && "$MAESTRO" --device "$3" test -e APP_ID="$4" "$ROOT/maestro/$flow.yaml") > "$dir/$flow.log" 2>&1; then
            record PASS "$1 $2 $flow"
        else
            record FAIL "$1 $2 $flow" "see ${dir#"$ROOT"/}/$flow.log"
            ok=0
        fi
    done
    [ "$ok" = 1 ]
}

# --- JS ------------------------------------------------------------------

if [ "$RUN_JS" = 1 ]; then
    say "JS checks"
    ensure_node_modules "$ROOT"
    (cd "$ROOT" && yarn -s build) > "$OUT/js-build.log" 2>&1 && record PASS "library build" || record FAIL "library build" "see verify-output log"
    (cd "$ROOT" && CI=true yarn -s test) > "$OUT/js-test.log" 2>&1 && record PASS "library tests" || record FAIL "library tests" "see verify-output log"
    ensure_node_modules "$ROOT/ReactNativeFastImageExample"
    (cd "$ROOT/ReactNativeFastImageExample" && yarn -s typecheck) > "$OUT/js-typecheck.log" 2>&1 && record PASS "example typecheck" || record FAIL "example typecheck" "see verify-output log"
fi

# --- iOS -----------------------------------------------------------------

ios_udid() {
    xcrun simctl list devices available -j | node -e '
        const want = process.env.IOS_SIMULATOR
        const devices = Object.entries(JSON.parse(require("fs").readFileSync(0, "utf8")).devices)
            .filter(([runtime]) => runtime.includes("iOS"))
            .flatMap(([, list]) => list)
            .filter((d) => d.isAvailable && d.name.startsWith("iPhone"))
        const pick = want
            ? devices.find((d) => d.name === want)
            : devices.find((d) => d.state === "Booted") || devices[0]
        if (pick) console.log(pick.udid)'
}

verify_ios() { # app
    local app=$1 dir name udid start
    dir=$(app_dir "$app")
    name=$(app_name "$app")
    udid=$(ios_udid)
    if [ -z "$udid" ]; then record FAIL "$app ios" "no iPhone simulator found"; return; fi
    xcrun simctl boot "$udid" > /dev/null 2>&1
    xcrun simctl bootstatus "$udid" -b > /dev/null 2>&1

    if [ "$FORCE_PODS" = 1 ] || [ ! -d "$dir/ios/Pods" ]; then
        say "pod install ($app)"
        if ! (cd "$dir" && bundle install && cd ios && bundle exec pod install) > "$OUT/pods-$app.log" 2>&1; then
            record FAIL "$app ios pod install" "see verify-output log"; return
        fi
    fi

    say "Building $app for iOS"
    if ! (cd "$dir/ios" && xcodebuild -workspace "$name.xcworkspace" -scheme "$name" -configuration Debug \
        -sdk iphonesimulator -destination "platform=iOS Simulator,id=$udid" -derivedDataPath build) \
        > "$OUT/ios-build-$app.log" 2>&1; then
        record FAIL "$app ios build" "$(grep -m1 -E ': error:' "$OUT/ios-build-$app.log" | cut -c1-160)"; return
    fi
    record PASS "$app ios build"
    xcrun simctl install "$udid" "$dir/ios/build/Build/Products/Debug-iphonesimulator/$name.app"

    start_metro "$app" || { record FAIL "$app ios metro"; return; }
    start=$(date +%s)
    run_flows "$app" ios "$udid" "$(ios_bundle_id "$app")"
    local crash
    for crash in "$HOME"/Library/Logs/DiagnosticReports/"$name"-*.ips; do
        [ -f "$crash" ] && [ "$(stat -f %m "$crash")" -ge "$start" ] || continue
        cp "$crash" "$OUT/"
        record FAIL "$app ios crash" "$(basename "$crash")"
    done
    stop_metro
}

# --- Android -------------------------------------------------------------

ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
ADB="$ANDROID_HOME/platform-tools/adb"

ensure_java() {
    local major
    major=$(java -version 2>&1 | awk -F'"' '/version/ {split($2, v, "."); print v[1]}')
    if [ "${major:-0}" -lt 17 ] || [ "${major:-0}" -gt 21 ]; then
        # Prefer JDK 17 for Gradle.
        local jdk
        jdk=$(/usr/libexec/java_home -v 17 2>/dev/null || true)
        [ -z "$jdk" ] && [ -d /opt/homebrew/opt/openjdk@17 ] && jdk=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
        [ -n "$jdk" ] && export JAVA_HOME="$jdk"
    fi
}

android_serial() {
    local serial avd
    serial=$("$ADB" devices | awk 'NR > 1 && $2 == "device" {print $1; exit}')
    if [ -z "$serial" ]; then
        avd=${ANDROID_AVD:-$("$ANDROID_HOME/emulator/emulator" -list-avds | head -1)}
        [ -z "$avd" ] && return 1
        say "Starting emulator $avd" >&2
        "$ANDROID_HOME/emulator/emulator" -avd "$avd" -no-snapshot-save -no-boot-anim > "$OUT/emulator.log" 2>&1 &
        "$ADB" wait-for-device
        until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
        serial=$("$ADB" devices | awk 'NR > 1 && $2 == "device" {print $1; exit}')
    fi
    echo "$serial"
}

verify_android() { # app
    local app=$1 dir serial pkg
    dir=$(app_dir "$app")
    pkg=$(android_package "$app")
    ensure_java
    serial=$(android_serial) || { record FAIL "$app android" "no device or emulator"; return; }

    say "Building $app for Android"
    if ! (cd "$dir/android" && ./gradlew app:assembleDebug --console=plain -q) > "$OUT/android-build-$app.log" 2>&1; then
        record FAIL "$app android build" "see verify-output log"; return
    fi
    record PASS "$app android build"
    "$ADB" -s "$serial" install -r "$dir/android/app/build/outputs/apk/debug/app-debug.apk" > /dev/null
    "$ADB" -s "$serial" reverse tcp:8081 tcp:8081 > /dev/null
    "$ADB" -s "$serial" logcat -b crash -c

    start_metro "$app" || { record FAIL "$app android metro"; return; }
    run_flows "$app" android "$serial" "$pkg"
    if "$ADB" -s "$serial" logcat -b crash -d | grep -q "$pkg"; then
        "$ADB" -s "$serial" logcat -b crash -d > "$OUT/android-crash-$app.log"
        record FAIL "$app android crash" "see verify-output log"
    fi
    stop_metro
}

# --- Run -----------------------------------------------------------------

if [ "$RUN_APPS" = 1 ]; then
    for app in "${APPS[@]}"; do
        ensure_node_modules "$(app_dir "$app")"
        for platform in "${PLATFORMS[@]}"; do
            "verify_$platform" "$app"
        done
    done
fi

echo
echo "Summary${REF:+ (library from $REF)}:"
printf '  %s\n' "${RESULTS[@]}"
echo "Output: ${OUT#"$ROOT"/}"
if printf '%s\n' "${RESULTS[@]}" | grep -qE '^FAIL.*android (walkthrough|regression)'; then
    echo "If Android flows fail on screens that look fine, restart the emulator (adb emu kill); long-running emulators can stop reporting their UI to Maestro."
fi
exit $FAILED
