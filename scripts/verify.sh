#!/usr/bin/env bash
# Checks the library and runs both example apps on iOS and Android.
#
#   scripts/verify.sh [options]
#
# Steps:
#   1. JS: build, tests, and the example's typecheck.
#   2. For each example app: build for iOS and Android in parallel, start the
#      packager, and run the Maestro flows (maestro/walkthrough.yaml and
#      maestro/regression.yaml) on each platform. A flow failure or a crash
#      fails the run.
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
#                   first AVD). Give it 4 GB+ RAM; it's started with -gpu host.
#   VERIFY_WALKTHROUGH_TIMEOUT, VERIFY_REGRESSION_TIMEOUT, VERIFY_BUILD_TIMEOUT
#                   Per-step time limits in seconds (default 300, 120, 900).
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
        -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
    shift
done

OUT="$ROOT/verify-output/$(date +%Y%m%d-%H%M%S)${REF:+-$(echo "$REF" | tr '/' '-')}"
mkdir -p "$OUT"
# Results are appended to a file because the builds run in parallel
# subshells, which can't update a shared array.
RESULTS="$OUT/results.txt"
: > "$RESULTS"
METRO_PID=""

say() { echo "==> $*"; }

# Time limits so a hung build or Maestro flow fails the run instead of blocking
# it. They're about twice a typical run; raise them with the environment
# variables below if one is hit. Uses coreutils `timeout` (`brew install
# coreutils`); without it, commands run without a limit.
TIMEOUT_BIN=$(command -v timeout || command -v gtimeout || true)
limit() { # seconds, command...
    local seconds=$1
    shift
    if [ -n "$TIMEOUT_BIN" ]; then "$TIMEOUT_BIN" "$seconds" "$@"; else "$@"; fi
}
WALKTHROUGH_TIMEOUT=${VERIFY_WALKTHROUGH_TIMEOUT:-300}
REGRESSION_TIMEOUT=${VERIFY_REGRESSION_TIMEOUT:-120}
# Enough for a clean iOS build (~10 minutes); incremental builds take seconds.
BUILD_TIMEOUT=${VERIFY_BUILD_TIMEOUT:-900}
record() { # status, name, detail
    printf '%-4s  %s%s\n' "$1" "$2" "${3:+  ($3)}" >> "$RESULTS"
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
    # Stop any parallel jobs still running (e.g. after Ctrl-C).
    jobs -p | xargs kill 2>/dev/null
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
    say "Testing library code from $REF ($(git -C "$ROOT" rev-parse --short "$REF")); backup of the working tree's code: $BACKUP"
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
    local flow dir="$OUT/$1-$2"
    mkdir -p "$dir"
    for flow in walkthrough regression; do
        local seconds=$WALKTHROUGH_TIMEOUT
        [ "$flow" = regression ] && seconds=$REGRESSION_TIMEOUT
        # Flows save screenshots relative to the working directory.
        (cd "$dir" && limit "$seconds" "$MAESTRO" --device "$3" test -e APP_ID="$4" "$ROOT/maestro/$flow.yaml") > "$dir/$flow.log" 2>&1
        case $? in
            0) record PASS "$1 $2 $flow" ;;
            124) record FAIL "$1 $2 $flow" "timed out after ${seconds}s; see ${dir#"$ROOT"/}/$flow.log" ;;
            *) record FAIL "$1 $2 $flow" "see ${dir#"$ROOT"/}/$flow.log" ;;
        esac
    done
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

IOS_UDID=""

