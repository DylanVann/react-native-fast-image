# [8.11.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.10.0...v8.11.0) (2026-09-26)


### Features

* add imageRendering: smooth or pixelated scaling ([#1155](https://github.com/DylanVann/react-native-fast-image/issues/1155)) ([fde8fcc](https://github.com/DylanVann/react-native-fast-image/commit/fde8fcce053c535a2de430f01480465d497f26d5)), closes [#926](https://github.com/DylanVann/react-native-fast-image/issues/926) [#927](https://github.com/DylanVann/react-native-fast-image/issues/927) [#916](https://github.com/DylanVann/react-native-fast-image/issues/916)

# [8.10.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.9.0...v8.10.0) (2026-09-26)


### Features

* include an error message in onError ([#1132](https://github.com/DylanVann/react-native-fast-image/issues/1132)) ([5ddd59b](https://github.com/DylanVann/react-native-fast-image/commit/5ddd59b34663f1eeb11aa1b57b4ecf8d5fa263d2)), closes [#200](https://github.com/DylanVann/react-native-fast-image/issues/200)

# [8.9.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.8.1...v8.9.0) (2026-09-26)


### Features

* add a loop prop for animated images ([#1128](https://github.com/DylanVann/react-native-fast-image/issues/1128)) ([7bb015f](https://github.com/DylanVann/react-native-fast-image/commit/7bb015f418cc27b29dd142ae8320f1a29786c928))

## [8.8.1](https://github.com/DylanVann/react-native-fast-image/compare/v8.8.0...v8.8.1) (2026-09-26)


### Bug Fixes

* **types:** make PreloadResult a discriminated union on ok ([#1147](https://github.com/DylanVann/react-native-fast-image/issues/1147)) ([c5f8995](https://github.com/DylanVann/react-native-fast-image/commit/c5f899500470147ffb22998a22867cf2597945d0))

# [8.8.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.7.0...v8.8.0) (2026-09-26)


### Features

* keep the previous image while a new source loads, and add recyclingKey ([#1142](https://github.com/DylanVann/react-native-fast-image/issues/1142)) ([4ae925a](https://github.com/DylanVann/react-native-fast-image/commit/4ae925a69ea3b1844dcbc535ded52e26f9a96f08)), closes [#747](https://github.com/DylanVann/react-native-fast-image/issues/747) [#171](https://github.com/DylanVann/react-native-fast-image/issues/171) [#983](https://github.com/DylanVann/react-native-fast-image/issues/983)

# [8.7.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.43...v8.7.0) (2026-09-26)


### Features

* resolve preload with a result for each source ([#1133](https://github.com/DylanVann/react-native-fast-image/issues/1133)) ([0e49e03](https://github.com/DylanVann/react-native-fast-image/commit/0e49e032a4aec7cfd038e9c0c56d3c5a6272f8d9)), closes [#144](https://github.com/DylanVann/react-native-fast-image/issues/144)

## [8.6.43](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.42...v8.6.43) (2026-09-26)


### Bug Fixes

* **ios:** scale images larger than the view down with resizeMode center ([#1144](https://github.com/DylanVann/react-native-fast-image/issues/1144)) ([b4547f8](https://github.com/DylanVann/react-native-fast-image/commit/b4547f87a060133b4592c4b8d64b4afd07d7d8ac)), closes [#866](https://github.com/DylanVann/react-native-fast-image/issues/866)

## [8.6.42](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.41...v8.6.42) (2026-09-25)


### Bug Fixes

* **ios:** finish images that were loading when the app went to the background ([#1139](https://github.com/DylanVann/react-native-fast-image/issues/1139)) ([9d3e408](https://github.com/DylanVann/react-native-fast-image/commit/9d3e4083075d90457510e65a1ad7b66f6f5f0614)), closes [#758](https://github.com/DylanVann/react-native-fast-image/issues/758)

## [8.6.41](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.40...v8.6.41) (2026-09-25)


### Bug Fixes

* **android:** send the app's cookies with image requests ([#1138](https://github.com/DylanVann/react-native-fast-image/issues/1138)) ([ab645ea](https://github.com/DylanVann/react-native-fast-image/commit/ab645ea2bcf22a6b60f4952049cde3d335e15fad))

## [8.6.40](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.39...v8.6.40) (2026-09-25)


### Bug Fixes

* **ios:** allow newer SDWebImage versions ([#1136](https://github.com/DylanVann/react-native-fast-image/issues/1136)) ([02257d6](https://github.com/DylanVann/react-native-fast-image/commit/02257d69addc8949e49ab45197d8581f410d4cb1))

## [8.6.39](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.38...v8.6.39) (2026-09-25)


### Bug Fixes

* don't send onProgress when the total size is unknown ([#1134](https://github.com/DylanVann/react-native-fast-image/issues/1134)) ([3c75cb3](https://github.com/DylanVann/react-native-fast-image/commit/3c75cb30671f063d497946bf79eb503a8e7fde2a))

## [8.6.38](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.37...v8.6.38) (2026-09-25)


### Bug Fixes

* **android:** cache images loaded with cache web ([#1129](https://github.com/DylanVann/react-native-fast-image/issues/1129)) ([96c7eea](https://github.com/DylanVann/react-native-fast-image/commit/96c7eea3caa5915a026e4c47b991362ed74fa39d))

## [8.6.37](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.36...v8.6.37) (2026-09-25)


### Bug Fixes

* **android:** play GIFs as many times as the file says ([#1127](https://github.com/DylanVann/react-native-fast-image/issues/1127)) ([e77c816](https://github.com/DylanVann/react-native-fast-image/commit/e77c816c3859d848e549b30f94f01c4c3fac6eeb))

## [8.6.36](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.35...v8.6.36) (2026-09-25)


### Bug Fixes

* **ios:** fire onError for a data: uri that isn't an image ([#1126](https://github.com/DylanVann/react-native-fast-image/issues/1126)) ([2af0619](https://github.com/DylanVann/react-native-fast-image/commit/2af0619a35085f1cf4dd54c44457d7ce78e1d73a))

## [8.6.35](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.34...v8.6.35) (2026-09-25)


### Bug Fixes

* **android:** keep each view's own Glide request manager ([#1125](https://github.com/DylanVann/react-native-fast-image/issues/1125)) ([3a09bfb](https://github.com/DylanVann/react-native-fast-image/commit/3a09bfb0af262450fe0a79885e4533d7fcb09b5f))

## [8.6.34](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.33...v8.6.34) (2026-09-25)


### Bug Fixes

* **android:** send events through React Native's event dispatcher ([#1131](https://github.com/DylanVann/react-native-fast-image/issues/1131)) ([26259a9](https://github.com/DylanVann/react-native-fast-image/commit/26259a9c06db1f3e6ec59371b15b956b9f087fd3))

## [8.6.33](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.32...v8.6.33) (2026-09-25)


### Bug Fixes

* **android:** report the image's own size in onLoad ([#1124](https://github.com/DylanVann/react-native-fast-image/issues/1124)) ([53b936a](https://github.com/DylanVann/react-native-fast-image/commit/53b936ac2f2588894904cced8b3f067a6a90aae2)), closes [#608](https://github.com/DylanVann/react-native-fast-image/issues/608)

## [8.6.32](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.31...v8.6.32) (2026-09-25)


### Bug Fixes

* **android:** load 0×0 images on the legacy architecture ([#1122](https://github.com/DylanVann/react-native-fast-image/issues/1122)) ([38ea8e8](https://github.com/DylanVann/react-native-fast-image/commit/38ea8e86f9c6dc3b02364e6e02b7ca53e71da911))

## [8.6.31](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.30...v8.6.31) (2026-09-25)


### Bug Fixes

* **android:** declare the Glide annotations dependency ([#1120](https://github.com/DylanVann/react-native-fast-image/issues/1120)) ([f584f7c](https://github.com/DylanVann/react-native-fast-image/commit/f584f7c4576e3870cf9232a09fdf2064b5a7ffa5))

## [8.6.30](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.29...v8.6.30) (2026-09-25)


### Bug Fixes

* **android:** load asset:/ uris ([#1119](https://github.com/DylanVann/react-native-fast-image/issues/1119)) ([4931a9c](https://github.com/DylanVann/react-native-fast-image/commit/4931a9c71a22e5e7ba22c78f05cdd85b27ce205b))

## [8.6.29](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.28...v8.6.29) (2026-09-25)


### Bug Fixes

* **ios:** send preload headers only with that image's request ([#1118](https://github.com/DylanVann/react-native-fast-image/issues/1118)) ([e49e947](https://github.com/DylanVann/react-native-fast-image/commit/e49e947260cd9ce7ed598b258b07ab5a520de8dd)), closes [#14](https://github.com/DylanVann/react-native-fast-image/issues/14)

## [8.6.28](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.27...v8.6.28) (2026-09-25)


### Bug Fixes

* **ios:** send onLoadStart once when source and onLoadStart are set together ([#1114](https://github.com/DylanVann/react-native-fast-image/issues/1114)) ([094c75e](https://github.com/DylanVann/react-native-fast-image/commit/094c75e72e650dae88657706b985b0163658e786))

## [8.6.27](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.26...v8.6.27) (2026-09-25)


### Bug Fixes

* **android:** stop tracking a view's previous url when its source changes ([#1111](https://github.com/DylanVann/react-native-fast-image/issues/1111)) ([98db0b4](https://github.com/DylanVann/react-native-fast-image/commit/98db0b4d92da9e5024c8855fa1813a69591b44c0))

## [8.6.26](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.25...v8.6.26) (2026-09-25)


### Bug Fixes

* **android:** avoid excessive reloading on prop updates ([#1108](https://github.com/DylanVann/react-native-fast-image/issues/1108)) ([adedfac](https://github.com/DylanVann/react-native-fast-image/commit/adedfac7e55e3d358edbe18bd5f83fcec15166d3)), closes [#762](https://github.com/DylanVann/react-native-fast-image/issues/762)

## [8.6.25](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.24...v8.6.25) (2026-09-25)


### Bug Fixes

* **android:** load images when the view isn't in an Activity ([#1110](https://github.com/DylanVann/react-native-fast-image/issues/1110)) ([12c0d80](https://github.com/DylanVann/react-native-fast-image/commit/12c0d80f2f3346ef37720b61009413e614a02c7c))

## [8.6.24](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.23...v8.6.24) (2026-09-25)


### Bug Fixes

* **android:** report sources without a uri and show defaultSource ([#1109](https://github.com/DylanVann/react-native-fast-image/issues/1109)) ([9ab4e3b](https://github.com/DylanVann/react-native-fast-image/commit/9ab4e3bdd44535c0480998f55a94d11430fbe4ce)), closes [#1028](https://github.com/DylanVann/react-native-fast-image/issues/1028)

## [8.6.23](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.22...v8.6.23) (2026-09-24)


### Bug Fixes

* apply pointerEvents to FastImage's wrapper view ([#1105](https://github.com/DylanVann/react-native-fast-image/issues/1105)) ([548cabe](https://github.com/DylanVann/react-native-fast-image/commit/548cabec4e5cc38a3bb00b730136394198637707))

## [8.6.22](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.21...v8.6.22) (2026-09-24)


### Bug Fixes

* size fallback images to fill FastImage ([#1107](https://github.com/DylanVann/react-native-fast-image/issues/1107)) ([9651f22](https://github.com/DylanVann/react-native-fast-image/commit/9651f2294012b55cce41f0722fb642a4e94c5583))

## [8.6.21](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.20...v8.6.21) (2026-09-24)


### Bug Fixes

* use tintColor from style ([#1106](https://github.com/DylanVann/react-native-fast-image/issues/1106)) ([4e35e49](https://github.com/DylanVann/react-native-fast-image/commit/4e35e499aa608ee47dc4be46af3ce36fb538d592))

## [8.6.20](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.19...v8.6.20) (2026-09-24)


### Bug Fixes

* **types:** use ColorValue for colors in ImageStyle ([#1104](https://github.com/DylanVann/react-native-fast-image/issues/1104)) ([59ed002](https://github.com/DylanVann/react-native-fast-image/commit/59ed0023f16a04a418c7483adce6a96639448dbb))

## [8.6.19](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.18...v8.6.19) (2026-09-24)


### Bug Fixes

* **ios:** read the progress handler on the main queue ([#1102](https://github.com/DylanVann/react-native-fast-image/issues/1102)) ([c2d50ae](https://github.com/DylanVann/react-native-fast-image/commit/c2d50ae2936aa0e598828c3c598b3624304d1b27))

## [8.6.18](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.17...v8.6.18) (2026-09-24)


### Bug Fixes

* **android:** unwrap the view's context to the ReactContext ([#1103](https://github.com/DylanVann/react-native-fast-image/issues/1103)) ([65d4724](https://github.com/DylanVann/react-native-fast-image/commit/65d4724dfbc6f954055b8a607ac0cbc65ae74070))

## [8.6.17](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.16...v8.6.17) (2026-09-24)


### Bug Fixes

* load require()d images with fallback ([#1101](https://github.com/DylanVann/react-native-fast-image/issues/1101)) ([eadb9aa](https://github.com/DylanVann/react-native-fast-image/commit/eadb9aaaea14746a9ffa9cd545521e3db463dab0)), closes [#746](https://github.com/DylanVann/react-native-fast-image/issues/746)

## [8.6.16](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.15...v8.6.16) (2026-09-24)


### Bug Fixes

* don't crash as a Touchable's direct child on iOS ([#1100](https://github.com/DylanVann/react-native-fast-image/issues/1100)) ([57c1068](https://github.com/DylanVann/react-native-fast-image/commit/57c1068a81f478211a281414afa4f2c8f41950d2))

## [8.6.15](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.14...v8.6.15) (2026-09-24)


### Bug Fixes

* **android:** don't crash preloading a uri that can't be resolved ([#1099](https://github.com/DylanVann/react-native-fast-image/issues/1099)) ([53c5bc7](https://github.com/DylanVann/react-native-fast-image/commit/53c5bc7a34ae332cfbca36915c579d517310c336))

## [8.6.14](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.13...v8.6.14) (2026-09-24)


### Bug Fixes

* **ios:** remove the tint when tintColor is cleared ([#1098](https://github.com/DylanVann/react-native-fast-image/issues/1098)) ([92d6a5c](https://github.com/DylanVann/react-native-fast-image/commit/92d6a5c1acd1802a760c31f8a98c2abe2cf267cc))

## [8.6.13](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.12...v8.6.13) (2026-09-24)


### Bug Fixes

* **android:** set the namespace in build.gradle ([#1097](https://github.com/DylanVann/react-native-fast-image/issues/1097)) ([9284b54](https://github.com/DylanVann/react-native-fast-image/commit/9284b5463b682c9a9ee0c731effc3d6e5c4844d1))

## [8.6.12](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.11...v8.6.12) (2026-09-24)


### Bug Fixes

* report onLayout from the wrapper view ([#1095](https://github.com/DylanVann/react-native-fast-image/issues/1095)) ([77d6c2d](https://github.com/DylanVann/react-native-fast-image/commit/77d6c2d12d493470582dd8f6f8277aedc7c166bf))

## [8.6.11](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.10...v8.6.11) (2026-09-24)


### Bug Fixes

* **types:** add target to the onLoad event ([#1094](https://github.com/DylanVann/react-native-fast-image/issues/1094)) ([820770b](https://github.com/DylanVann/react-native-fast-image/commit/820770b53dbe67e89fc3ad145e177f5302335137))

## [8.6.10](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.9...v8.6.10) (2026-09-24)


### Bug Fixes

* **types:** export the Cache type ([#1093](https://github.com/DylanVann/react-native-fast-image/issues/1093)) ([2d257c0](https://github.com/DylanVann/react-native-fast-image/commit/2d257c0ba65fff93eb6a6cdc35d3c41d0f3fcf55))

## [8.6.9](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.8...v8.6.9) (2026-09-24)


### Bug Fixes

* allow React 19 as a peer dependency ([#1092](https://github.com/DylanVann/react-native-fast-image/issues/1092)) ([bc195e8](https://github.com/DylanVann/react-native-fast-image/commit/bc195e827d5a8b797c80cce5690fe3488d297796))

## [8.6.8](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.7...v8.6.8) (2026-09-24)


### Bug Fixes

* don't crash on a defaultSource without a source, or a preload without a uri ([#1091](https://github.com/DylanVann/react-native-fast-image/issues/1091)) ([a1f247f](https://github.com/DylanVann/react-native-fast-image/commit/a1f247fd5150d3deaf50e13a4ed553023365a27d))

## [8.6.7](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.6...v8.6.7) (2026-09-24)


### Bug Fixes

* **ios:** don't crash when an event handler is removed after loading ([#1088](https://github.com/DylanVann/react-native-fast-image/issues/1088)) ([8a1a7d7](https://github.com/DylanVann/react-native-fast-image/commit/8a1a7d7124fdca8baa5976216d6e56374174ed79)), closes [#504](https://github.com/DylanVann/react-native-fast-image/issues/504)

## [8.6.6](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.5...v8.6.6) (2026-09-24)


### Bug Fixes

* **ios:** draw tinted images with UIGraphicsImageRenderer ([#1087](https://github.com/DylanVann/react-native-fast-image/issues/1087)) ([068fcb7](https://github.com/DylanVann/react-native-fast-image/commit/068fcb71ad4d02c35db472676587114b838a7315)), closes [#1007](https://github.com/DylanVann/react-native-fast-image/issues/1007) [#1010](https://github.com/DylanVann/react-native-fast-image/issues/1010) [#1002](https://github.com/DylanVann/react-native-fast-image/issues/1002)

## [8.6.5](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.4...v8.6.5) (2026-09-24)


### Bug Fixes

* **types:** base ImageStyle on ViewStyle ([#1086](https://github.com/DylanVann/react-native-fast-image/issues/1086)) ([5a074ec](https://github.com/DylanVann/react-native-fast-image/commit/5a074ecc53df6619fd83c412553cf17340ff7288))

## [8.6.4](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.3...v8.6.4) (2026-09-24)


### Bug Fixes

* **ios:** prevent tintColor crash on zero-size images ([#1082](https://github.com/DylanVann/react-native-fast-image/issues/1082)) ([57f6a2b](https://github.com/DylanVann/react-native-fast-image/commit/57f6a2b613dd00d6a6f7d80337d6010235cd0e8c))

## [8.6.3](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.2...v8.6.3) (2022-10-31)


### Bug Fixes

* tintColor in fallback Image ([#882](https://github.com/DylanVann/react-native-fast-image/issues/882)) ([fbb6b68](https://github.com/DylanVann/react-native-fast-image/commit/fbb6b68a606f8f1fb9b570243d65bd410f21f63e))
* use ColorValue type ([#939](https://github.com/DylanVann/react-native-fast-image/issues/939)) ([54376d8](https://github.com/DylanVann/react-native-fast-image/commit/54376d87f7e3826b884374a429c3879635dea246))

## [8.6.2](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.1...v8.6.2) (2022-10-31)


### Bug Fixes

* Add tintColor to Flow FastImageProps type ([#871](https://github.com/DylanVann/react-native-fast-image/issues/871)) ([37abecd](https://github.com/DylanVann/react-native-fast-image/commit/37abecd3ff5092a136542a24320f7790a6ed8ba0))

## [8.6.1](https://github.com/DylanVann/react-native-fast-image/compare/v8.6.0...v8.6.1) (2022-09-05)


### Bug Fixes

* Flow syntax error ([#924](https://github.com/DylanVann/react-native-fast-image/issues/924)) ([a10ab3f](https://github.com/DylanVann/react-native-fast-image/commit/a10ab3f87fb2b72d68e3ef1daab71eb8f8cca960))

# [8.6.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.12...v8.6.0) (2022-08-29)


### Features

* support defaultSource on iOS and Android ([#921](https://github.com/DylanVann/react-native-fast-image/issues/921)) ([ec7c453](https://github.com/DylanVann/react-native-fast-image/commit/ec7c4535139ae759b5ce5531aadb7612a5a744d0))

## [8.5.12](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.11...v8.5.12) (2022-08-28)


### chore

* Update React peerDependency to "^17 || ^18" ([6255fc4](https://github.com/DylanVann/react-native-fast-image/commit/6255fc4f9deea0b83476ddb0c5389d0076ab6cfc))


### BREAKING CHANGES

* This package will no longer support React 16.

## [8.5.11](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.10...v8.5.11) (2021-09-27)


### Bug Fixes

* null exception in FastImageViewManager.java ([#423](https://github.com/DylanVann/react-native-fast-image/issues/423)) ([a7a8643](https://github.com/DylanVann/react-native-fast-image/commit/a7a8643ed4988f3726a8ac8a0256f4d4ca3feb6f))

## [8.5.10](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.9...v8.5.10) (2021-09-27)

## [8.5.9](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.8...v8.5.9) (2021-09-27)


### Bug Fixes

* FastImage extends ViewProps ([#829](https://github.com/DylanVann/react-native-fast-image/issues/829)) ([68db871](https://github.com/DylanVann/react-native-fast-image/commit/68db8712bff865e6b5464b02c956d5198529a2f7)), closes [#819](https://github.com/DylanVann/react-native-fast-image/issues/819)

## [8.5.8](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.7...v8.5.8) (2021-09-17)

## [8.5.7](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.6...v8.5.7) (2021-09-17)

## [8.5.6](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.5...v8.5.6) (2021-09-16)


### Bug Fixes

* make corresponding flow file for .cjs file ([77326e8](https://github.com/DylanVann/react-native-fast-image/commit/77326e8b09954ab8c27785fe84427b1ed3d9290f)), closes [#784](https://github.com/DylanVann/react-native-fast-image/issues/784)

## [8.5.5](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.4...v8.5.5) (2021-09-15)


### Bug Fixes

* do not crash when source is invalid ([#782](https://github.com/DylanVann/react-native-fast-image/issues/782)) ([5c5fefa](https://github.com/DylanVann/react-native-fast-image/commit/5c5fefacbdbc4d02c1eb71bca88fa1d012750b87))

## [8.5.4](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.3...v8.5.4) (2021-09-15)


### Bug Fixes

* **android:** update Glide ([86edd7f](https://github.com/DylanVann/react-native-fast-image/commit/86edd7ffc54a293cd732801fc70c0d4ada03899c))

## [8.5.3](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.2...v8.5.3) (2021-09-15)


### Bug Fixes

* **ios:** update SDWebImage ([#740](https://github.com/DylanVann/react-native-fast-image/issues/740)) ([a1eeb75](https://github.com/DylanVann/react-native-fast-image/commit/a1eeb75b19523e9514d3cb1c79cbe629e209d57e))

## [8.5.2](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.1...v8.5.2) (2021-09-15)


### Bug Fixes

* **android:** replace jcenter with mavenCentral ([69c9422](https://github.com/DylanVann/react-native-fast-image/commit/69c942276fedbb517eaf0d45f8fb3fdb8a191b2a))

## [8.5.1](https://github.com/DylanVann/react-native-fast-image/compare/v8.5.0...v8.5.1) (2021-09-15)


### Bug Fixes

* improve/update build.gradle ([1f04c55](https://github.com/DylanVann/react-native-fast-image/commit/1f04c5542c6138d58446c58c3f3a5614772f81f1))

# [8.5.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.4.1...v8.5.0) (2021-09-15)


### Features

* **ios:** cancel image load when unmounted ([#787](https://github.com/DylanVann/react-native-fast-image/issues/787)) ([f1588be](https://github.com/DylanVann/react-native-fast-image/commit/f1588beec0e0684d99b10a3a9e8824cfd795f998))

## [8.4.1](https://github.com/DylanVann/react-native-fast-image/compare/v8.4.0...v8.4.1) (2021-09-15)

# [8.4.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.3.7...v8.4.0) (2021-09-15)


### Bug Fixes

* export FastImageStaticProperties ([#822](https://github.com/DylanVann/react-native-fast-image/issues/822)) ([d69f692](https://github.com/DylanVann/react-native-fast-image/commit/d69f6921590279a5d0f943b6b4b6879047d78d57))
* update dv-scripts ([61fab12](https://github.com/DylanVann/react-native-fast-image/commit/61fab122ab90b404714035789e42d711ed1f93ab))
* update dv-scripts ([3c6d0f4](https://github.com/DylanVann/react-native-fast-image/commit/3c6d0f4c7bfce991bcbad02ce5816d93a93121e5))


### Features

* add clear image cache from memory and disk ([#425](https://github.com/DylanVann/react-native-fast-image/issues/425)) ([818ed0c](https://github.com/DylanVann/react-native-fast-image/commit/818ed0c3f59f825144609479047190f9bfd6dc76))

## [8.3.7](https://github.com/DylanVann/react-native-fast-image/compare/v8.3.6...v8.3.7) (2021-07-24)

## [8.3.6](https://github.com/DylanVann/react-native-fast-image/compare/v8.3.5...v8.3.6) (2021-07-08)

## [8.3.5](https://github.com/DylanVann/react-native-fast-image/compare/v8.3.4...v8.3.5) (2021-07-06)


### Bug Fixes

* add react@17 as peer dependency ([#790](https://github.com/DylanVann/react-native-fast-image/issues/790)) ([27bd586](https://github.com/DylanVann/react-native-fast-image/commit/27bd58630cff4e10fea0bb835555bb7ad8b62da0))

## [8.3.4](https://github.com/DylanVann/react-native-fast-image/compare/v8.3.3...v8.3.4) (2020-11-17)

## [8.3.3](https://github.com/DylanVann/react-native-fast-image/compare/v8.3.2...v8.3.3) (2020-11-01)


### Bug Fixes

* xcode 12 compatibility ([#732](https://github.com/DylanVann/react-native-fast-image/issues/732)) ([23c3955](https://github.com/DylanVann/react-native-fast-image/commit/23c3955473a94477c52c0ec2b9f4f51e9377be06))

## [8.3.2](https://github.com/DylanVann/react-native-fast-image/compare/v8.3.1...v8.3.2) (2020-07-17)


### Bug Fixes

* **android:** remove explicit use of UI thread ([#698](https://github.com/DylanVann/react-native-fast-image/issues/698)) ([5d2894e](https://github.com/DylanVann/react-native-fast-image/commit/5d2894e442dc3d239b4dc9cb25dca455f7d8bc6e))

## [8.3.1](https://github.com/DylanVann/react-native-fast-image/compare/v8.3.0...v8.3.1) (2020-07-17)


### Bug Fixes

* **android:** make center ResizeMode work correctly ([d648ef8](https://github.com/DylanVann/react-native-fast-image/commit/d648ef85045fb97d8d1f6a637e915fa912a6c6c9))

# [8.3.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.2.2...v8.3.0) (2020-07-17)


### Features

* **ios:** allow for for per-image-request-headers ([#691](https://github.com/DylanVann/react-native-fast-image/issues/691)) ([4a7cd64](https://github.com/DylanVann/react-native-fast-image/commit/4a7cd64f5b0aa40b04d63ccb105ee2b511abe624))

## [8.2.2](https://github.com/DylanVann/react-native-fast-image/compare/v8.2.1...v8.2.2) (2020-07-17)


### Bug Fixes

* accessibilityIgnoresInvertColors prop not recognised when using TypeScript ([#666](https://github.com/DylanVann/react-native-fast-image/issues/666)) ([22f89e4](https://github.com/DylanVann/react-native-fast-image/commit/22f89e43a422150412924da9fd0f3eca7dd77cfa)), closes [/github.com/DylanVann/react-native-fast-image/blob/master/src/index.tsx#L150-L160](https://github.com//github.com/DylanVann/react-native-fast-image/blob/master/src/index.tsx/issues/L150-L160)

## [8.2.1](https://github.com/DylanVann/react-native-fast-image/compare/v8.2.0...v8.2.1) (2020-07-17)


### Bug Fixes

* remove cache property if using fallback ([ba0f238](https://github.com/DylanVann/react-native-fast-image/commit/ba0f238821ba23517b8e62e759f685b8cd67c0c6))

# [8.2.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.10...v8.2.0) (2020-07-17)


### Features

* export ResizeMode and Priority types ([#678](https://github.com/DylanVann/react-native-fast-image/issues/678)) ([e33664f](https://github.com/DylanVann/react-native-fast-image/commit/e33664fbcff4be7b180c3843422f76e9d0b1c4f8))

## [8.1.10](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.9...v8.1.10) (2020-07-17)


### Bug Fixes

* update SDWebImage and SDWebImageWebPCoder ([#689](https://github.com/DylanVann/react-native-fast-image/issues/689)) ([9646456](https://github.com/DylanVann/react-native-fast-image/commit/964645667525dc09f625bc471548b995e01d0061))

## [8.1.9](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.8...v8.1.9) (2020-07-17)


### Bug Fixes

* wrong cache type ([#688](https://github.com/DylanVann/react-native-fast-image/issues/688)) [skip ci] ([94e2256](https://github.com/DylanVann/react-native-fast-image/commit/94e2256da234d535e88172ce325c89e7cb69fc6e))

## [8.1.8](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.7...v8.1.8) (2020-07-17)


### Bug Fixes

* peer dependency warning ([#653](https://github.com/DylanVann/react-native-fast-image/issues/653)) ([cd81b1b](https://github.com/DylanVann/react-native-fast-image/commit/cd81b1b66a8d9938764a66e1f3c1bd5ff20b3565))

## [8.1.7](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.6...v8.1.7) (2020-07-17)

## [8.1.6](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.5...v8.1.6) (2020-07-17)

### Changed

* Use [`dv-scripts`](https://github.com/DylanVann/dv-scripts) to simplify tooling (build, lint, test, release).

## [8.1.5](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.4...v8.1.5) (2020-03-14)


### Bug Fixes

* Updates SDWebImageWebPCoder. ([#628](https://github.com/DylanVann/react-native-fast-image/issues/628)) ([325d77f](https://github.com/DylanVann/react-native-fast-image/commit/325d77f4c2e2e1437c0dda160b6047473d7c8a07))

## [8.1.4](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.3...v8.1.4) (2020-03-12)


### Bug Fixes

* Bump Glide version number to v4.11.0. ([#649](https://github.com/DylanVann/react-native-fast-image/issues/649)) ([c4e4306](https://github.com/DylanVann/react-native-fast-image/commit/c4e4306c15bda65d95e97ab9f45ef5e351128253)), closes [#536](https://github.com/DylanVann/react-native-fast-image/issues/536)

## [8.1.3](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.2...v8.1.3) (2020-03-12)


### Bug Fixes

* Replace 'Component' with 'ComponentType' ([#647](https://github.com/DylanVann/react-native-fast-image/issues/647)) ([6abb273](https://github.com/DylanVann/react-native-fast-image/commit/6abb273ce590ab7a111695a601b603823ac0bf4e))

## [8.1.2](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.1...v8.1.2) (2020-03-09)


### Bug Fixes

* Fixes podspec syntax. ([b627646](https://github.com/DylanVann/react-native-fast-image/commit/b627646001e334ece89c49e0aa6bc403f496f8ce))

## [8.1.1](https://github.com/DylanVann/react-native-fast-image/compare/v8.1.0...v8.1.1) (2020-03-09)


### Bug Fixes

* Add git tag to CocoaPods source property ([#601](https://github.com/DylanVann/react-native-fast-image/issues/601)) ([2d706ad](https://github.com/DylanVann/react-native-fast-image/commit/2d706ad7da6410a3a2382b70ed90369f0473117e))

# [8.1.0](https://github.com/DylanVann/react-native-fast-image/compare/v8.0.0...v8.1.0) (2020-03-09)


### Features

* converts to TypeScript ([#642](https://github.com/DylanVann/react-native-fast-image/issues/642)) ([ac11706](https://github.com/DylanVann/react-native-fast-image/commit/ac117060ebdd04b2130bfb23c62f203beb077089))

# [8.0.0](https://github.com/DylanVann/react-native-fast-image/compare/v7.0.2...v8.0.0) (2019-10-20)


### Features

* Add cookie support for iOS. ([#284](https://github.com/DylanVann/react-native-fast-image/issues/284)) ([ae47bff](https://github.com/DylanVann/react-native-fast-image/commit/ae47bff))


### BREAKING CHANGES

* This changes how network requests are handled on iOS. Make sure they still work for you.

## [7.0.2](https://github.com/DylanVann/react-native-fast-image/compare/v7.0.1...v7.0.2) (2019-07-05)


### Bug Fixes

* Fix peer dependency and remove prop-types. ([44a4c8b](https://github.com/DylanVann/react-native-fast-image/commit/44a4c8b))

## [7.0.1](https://github.com/DylanVann/react-native-fast-image/compare/v7.0.0...v7.0.1) (2019-07-05)


### Bug Fixes

* Fix IllegalArgumentException crash (Android). ([#511](https://github.com/DylanVann/react-native-fast-image/issues/511)) ([b6c4677](https://github.com/DylanVann/react-native-fast-image/commit/b6c4677))

# [7.0.0](https://github.com/DylanVann/react-native-fast-image/compare/v6.1.1...v7.0.0) (2019-07-05)


### Features

* Upgrade to React Native 0.60.0 / CocoaPods / Android X. ([#513](https://github.com/DylanVann/react-native-fast-image/issues/513)) ([5489f9e](https://github.com/DylanVann/react-native-fast-image/commit/5489f9e))


### BREAKING CHANGES

* You should upgrade React Native. See https://facebook.github.io/react-native/blog/2019/07/03/version-60

## [6.1.1](https://github.com/DylanVann/react-native-fast-image/compare/v6.1.0...v6.1.1) (2019-07-03)


### Bug Fixes

* Loading images by reverting "bug: Use device scale when loading images.". ([0326c3e](https://github.com/DylanVann/react-native-fast-image/commit/0326c3e)), closes [#509](https://github.com/DylanVann/react-native-fast-image/issues/509)

# [6.1.0](https://github.com/DylanVann/react-native-fast-image/compare/v6.0.5...v6.1.0) (2019-06-30)


### Features

* Add tvOS target. ([#486](https://github.com/DylanVann/react-native-fast-image/issues/486)) ([6805972](https://github.com/DylanVann/react-native-fast-image/commit/6805972))

## [6.0.5](https://github.com/DylanVann/react-native-fast-image/compare/v6.0.4...v6.0.5) (2019-06-28)


### Bug Fixes

* Fix incorrect syntax. ([11f6047](https://github.com/DylanVann/react-native-fast-image/commit/11f6047))

## [6.0.4](https://github.com/DylanVann/react-native-fast-image/compare/v6.0.3...v6.0.4) (2019-06-28)


### Bug Fixes

* Fix setting props order issue for iOS. ([#303](https://github.com/DylanVann/react-native-fast-image/issues/303)) ([5597ed0](https://github.com/DylanVann/react-native-fast-image/commit/5597ed0)), closes [#304](https://github.com/DylanVann/react-native-fast-image/issues/304)

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
