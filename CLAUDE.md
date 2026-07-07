# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`react-native-fast-image` — RN `Image` replacement wrapping SDWebImage (iOS) and Glide (Android) for aggressive caching, priority, headers, GIFs, tint color. Old-architecture native module (bridge-based `requireNativeComponent`/`NativeModules`, not Fabric/TurboModules). Only the JS layer (`src/`) lives in this repo checkout in a form you can build/test standalone; native iOS/Android code requires the example app to compile and run.

## Commands (run from repo root)

- `yarn lint` — runs `dv-scripts lint` (eslint + prettier per config in package.json)
- `yarn test` — runs `dv-scripts test` (jest, `react-native` preset)
- `yarn test -- src/index.test.tsx` — run the single JS test file (there is only one: `src/index.test.tsx`, snapshot in `src/__snapshots__`)
- `yarn build` — runs `dv-scripts build`, then copies `src/index.js.flow` into `dist/` as both `index.js.flow` and `index.cjs.js.flow`
- `yarn release` — `dv-scripts release` (maintainer use, not for routine changes)

There is no separate typecheck script; TypeScript correctness is enforced by the build step and editor, not a standalone `tsc` command.

## Running the example app (native changes)

Native (iOS/Android) code cannot be verified by JS unit tests — changes to `ios/` or `android/` must be exercised via `ReactNativeFastImageExample`:

```bash
yarn                                    # repo root
yarn link
cd ReactNativeFastImageExample
yarn
yarn link react-native-fast-image
yarn start                              # metro
yarn react-native run-ios               # or run-android
```

Re-run `run-ios`/`run-android` after any native code change — no live-reload of native code. See `docs/development.md`.

## Architecture

**Single JS entry point**: `src/index.tsx` exports the `FastImage` component and is the only source of truth for the public JS API. It:
- Wraps a native view (`requireNativeComponent('FastImageView', ...)`) inside a `View` for layout/`overflow: hidden` (border radius support requires this wrapper).
- Renders a plain RN `<Image>` instead of the native view when `fallback` prop is true — same layout/styling, used as an escape hatch when the native view can't be used.
- Translates prop names crossing the bridge: JS `onLoad`/`onProgress`/etc. become native `onFastImageLoad`/`onFastImageProgress`/etc. (see `nativeOnly` block at the bottom of the file). When adding a new event prop, it must be renamed on both sides of this boundary.
- Resolves `defaultSource` differently per platform in `resolveDefaultSource`: Android needs a resolved URI string (via `Image.resolveAssetSource`), iOS/other platforms pass the raw asset number through to the native side directly.
- Attaches static methods (`FastImage.preload`, `clearMemoryCache`, `clearDiskCache`) directly onto the exported component by calling into `NativeModules.FastImageView`.
- `src/index.js.flow` is a hand-maintained Flow type definition shipped alongside the compiled JS for Flow-based consumers — keep it in sync with `FastImageProps` in `index.tsx` when the public API changes.

**Android** (`android/src/main/java/com/dylanvann/fastimage/`):
- `FastImageViewManager` is the `SimpleViewManager` registering props (`source`, `defaultSource`, `tintColor`, `resizeMode`) and direct events; it also implements `FastImageProgressListener` to fan out download-progress callbacks to all views sharing the same URL (`VIEWS_FOR_URLS` map), since Glide dedupes identical requests.
- `FastImageGlideModule` / `FastImageOkHttpProgressGlideModule` hook into Glide's `AppGlideModule` system — if a host app already defines its own `AppGlideModule`, see `docs/app-glide-module.md` for the conflict and workaround.
- `FastImageViewWithUrl` holds per-view Glide request state; view recycling/cleanup happens in `onDropViewInstance`.
- Proguard users must keep `com.dylanvann.fastimage.*` and Glide's generated classes (rules listed in README).

**iOS** (`ios/FastImage/`):
- `FFFastImageViewManager` (Obj-C) exports props via `RCT_EXPORT_VIEW_PROPERTY`/`RCT_REMAP_VIEW_PROPERTY` (note `tintColor` JS prop maps to native `imageColor`) and exposes `preload`/`clearMemoryCache`/`clearDiskCache` as native methods backed by `SDWebImageDownloader`/`SDImageCache`/`SDWebImagePrefetcher`.
- `FFFastImageView` is the actual `UIView` subclass doing the SDWebImage-backed loading.
- `RCTConvert+FFFastImage` / `FFFastImageSource` convert the JS `source` object (uri, headers, priority, cache) into native types.

**Keeping both platforms in sync**: any new prop or event added in `src/index.tsx` needs a corresponding registration in both `FastImageViewManager.java` (Android) and `FFFastImageViewManager.m` (iOS), plus the event-name translation table in `index.tsx` if it's a callback prop.

## Style

- Prettier config (in `package.json`): no semicolons, single quotes, 4-space tabs, trailing commas.
- ESLint extends `dv-scripts`.