ios_device() {
    IOS_UDID=$(xcrun simctl list devices available -j | node -e '
        const want = process.env.IOS_SIMULATOR
        const devices = Object.entries(JSON.parse(require("fs").readFileSync(0, "utf8")).devices)
            .filter(([runtime]) => runtime.includes("iOS"))
            .flatMap(([, list]) => list)
            .filter((d) => d.isAvailable && d.name.startsWith("iPhone"))
        const pick = want
            ? devices.find((d) => d.name === want)
            : devices.find((d) => d.state === "Booted") || devices[0]
        if (pick) console.log(pick.udid)')
    [ -n "$IOS_UDID" ] || return 1
    xcrun simctl boot "$IOS_UDID" > /dev/null 2>&1
    xcrun simctl bootstatus "$IOS_UDID" -b > /dev/null 2>&1
}

ios_pods() { # app
    local dir
    dir=$(app_dir "$1")
    if [ "$FORCE_PODS" = 1 ] || [ ! -d "$dir/ios/Pods" ]; then
        say "pod install ($1)"
        (cd "$dir" && bundle install && cd ios && bundle exec pod install) > "$OUT/pods-$1.log" 2>&1
    fi
}

build_ios() { # app
    local dir name
    dir=$(app_dir "$1")
    name=$(app_name "$1")
    if ! (cd "$dir/ios" && limit "$BUILD_TIMEOUT" xcodebuild -workspace "$name.xcworkspace" -scheme "$name" -configuration Debug \
        -sdk iphonesimulator -destination "platform=iOS Simulator,id=$IOS_UDID" -derivedDataPath build) \
        > "$OUT/ios-build-$1.log" 2>&1; then
        record FAIL "$1 ios build" "$(grep -m1 -E ': error:' "$OUT/ios-build-$1.log" | cut -c1-160) (limit ${BUILD_TIMEOUT}s)"
        return 1
    fi
    xcrun simctl install "$IOS_UDID" "$dir/ios/build/Build/Products/Debug-iphonesimulator/$name.app"
    record PASS "$1 ios build"
}

flows_ios() { # app
    local name start crash
    name=$(app_name "$1")
    start=$(date +%s)
    run_flows "$1" ios "$IOS_UDID" "$(ios_bundle_id "$1")"
    for crash in "$HOME"/Library/Logs/DiagnosticReports/"$name"-*.ips; do
        [ -f "$crash" ] && [ "$(stat -f %m "$crash")" -ge "$start" ] || continue
        cp "$crash" "$OUT/"
        record FAIL "$1 ios crash" "$(basename "$crash")"
    done
}

# --- Android -------------------------------------------------------------

ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
ADB="$ANDROID_HOME/platform-tools/adb"
ANDROID_SERIAL=""

ensure_java() {
    local major jdk
    major=$(java -version 2>&1 | awk -F'"' '/version/ {split($2, v, "."); print v[1]}')
    if [ "${major:-0}" -lt 17 ] || [ "${major:-0}" -gt 21 ]; then
        # Prefer JDK 17 for Gradle.
        jdk=$(/usr/libexec/java_home -v 17 2>/dev/null || true)
        [ -z "$jdk" ] && [ -d /opt/homebrew/opt/openjdk@17 ] && jdk=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
        [ -n "$jdk" ] && export JAVA_HOME="$jdk"
    fi
}

android_device() {
    local avd
    ANDROID_SERIAL=$("$ADB" devices | awk 'NR > 1 && $2 == "device" {print $1; exit}')
    if [ -z "$ANDROID_SERIAL" ]; then
        avd=${ANDROID_AVD:-$("$ANDROID_HOME/emulator/emulator" -list-avds | head -1)}
        [ -z "$avd" ] && return 1
        say "Starting emulator $avd"
        # Not a child job, so it keeps running after the script exits.
        # -gpu host: software rendering makes the example too slow for the flows.
        nohup "$ANDROID_HOME/emulator/emulator" -avd "$avd" -gpu host -no-snapshot-save -no-boot-anim > "$OUT/emulator.log" 2>&1 &
        disown
        "$ADB" wait-for-device
        until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
        ANDROID_SERIAL=$("$ADB" devices | awk 'NR > 1 && $2 == "device" {print $1; exit}')
    fi
    [ -n "$ANDROID_SERIAL" ]
}

build_android() { # app
    local dir
    dir=$(app_dir "$1")
    if ! (cd "$dir/android" && limit "$BUILD_TIMEOUT" ./gradlew app:assembleDebug --console=plain -q) > "$OUT/android-build-$1.log" 2>&1; then
        record FAIL "$1 android build" "see verify-output log"
        return 1
    fi
    "$ADB" -s "$ANDROID_SERIAL" install -r "$dir/android/app/build/outputs/apk/debug/app-debug.apk" > /dev/null
    "$ADB" -s "$ANDROID_SERIAL" reverse tcp:8081 tcp:8081 > /dev/null
    record PASS "$1 android build"
}

flows_android() { # app
    local pkg
    pkg=$(android_package "$1")
    "$ADB" -s "$ANDROID_SERIAL" logcat -b crash -c
    run_flows "$1" android "$ANDROID_SERIAL" "$pkg"
    if "$ADB" -s "$ANDROID_SERIAL" logcat -b crash -d | grep -q "$pkg"; then
        "$ADB" -s "$ANDROID_SERIAL" logcat -b crash -d > "$OUT/android-crash-$1.log"
        record FAIL "$1 android crash" "see verify-output log"
    fi
}

# --- Run -----------------------------------------------------------------

if [ "$RUN_APPS" = 1 ]; then
    # Pick devices up front; each app's platforms then build in parallel.
    READY=()
    for platform in "${PLATFORMS[@]}"; do
        case $platform in
            ios) ios_device && READY+=(ios) || record FAIL "ios" "no iPhone simulator found" ;;
            android) ensure_java; android_device && READY+=(android) || record FAIL "android" "no device or emulator" ;;
        esac
    done

    for app in "${APPS[@]}"; do
        [ ${#READY[@]} -gt 0 ] || break
        ensure_node_modules "$(app_dir "$app")"
        [[ " ${READY[*]} " == *" ios "* ]] && { ios_pods "$app" || record FAIL "$app ios pod install" "see verify-output log"; }

        say "Building $app (${READY[*]})"
        BUILT=()
        pids=()
        for platform in "${READY[@]}"; do
            "build_$platform" "$app" &
            pids+=("$!:$platform")
        done
        for entry in "${pids[@]}"; do
            wait "${entry%%:*}" && BUILT+=("${entry#*:}")
        done
        [ ${#BUILT[@]} -gt 0 ] || continue

        start_metro "$app" || { record FAIL "$app metro" "see verify-output log"; continue; }
        # Maestro can't run two sessions at once on one machine, so the flows
        # run one platform at a time.
        for platform in "${BUILT[@]}"; do
            say "Running flows for $app on $platform"
            "flows_$platform" "$app"
        done
        stop_metro
    done
fi

echo
echo "Summary${REF:+ (library from $REF)}:"
sed 's/^/  /' "$RESULTS"
echo "Output: ${OUT#"$ROOT"/}"
if grep -qE '^FAIL.*android (walkthrough|regression)' "$RESULTS"; then
    echo "If Android flows fail on screens that look fine, the emulator is probably too slow: give it 4 GB+ RAM and hardware graphics (hw.ramSize, hw.gpu.mode = host in the AVD's config.ini) and restart it (adb emu kill)."
fi
! grep -q '^FAIL' "$RESULTS"
