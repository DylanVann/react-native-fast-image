# Formats

Which image formats FastImage shows on iOS and Android, from which versions, and what decodes each one. The [README](../README.md#image-formats) has the short version, for recent iOS and Android versions.

These are tested on iOS 27 and Android 16 in both example apps (the regression runner's `formats` cases); the minimum versions are the ones Apple and Android give for decoding the format. An image in a format that doesn't load fails with `onError`. On the web, the browser shows the image, so it's the formats the browser supports.

## iOS

FastImage loads images with [SDWebImage](https://github.com/SDWebImage/SDWebImage), which decodes most formats with ImageIO, Apple's image decoder.

| Format | Shows                           | Decoded by                                                                                                              |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| JPEG   | Yes                             | ImageIO                                                                                                                 |
| PNG    | Yes                             | ImageIO                                                                                                                 |
| APNG   | Animated                        | ImageIO, animated by SDWebImage                                                                                         |
| GIF    | Animated                        | ImageIO, animated by SDWebImage                                                                                         |
| WebP   | Animated; a still one iOS 14+   | Still ones ImageIO, animated ones libwebp                                                                               |
| AVIF   | iOS 16+; animated               | ImageIO, animated by SDWebImage                                                                                         |
| HEIC   | Yes                             | ImageIO                                                                                                                 |
| SVG    | Yes ([SVG images](#svg-images)) | [SDWebImageSVGCoder](https://github.com/SDWebImage/SDWebImageSVGCoder) (Apple's SVG renderer), which FastImage includes |
| ICO    | Yes                             | ImageIO                                                                                                                 |
| BMP    | Yes                             | ImageIO                                                                                                                 |
| TIFF   | Yes                             | ImageIO                                                                                                                 |
| ICNS   | Yes                             | ImageIO                                                                                                                 |
| PSD    | Its composite image             | ImageIO                                                                                                                 |

Animated WebPs are decoded with libwebp, from [SDWebImageWebPCoder](https://github.com/SDWebImage/SDWebImageWebPCoder), which FastImage includes. FastImage registers its coder for animated WebPs, unless the app has registered a WebP coder itself (libwebp's, or SDWebImage's ImageIO one), which then decodes them instead. Animated AVIFs are decoded with ImageIO too, by FastImage's coder for them (SDWebImage's own only decodes their first frame), unless the app has registered libavif's coder ([SDWebImageAVIFCoder](https://github.com/SDWebImage/SDWebImageAVIFCoder)), which then decodes them instead. On iOS 13, a still WebP loads if the app registers libwebp's coder for all WebPs: `[[SDImageCodersManager sharedManager] addCoder:[SDImageWebPCoder sharedCoder]];` in its `AppDelegate`.

## Android

FastImage loads images with [Glide](https://github.com/bumptech/glide), which decodes most formats with Android's own decoders.

| Format | Shows                                            | Decoded by                                                                           |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| JPEG   | Yes                                              | Android's decoder                                                                    |
| PNG    | Yes                                              | Android's decoder                                                                    |
| APNG   | Animated ([Animated PNG](#animated-png-android)) | [APNG4Android](https://github.com/penfeizhou/APNG4Android), which FastImage includes |
| GIF    | Animated                                         | Glide's GIF decoder                                                                  |
| WebP   | Yes; animated ones Android 9+                    | Android's decoder; animated ones `ImageDecoder` (an `AnimatedImageDrawable`)         |
| AVIF   | Android 14+[^android-avif]; animated             | Android's decoder; animated ones `ImageDecoder` (an `AnimatedImageDrawable`)         |
| HEIC   | Android 8+                                       | Android's decoder                                                                    |
| SVG    | Yes ([SVG images](#svg-images))                  | [AndroidSVG](https://bigbadaboom.github.io/androidsvg/), which FastImage includes    |
| ICO    | Yes                                              | Android's decoder                                                                    |
| BMP    | Yes                                              | Android's decoder                                                                    |
| TIFF   | No                                               |                                                                                      |
| ICNS   | No                                               |                                                                                      |
| PSD    | No                                               |                                                                                      |

Animated WebP and AVIF need Glide 4.15 or later (FastImage uses 4.16 unless the app sets an older `glideVersion`, see [Android build settings](android-build-settings.md#older-glide-versions)); with an older Glide they show their first frame.

## SVG images

SVG images (remote, bundled with `require()`, or local files) load with SDWebImageSVGCoder on iOS and AndroidSVG on Android, which FastImage includes. On Android, an app with AndroidSVG's other package (`com.caverock:androidsvg`) leaves FastImage's out: see [duplicate AndroidSVG classes](troubleshooting.md#duplicate-androidsvg-classes).

An SVG is drawn at the size it's shown at, so it's sharp at any size, and then works like any other image: `resizeMode`, `tintColor`, `blurRadius`, `transition` and caching. `onLoad` reports the SVG's own size: its `width` and `height`, or its `viewBox`'s (300x150 if it has neither). Animated SVGs (SMIL or CSS animations) show their first state.

## Animated PNG (Android)

APNG (animated PNG) images animate on Android with [APNG4Android](https://github.com/penfeizhou/APNG4Android), which FastImage includes.

APNGs work like other animated images: `loop`, `paused` (which continues from the frame it paused on), and a still first frame with `blurRadius` or `resizeMode="repeat"`. Each frame is decoded as it plays, at about the size it's shown at, off the main thread.

[^android-avif]: Android 14 is the first version that requires an AVIF decoder; many devices on Android 12 and 13 have one too.
