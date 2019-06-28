## [6.0.3](https://github.com/DylanVann/react-native-fast-image/compare/v6.0.2...v6.0.3) (2019-06-03)


### Bug Fixes

* Add tintColor type definition. ([4adf42f](https://github.com/DylanVann/react-native-fast-image/commit/4adf42f))

## [6.0.2](https://github.com/DylanVann/react-native-fast-image/compare/v6.0.1...v6.0.2) (2019-06-03)


### Bug Fixes

* Upgrade vendored SDWebImage to v5.0.5. ([5016172](https://github.com/DylanVann/react-native-fast-image/commit/5016172)), closes [#489](https://github.com/DylanVann/react-native-fast-image/issues/489)

## [6.0.1](https://github.com/DylanVann/react-native-fast-image/compare/v6.0.0...v6.0.1) (2019-05-25)


### Bug Fixes

* Fix local resource cache issue on Android. ([#472](https://github.com/DylanVann/react-native-fast-image/issues/472)) ([5f65383](https://github.com/DylanVann/react-native-fast-image/commit/5f65383)), closes [#402](https://github.com/DylanVann/react-native-fast-image/issues/402)

# [6.0.0](https://github.com/DylanVann/react-native-fast-image/compare/v5.4.2...v6.0.0) (2019-05-08)


### Features

* Upgrade to SDWebImage 5.0. ([#454](https://github.com/DylanVann/react-native-fast-image/issues/454)) ([8a216e2](https://github.com/DylanVann/react-native-fast-image/commit/8a216e2)), closes [#447](https://github.com/DylanVann/react-native-fast-image/issues/447)


### BREAKING CHANGES

* Upgrade SDWebImage, may affect some projects and CocoaPods users.

Fix the bug of `cacheOnly` behavior

## [5.4.2](https://github.com/DylanVann/react-native-fast-image/compare/v5.4.1...v5.4.2) (2019-05-03)


### Bug Fixes

* Fix dependency versions not specified in podfile. ([89f3379](https://github.com/DylanVann/react-native-fast-image/commit/89f3379)), closes [#456](https://github.com/DylanVann/react-native-fast-image/issues/456)

## [5.4.1](https://github.com/DylanVann/react-native-fast-image/compare/v5.4.0...v5.4.1) (2019-05-03)


### Bug Fixes

* Fix wildcard peer dependencies. ([7149420](https://github.com/DylanVann/react-native-fast-image/commit/7149420)), closes [#440](https://github.com/DylanVann/react-native-fast-image/issues/440)

# [5.4.0](https://github.com/DylanVann/react-native-fast-image/compare/v5.3.0...v5.4.0) (2019-05-03)


### Features

* Add tint color support. ([03c50f0](https://github.com/DylanVann/react-native-fast-image/commit/03c50f0)), closes [#124](https://github.com/DylanVann/react-native-fast-image/issues/124)

# [5.3.0](https://github.com/DylanVann/react-native-fast-image/compare/v5.2.1...v5.3.0) (2019-04-23)


### Bug Fixes

* Fix memory leak on iOS. ([#433](https://github.com/DylanVann/react-native-fast-image/issues/433)) ([70be744](https://github.com/DylanVann/react-native-fast-image/commit/70be744))


### Features

* Upgrade example apps. ([#453](https://github.com/DylanVann/react-native-fast-image/issues/453)) ([25f8f0d](https://github.com/DylanVann/react-native-fast-image/commit/25f8f0d))


### Reverts

* Remove functionality for notifying other images on load. ([#452](https://github.com/DylanVann/react-native-fast-image/issues/452)) ([292223d](https://github.com/DylanVann/react-native-fast-image/commit/292223d))

## [5.2.1](https://github.com/DylanVann/react-native-fast-image/compare/v5.2.0...v5.2.1) (2019-04-21)


### Performance Improvements

* Use React.memo for FastImage. ([#449](https://github.com/DylanVann/react-native-fast-image/issues/449)) ([5c2b4af](https://github.com/DylanVann/react-native-fast-image/commit/5c2b4af))

## [5.2.0](https://github.com/DylanVann/react-native-fast-image/compare/v5.1.4...v5.2.0) (2019-02-25)


### Features

* Use forwardRef to allow access to ref.measure and others. ([#419](https://github.com/DylanVann/react-native-fast-image/issues/419)) ([2b4fba3](https://github.com/DylanVann/react-native-fast-image/commit/2b4fba3)), closes [#69](https://github.com/DylanVann/react-native-fast-image/issues/69)

## [5.1.4](https://github.com/DylanVann/react-native-fast-image/compare/v5.1.3...v5.1.4) (2019-02-25)


### Bug Fixes

* Fix fallback prop not working. ([#420](https://github.com/DylanVann/react-native-fast-image/issues/420)) ([487d410](https://github.com/DylanVann/react-native-fast-image/commit/487d410))

## [5.1.3](https://github.com/DylanVann/react-native-fast-image/compare/v5.1.2...v5.1.3) (2019-02-22)


### Bug Fixes

* Fixes WebP rendering on iOS 12. ([#412](https://github.com/DylanVann/react-native-fast-image/issues/412)) ([97630c8](https://github.com/DylanVann/react-native-fast-image/commit/97630c8)), closes [#298](https://github.com/DylanVann/react-native-fast-image/issues/298) [#385](https://github.com/DylanVann/react-native-fast-image/issues/385)

## [5.1.2](https://github.com/DylanVann/react-native-fast-image/compare/v5.1.1...v5.1.2) (2018-12-30)


### Fixed

-   Fixes cacheControl types. ([#382](https://github.com/DylanVann/react-native-fast-image/issues/382)) ([e13db7d](https://github.com/DylanVann/react-native-fast-image/commit/e13db7d)), closes [#325](https://github.com/DylanVann/react-native-fast-image/issues/325)

## [5.1.1] (2018-11-13)

### Fixed

-   URIs using the `file` scheme on Android. (1ea804593b8e3a9bb585ebec36d5484945d31c14 - @tsrkalexandr)
-   `.idea/` being published to npm. (a01f8d596faddb71f5007bb32e2cd5e91a64634c - @retyui)
-   Manual installation docs for Android. (4cdee52a5eb7a9dee69ff770da7b0cf32f571cb4 - @fschindler)
    -   Referencing deprecated `compile` instead of `implementation`.
    -   Using hardcoded `appcompat` version instead of using `rootProject.ext`.

## [5.1.0] (2018-11-06)

@patrickkempff has done a lot to improve the stability and usefulness of this library in this release 🙏🏻.

### Changed

-   A `Resources.NotFoundException` will now be thrown if a local image cannot be resolved. (7859d5b6d919c6c769bed4901d12b6941b4473bb - @patrickkempff)

### Fixed

-   Not rendering local images in production builds. (47e36edc24a1990eeb735527ae4ebe6d2dbe61b5 - @patrickkempff)
-   Crash where activity was already destroyed before React Native could cleanup view manager. (8f702ed1d9ae69dfea172ebc5da3af7764a73808 - @patrickkempff)
-   Incorrect Flow types. (ba447531ace686d52178d943e9d5337d2fc74da7 - @retyui)

## [5.0.11] (2018-10-15)

### Added

-   Support for showing local images. (fddee2c583c0978d0e7e91cdf4d6c87629afe015)
-   An example of auto-sizing. (400232767b1b0c5ce1d7fd5f87d9278bb70b0cb9)
-   `fallback` prop. (30a2ff7909df07d5188c4dbeae719d46562ef778)
-   `cacheControl` prop. (cf9a595ee929c1397063b97f44441f0556317f36, 9f422c4a74888ddc062dae20a212949256fc9daa)
-   Flow type definitions. (11c7e9e86508be289c57cacda00d687134458e2b - @retyui)

### Changed

-   Upgraded to Glide 4. (f31a44fc07caa7d4635ae83936b8925891a1ab15)
-   Updated license info. (3bd08ef952967a736fb7baca29dd798daafb4376)
-   Decrease package size by ignoring more files. (a6f7b109aac070b487a6bdb54da7a2276f860e94)
-   Specify types file in `package.json`. (e5838165b6f6e56af534cb6f59dca81cd87dfcdf)

### Fixed

-   Memory leaks on Android. (6e0e6f8f2b9c97dc4e31f5b3562944c1c0560870 - @patrickkempff)
-   Make sure headers only accepts key value pairs. (d142379e6f04ac8aa9e6c0e85d5c36949d027b78 - @BenWildeman)
-   Fix enum names in readme. (d2c33a85ce6cb67c8d1b0c6fcaa9bb591e69908a - @richeterre)
-   Make linking command in docs more specific. (22541243d96f6d4f50bf082c1f91a911ed91aba1 - @lfkwtz)
-   Changes to support getting Android compile and support library versions from `ext` in `build.gradle`.
-   Removed unnecessary import. (0f78b13d13ed4d239c6b2c3672f9c8f02aec096c - @retyui)
-   Added breaks in `FastImageViewConverter.java`. (efd02a307dc9aacad731325d39c325f772371d00 - @Yria)
-   Switches to new Gradle synax, using `implementation` instead of `compile`. (5d973a8cec50efdd3c20d05b97dbe59f71677944 - @yeomann)
-   Allow overwriting `imageContainer` styles. (b8c82c7d5ea7c4abe0b74f8976eb31e5999fc710 - @n1ru4l)
-   Add cache enum type to TypeScript definitions. (0c7e323ef0c818ff0e95f62211ad86058d9f3bb8 - @EQuimper)
-   TypeScript types for `fallback`. (c265c7a79a70067a3d1459e4878916fd5a13c2e6 - @retyui)
-   Handle `null` `view.glideUrl`. (75a6ce766c7fc2c1dd98a4e8d8c52c3aeeb3d506 - @ratson)
-   Incorrect cache property name in readme. (0ef723101846792e20ae9ba6420d5271ba6e928a - @vieiralucas)

## [4.0.14] (2018-05-09)

### Changed

-   Add `resizeMode` examples.

## [4.0.13] (2018-05-09)

### Fixed

-   Fix initial `resizeMode`. This fixes a bug where the `stretch` resizeMode could not be used. (6e5d0d7b89d71b5c05678d1ede7f6c27f809c9e9 - @bluekurk)

## [4.0.12] (2018-05-06)

### Fixed

-   Revert some changes to default settings for building for Android. (a4e6ef3002319679d6faa95ca1314b2df36c433e)
-   Probably the correct way to deal with this going forward is to match the defaults to the values currently in React Native.
-   React Native may also choose to update the template to provide these properties on `ext`, in which case this issue would go away.

## [4.0.12] (2018-05-06)

### Changed

-   Handle asset library URIs. (466f43f4aef74765ddc6e7740d4455748047acbf)
-   Improve TypeScript types. (75e3fd7cd832ce5e571b0ce1374a47a4b4c632c4)

## [4.0.10] (2018-05-05)

### Changed

-   Handle assets from smart albums. (243b33db768b8afe4c58999db005600bda4a07dd)

## [4.0.9] (2018-05-05)

### Fixed

-   Fix some issues with the examples.
-   Use OkHttpClientProvider to allow extending preconfigured clients. (eac670b2dcd26414c6c98426a9cda35ba35c5b67 - @btegenbosch)

## [4.0.8] (2018-05-05)

### Added

-   Handle content and file urls.

## [4.0.7] (2018-05-05)

### Added

-   Add instructions for manually linking. (71a52d9ba7973b881fef99c6688dbc4e2c2f8500 - @Meandmybadself)
-   Add note about proguard. (f31e8d6a3e752269b84fbf3d6017c1480c58c0f0)

### Changed

-   Updated examples.
-   Use SDK version and variables from the root project. (c9b3aaef9ce9d1fdc701aa3bc7eaa99d3e3f57df - @rayronvictor)

### Fixed

-   Fix bugs when using with `createAnimatedComponent`. (cf83d0f7f384afd262014f3a96feff32356611a2 - @kphungry)

## [4.0.6] (2018-04-24)

### Fixed

-   Fix failing iOS builds. (#189)
-   Use conditional imports to support linking and CocoaPods. (084a41497d5688c7939f94be7d48d2f2ad74fb74)
-   Fix other `FLAnimatedImage` header search path. (ac00fdaa6309f03afc3bf052584a99c18726d21e)

## [4.0.4] (2018-04-21)

### Changed

-   Set deprecated `ALWAYS_SEARCH_USER_PATHS` to `NO`. (e7ba4a7f789d883f4dbbe526612e70a2501d7be5)
-   Remove `FLAnimatedImage` from `FastImage` project since it's already included in `SDWebImage`. Installation remains the same as before when using CocoaPods. (a2d9fe2c71693721fec56e9cfe258a373a651b71)

### Fixed

-   Fix `FLAnimatedImage` header search path. (883dc0664dfd6ca26a1b8bece161abd3b9184cf1)

## [4.0.3] (2018-04-21)

### Fixed

-   Fixes a bug where an undefined source would cause a crash. (https://github.com/DylanVann/react-native-fast-image/commit/78a28cdb814db39942125ead19742695a35b7223)

## [4.0.2] (2018-04-19)

### Added

-   Added `borderRadius` to `style` prop in TypeScript definitions.

### Fixed

-   Fix `onLoad` not being called with dimensions on iOS. (@ligen52)

### Removed

-   Remove `borderRadius` prop that was left in accidentally, including removing it from the TypeScript definitions. `borderRadius` should now be applied using `style`.

## [4.0.0] (2018-03-18)

### Added

-   Support for CocoaPods. (@patrickkempff )
-   Width and height information to `onLoad` event. (@jeremyclee)

### Fixed

-   An issue with `onLoadEnd` not being called. (@kdong007)
-   `HEADER_SEARCH_PATHS`. (@OceanHorn)
-   Use `DecodeFormat.PREFER_ARGB_8888` to fix image quality issues. (@TilWs)

## [3.0.1] (2018-03-10)

### Fixed

-   Adds support for using `borderRadius` from `style`.

### Removed

-   Support for `borderRadius` property.

<img width="391" alt="radius" src="https://user-images.githubusercontent.com/1537615/37248293-662f6028-249c-11e8-9923-d9a62a706607.png">

## [2.2.6] (2018-03-07)

### Fixed

-   Callbacks not being called. https://github.com/DylanVann/react-native-fast-image/commit/d9f729915486665d9aad1f1febff5348ab3ab069

## [2.2.4] (2018-02-13)

### Changed

-   Update TypeScript definitions to include `borderRadius`.

## [2.2.3] (2018-01-31)

### Added

-   Typescript type definitions. https://github.com/DylanVann/react-native-fast-image/pull/116/commits/f5422f851d428c8b60ca170a682164a32ffa4bb9

## [2.1.4] (2018-01-31)

### Fixed

-   Styles not being passed when using a local image. https://github.com/DylanVann/react-native-fast-image/commit/1cf545253c385b42593f4b226029cb4aaa0ed325

## [2.1.3] (2018-01-30)

### Added

-   `borderRadius` support. https://github.com/DylanVann/react-native-fast-image/commit/3a33bdaa27b0d68fc2ee692b18d7f527e0f342f5
-   Documentation on how caching is handled. https://github.com/DylanVann/react-native-fast-image/commit/8aa6c6bc13ae48d3116ab19ddb4947ad108ae964

### Changed

-   Improved examples.

![screen shot 2018-01-30 at 20 43 02](https://user-images.githubusercontent.com/1537615/35604641-1bdf1c74-0611-11e8-970e-9f9a5d2b8e36.png)

### Fixed

-   Default `resizeMode` on Android. https://github.com/DylanVann/react-native-fast-image/commit/d4210c0ed03d7e0c49389f6abbb3c713e68e5142
-   Preloading on android. https://github.com/DylanVann/react-native-fast-image/commit/de4f40a3a30a95fb8cdab714735501650e335dd9

## [2.0.1] (2017-11-30)

### Removed

-   Locking of node version with `engines`.

## [2.0.0] (2017-11-30)

### Changed

-   Updated example and docs.

### Fixed

-   Fix `resizeMode` issue. (@tdekoning - https://github.com/DylanVann/react-native-fast-image/pull/64)
-   Fix Android split screen crash. (@wz366 https://github.com/DylanVann/react-native-fast-image/pull/75)
-   Fixed CircleCI config.

### Removed

-   Removing backwards compatible `View.propTypes`.

## [1.0.0] (2017-08-08)

### Added

-   Adds progress support.

### Removed

-   Support for `react-native < 0.47.0` because of a change to how native modules work.

## [0.0.11] (2017-06-20)

### Added

-   Add support for preloading. ( 4e69ddd09908139feda66b283713d2b0efa04522 ) - @fjcaetano
-   Improve docs formatting.

## [0.0.10] (2017-05-04)

### Added

-   Add gif support to iOS. 🎞

## [0.0.9] (2017-05-03)

### Fixed

-   Re-release of previous version.

## [0.0.8] (2017-05-03)

### Fixed

-   Fixed submodule installation.
-   This issue also caused the last version released to be packaged incorrectly (did not include SDWebImage).

## [0.0.7] (2017-04-28)

### Fixed

-   Fix library header search paths. These being set incorrectly was causing archiving to fail.

## [0.0.6] (2017-04-20)

### Fixed

-   Fix setNativeProps for plain Image component (no source).

## [0.0.5] (2017-04-19)

### Fixed

-   Forward `setNativeProps`. Makes this component work with `TouchableOpacity`.

## [0.0.4] (2017-04-18)

### Fixed

-   Fix `onLoad` and `onError` props on iOS.

## [0.0.3] (2017-04-18)

### Changed

-   Remove useless image loading cancellation code.
-   Improve example.
-   Improve code formatting.

## [0.0.2] (2017-04-17)

### Added

-   Initial release (for real).

## 0.0.1 (2017-04-17)

### Added

-   Initial release.

[unreleased]: https://github.com/DylanVann/react-native-fast-image/compare/v5.1.1...HEAD
[5.1.1]: https://github.com/DylanVann/react-native-fast-image/compare/v5.1.0...v5.1.1
[5.1.0]: https://github.com/DylanVann/react-native-fast-image/compare/v5.0.11...v5.1.0
[5.0.11]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.14...v5.0.11
[4.0.14]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.13...v4.0.14
[4.0.13]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.12...v4.0.13
[4.0.12]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.11...v4.0.12
[4.0.11]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.10...v4.0.11
[4.0.10]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.9...v4.0.10
[4.0.9]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.8...v4.0.9
[4.0.8]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.7...v4.0.8
[4.0.7]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.6...v4.0.7
[4.0.6]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.4...v4.0.6
[4.0.4]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.3...v4.0.4
[4.0.3]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.2...v4.0.3
[4.0.2]: https://github.com/DylanVann/react-native-fast-image/compare/v4.0.0...v4.0.2
[4.0.0]: https://github.com/DylanVann/react-native-fast-image/compare/v3.0.1...v4.0.0
[3.0.1]: https://github.com/DylanVann/react-native-fast-image/compare/v2.2.6...v3.0.1
[2.2.6]: https://github.com/DylanVann/react-native-fast-image/compare/v2.2.4...v2.2.6
[2.2.4]: https://github.com/DylanVann/react-native-fast-image/compare/v2.2.3...v2.2.4
[2.2.3]: https://github.com/DylanVann/react-native-fast-image/compare/v2.1.4...v2.2.3
[2.1.4]: https://github.com/DylanVann/react-native-fast-image/compare/v2.1.3...v2.1.4
[2.1.3]: https://github.com/DylanVann/react-native-fast-image/compare/v2.0.1...v2.1.3
[2.0.1]: https://github.com/DylanVann/react-native-fast-image/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/DylanVann/react-native-fast-image/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.11...v1.0.0
[0.0.11]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.10...v0.0.11
[0.0.10]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.9...v0.0.10
[0.0.9]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/DylanVann/react-native-fast-image/compare/v0.0.1...v0.0.2
