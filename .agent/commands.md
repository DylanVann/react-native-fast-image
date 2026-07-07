# Commands — react-native-fast-image

Quick reference for agents. Package manager is **bun**, not yarn/npm (see
`.agent/memory.json` entry `rn-migration-phase1-in-progress-use-bun`).

## Library (repo root) — build / lint / test

```bash
bun install              # install root devDependencies
bun run test             # jest, single file: src/index.test.tsx
bun run test -- -u       # update snapshots after an intentional behavior change
bun run lint             # eslint + prettier + sort-package-json (dv-scripts lint)
bun run build            # dv-scripts build, then copies src/index.js.flow into dist/
```

No standalone `tsc`/typecheck script — TS correctness is enforced by `build`
and the editor only.

Run a single test file explicitly (there is only one JS test file today):

```bash
bun run test -- src/index.test.tsx
```

`CI=true` should be set when running test/lint non-interactively (background
jobs, scripts) — without it jest can hang waiting on watch-mode input.

## Example app — run on Android / iOS

The example app (`ReactNativeFastImageExample/`) is the only way to exercise
native `android/`/`ios/` code; JS unit tests never touch it.

```bash
bun install                          # repo root
bun link                             # register this package globally
cd ReactNativeFastImageExample
bun install
bun link react-native-fast-image     # symlink local source into the example app
bun run build                        # ROOT repo - dist/ must exist, see below
bun run start                        # metro bundler
bun run android                      # or: bun run ios
```

Re-run `bun run android` / `bun run ios` after any native (`android/`, `ios/`)
change — there is no live-reload for native code.

`react-native-fast-image` in the example app's `package.json` must read
`"link:react-native-fast-image"` (bun's global-link syntax), not a relative
`"file:../.."` path — bun's `file:` protocol fails with `EPERM` on Windows for
this repo (see `.agent/memory.json`).

**The root library's `dist/` must be built (`bun run build` at repo root)
before the example app can even resolve `react-native-fast-image` at all.**
This was never run/verified during the whole New Architecture migration
(only `gradlew assembleDebug` was) - see `.agent/memory.json` entry
`example-app-jest-and-dist-build-fixed` for everything that surfaced once it
actually was.

### `bun run android` hangs/fails under Git Bash on this machine

`react-native.exe run-android` spawns `gradlew.bat` in a way that Git Bash's
PATH breaks (`'gradlew.bat' is not recognized`), and separately its metro
port-conflict prompt ("Another process is running on port 8081") blocks
forever with no stdin attached. Use PowerShell + manual steps instead:

```powershell
# 1. free port 8081 if something stale is squatting on it
Get-NetTCPConnection -LocalPort 8081 -State Listen | Select OwningProcess
Stop-Process -Id <pid> -Force

# 2. install the APK directly (PowerShell, not Bash - gradlew.bat needs a real Windows shell)
cd ReactNativeFastImageExample/android
.\gradlew.bat installDebug
```

Then separately start Metro (`bun run start` from `ReactNativeFastImageExample/`,
can use Bash for this one), `adb reverse tcp:8081 tcp:8081`, and
`adb shell am start -n com.reactnativefastimageexample/.MainActivity`.

### Building Android directly (no Metro/device)

```bash
cd ReactNativeFastImageExample/android
./gradlew assembleDebug
```

Produces `app/build/outputs/apk/debug/app-debug.apk`. This is how Phase 2 of
the New Architecture migration was verified end-to-end on this Windows
machine (no emulator/device attached).

### metro.config.js is NOT the RN template default - do not replace it

It must stay `mergeConfig(getDefaultConfig(projectRoot), config)` (bare custom
objects break `transformer.assetRegistryPath` and silently fail to parse any
`.png`). It also carries two fixes required because `react-native-fast-image`
is `bun link`-ed in from *outside* this app's directory tree:
- `watchFolders` + `resolver.unstable_enableSymlinks`/`nodeModulesPaths` - so
  Metro follows the symlink and watches the library's real source at all.
- `resolver.resolveRequest` forcing `react`/`react-native` imports to always
  resolve to *this app's* `node_modules` copy, not the library's own (the
  library has its own `react`/`react-native` devDependencies installed one
  level up) - without this, two React instances load and every FastImage
  render throws "Invalid hook call". `extraNodeModules` alone does NOT fix
  this (it's only a fallback for names that fail to resolve normally - these
  never fail to resolve, they just resolve to the wrong copy).
See `.agent/memory.json` entry `metro-config-symlink-and-duplicate-react-fix`
for the full debugging trail if this breaks again.

### iOS

Requires Xcode/macOS — not available on this (Windows) machine. iOS Fabric/
TurboModule native code was **not implemented**; see
`docs/new-architecture-ios-followup.md` for what's missing and how to pick it
up on a Mac. Do not claim an iOS build was verified unless it was actually
run on Xcode.

## Current architecture state (as of last verification)

- New Architecture (Fabric + TurboModule) is forced on
  (`newArchEnabled=true` in `ReactNativeFastImageExample/android/gradle.properties`)
  and **Android** is fully verified via a real `gradlew assembleDebug` build.
- `react-native-reanimated`/`react-native-worklets` are **not installed** in
  the example app (removed — unrelated Windows CMake/ninja bug, see
  `.agent/memory.json`). Don't assume they're available.
