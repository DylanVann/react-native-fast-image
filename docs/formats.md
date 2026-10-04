# Formats

Which image formats FastImage shows on iOS and Android, from which versions, and what decodes each one. The [README](../README.md#image-formats) has the short version, for recent iOS and Android versions.

These are tested on iOS 27 and Android 16 in both example apps (the regression runner's `formats` cases); the minimum versions are the ones Apple and Android give for decoding the format. An image in a format that doesn't load fails with `onError`. On the web, the browser shows the image, so it's the formats the browser supports.

## iOS

FastImage loads images with [SDWebImage](https://github.com/SDWebImage/SDWebImage), which decodes most formats with ImageIO, Apple's image decoder.

| Format                    | Shows                                          | Decoded by                                                                                                                                     |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| JPEG, PNG, BMP, ICO, TIFF | Yes                                            | ImageIO                                                                                                                                        |
| HEIC                      | iOS 11+                                        | ImageIO                                                                                                                                        |
| GIF                       | Animated                                       | ImageIO, animated by SDWebImage                                                                                                                |
| APNG                      | Animated                                       | ImageIO, animated by SDWebImage                                                                                                                |
| WebP                      | Animated; a still one iOS 14+                  | Still ones ImageIO; animated ones libwebp ([SDWebImageWebPCoder](https://github.com/SDWebImage/SDWebImageWebPCoder), which FastImage includes) |
| AVIF                      | iOS 16+; an animated one shows its first frame | ImageIO                                                                                                                                        |
| SVG                       | iOS 13+, with an [SVG library](#svg-images)    | [SDWebImageSVGCoder](https://github.com/SDWebImage/SDWebImageSVGCoder) (Apple's SVG renderer)                                                  |

FastImage registers libwebp's coder for animated WebPs, unless the app has registered a WebP coder itself (libwebp's, or SDWebImage's ImageIO one), which then decodes them instead. On iOS 13, a still WebP loads if the app registers libwebp's coder for all WebPs: `[[SDImageCodersManager sharedManager] addCoder:[SDImageWebPCoder sharedCoder]];` in its `AppDelegate`.

## Android

FastImage loads images with [Glide](https://github.com/bumptech/glide), which decodes most formats with Android's own decoders.

| Format                          | Shows                                                                      | Decoded by                                                                           |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| JPEG, PNG, BMP, ICO, still WebP | Yes                                                                        | Android's decoder                                                                    |
| HEIC                            | Android 8+                                                                 | Android's decoder                                                                    |
| GIF                             | Animated                                                                   | Glide's GIF decoder                                                                  |
| Animated WebP                   | Animated, Android 9+                                                       | Android's `ImageDecoder` (an `AnimatedImageDrawable`)                                |
| APNG                            | Animated, with `minSdkVersion` 21+ ([Animated PNG](#animated-png-android)) | [APNG4Android](https://github.com/penfeizhou/APNG4Android), which FastImage includes |
| AVIF                            | Android 14+[^android-avif]; animated                                       | Android's decoder; animated ones `ImageDecoder` (an `AnimatedImageDrawable`)         |
| TIFF                            | No                                                                         |                                                                                      |
| SVG                             | With an [SVG library](#svg-images)                                         | [AndroidSVG](https://bigbadaboom.github.io/androidsvg/)                              |

Animated WebP and AVIF need Glide 4.15 or later (FastImage uses 4.16 unless the app sets an older `glideVersion`, see [Android build settings](android-build-settings.md#older-glide-versions)); with an older Glide they show their first frame.

## SVG images

SVG images (remote, bundled with `require()`, or local files) load when the app has an SVG library: SDWebImageSVGCoder on iOS and AndroidSVG on Android. Add them to the app:

```ruby
# ios/Podfile
pod 'SDWebImageSVGCoder'
```

```groovy
// android/app/build.gradle
dependencies {
    implementation 'com.caverock:androidsvg-aar:1.4'
}
```

On Android either of AndroidSVG's packages works (`com.caverock:androidsvg-aar` or `com.caverock:androidsvg`), so an app that already has one needs nothing more. With Expo, add the pod with [expo-build-properties](https://docs.expo.dev/versions/latest/sdk/build-properties/) (`{ "ios": { "extraPods": [{ "name": "SDWebImageSVGCoder" }] } }`).

An SVG is drawn at the size it's shown at, so it's sharp at any size, and then works like any other image: `resizeMode`, `tintColor`, `blurRadius`, `transition` and caching. `onLoad` reports the SVG's own size: its `width` and `height`, or its `viewBox`'s (300x150 if it has neither). Animated SVGs (SMIL or CSS animations) show their first state. On iOS, SVG images need iOS 13 or later. Without the SVG library, an SVG image fails with `onError`, saying what to add (on iOS, for a url that ends in `.svg`).

## Animated PNG (Android)

APNG (animated PNG) images animate on Android with [APNG4Android](https://github.com/penfeizhou/APNG4Android), which FastImage includes when the app's `minSdkVersion` is 21 or later (React Native 0.64 and later by default). With an older `minSdkVersion` they show their first frame.

APNGs work like other animated images: `loop`, `paused` (which continues from the frame it paused on), and a still first frame with `blurRadius` or `resizeMode="repeat"`. Each frame is decoded as it plays, at about the size it's shown at, off the main thread.

[^android-avif]: Android 14 is the first version that requires an AVIF decoder; many devices on Android 12 and 13 have one too.
