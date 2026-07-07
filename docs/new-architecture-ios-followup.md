# iOS New Architecture support — follow-up (not implemented)

Android now has full Fabric (`FastImageViewManager` implementing the Codegen-generated
`FastImageViewManagerInterface`/`FastImageViewManagerDelegate`) and TurboModule
(`FastImageViewModule extends NativeFastImageViewSpec`) support, verified against a real
RN 0.86.0 build with New Architecture forced on. iOS was **not** implemented this session —
this machine has no Xcode/macOS, so hand-writing Objective-C++ Fabric code here would be
unverified and risky to ship. This doc is the handoff for whoever picks it up on a Mac.

## What's needed

1. **Fabric component view** — a new `FFFastImageViewComponentView` (Obj-C++, `.h`/`.mm`)
   conforming to `RCTComponentViewProtocol`, replacing `FFFastImageViewManager`'s role under
   Fabric. It receives props via the Codegen-generated `RNFastImageSpec` C++ props struct
   (from `src/FastImageViewNativeComponent.ts`, already written and shared with Android) and
   drives the same SDWebImage-backed loading `FFFastImageView` already does.
2. **TurboModule conformance** — `FFFastImageViewManager`'s `preload`/`clearMemoryCache`/
   `clearDiskCache` methods need to satisfy the Codegen-generated `NativeFastImageViewSpec`
   Obj-C++ protocol (mirrors the Android `NativeFastImageViewSpec extends` pattern).
3. **`codegenConfig.ios.componentProvider`** in root `package.json` mapping `FastImageView` →
   `FFFastImageViewComponentView`, e.g.:
   ```json
   "codegenConfig": {
       "name": "RNFastImageSpec",
       "type": "all",
       "jsSrcsDir": "src",
       "android": { "javaPackageName": "com.dylanvann.fastimage" },
       "ios": { "componentProvider": { "FastImageView": "FFFastImageViewComponentView" } }
   }
   ```
4. **Podspec** — confirm `RNFastImage.podspec` picks up the new Fabric source files (glob
   `ios/**/*.{h,m,mm}` needs `.mm` included, not just `.h`/`.m`).

## Reference implementation

`@d11/react-native-fast-image` (npm) already ships exactly this — same component name,
same event set, plus extras (blur/AVIF) this repo doesn't have. Pull the tarball
(`npm pack @d11/react-native-fast-image@<latest>`) and look at:
- `ios/FastImage/FFFastImageViewComponentView.h` / `.mm` — the Fabric component view
- `ios/FastImage/FFFastImageViewModule.h` / `.mm` — the TurboModule conformance
- `package.json`'s `codegenConfig.ios` block

Don't copy wholesale — it has blur/AVIF features this library doesn't. Use it as a shape
reference for the Fabric/TurboModule plumbing only, same way the Android oldarch/newarch
split in this repo was adapted from it (see `.agent/memory.json` for what was kept vs.
changed and why).

## Verification once implemented

- Real Xcode build of `ReactNativeFastImageExample.xcworkspace` (`use_frameworks!` off,
  New Architecture on — RN ≥0.82 has no old-arch fallback).
- Manually exercise the example app's scroll/priority demo screens on an iOS
  simulator/device: image loading, `tintColor`, `borderRadius` clipping, `defaultSource`,
  `preload`/`clearMemoryCache`/`clearDiskCache`, progress/load/error events.
