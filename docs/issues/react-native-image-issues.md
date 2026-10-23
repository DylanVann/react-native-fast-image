# Issues found in React Native's Image

Fast Image's maintainers found these while comparing Fast Image with React Native's built-in `Image`. Fast Image fixes or works around each issue in the main sections in its own code, as described there; the last section lists issues Fast Image has no counterpart for. They were checked against React Native's `main` branch at commit `27e7721` (2026-10-16, after 0.88.0) on 2026-10-18. Paths are relative to the react-native repository. If you maintain React Native's `Image`, feel free to hand this file to your coding agent.

## Android network images are decoded at full size

- **What happens:** with the default `resizeMethod="auto"`, a downloaded image is decoded at its full size whatever the size of the view, so large photos in small views use a lot of memory, and some of them fail to load. In Fast Image's benchmark, 20 photos of 4000 × 3000 px in small views took 269 MB on a Pixel 8 (the other libraries measured 92–102 MB), and the last 4 didn't show, with Fresco's `Pool hard cap violation`.
- **Where:** `packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/image/ReactImageView.kt`, `shouldResize()`: with `ImageResizeMethod.AUTO` it only returns true for local `content://` and `file://` uris, so `maybeUpdateViewFromRequest()` passes no `ResizeOptions` for network images, and Fresco's downsampling (`DownsampleMode.AUTO` in `modules/fresco/FrescoModule.kt`) has no target size.
- **How to reproduce:** Reproduced in Fast Image's benchmark (React Native 0.86.3, the "Large" scenario in [benchmarks.md](../benchmarks.md#android)). Show 20 photos of 4000 × 3000 px from a server in 100 dp views and read the app's memory; `resizeMethod="resize"` on each image avoids it.
- **How Fast Image handles it:** on Android, Glide decodes an image larger than its view at about the view's size by default (the `downsample` prop, on by default), whatever the image's source, and decodes it again from the disk cache if the view grows. See [`downsample`](../../README.md#downsample).

## Android tiled images sometimes use another image's tile transform

- **What happens:** when several `Image`s with `resizeMode="repeat"` are processed at the same time, one of them sometimes draws its tiles with another's scale (smaller and blurred tiles, in Fast Image's case a scaled-down transform from a neighboring image).
- **Where:** `packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/image/ReactImageView.kt`, `TilePostprocessor.process()` computes the transform into `tileMatrix`, a single `Matrix` in the companion object, so it's shared by every `ReactImageView`. Postprocessors run on Fresco's background threads, so two views can write and read it at the same time. A `Matrix` created inside `process()` would avoid it.
- **How to reproduce:** Reproduced intermittently in Fast Image's regression runner: three `Image`s with `resizeMode="repeat"` side by side (one of them with an image larger than the view, so it's scaled down), mounted at once; now and then one of the others draws with the scaled-down transform. Fast Image's tests now mask React Native's tiled `Image` on Android ([#1234](https://github.com/DylanVann/react-native-fast-image/pull/1234)).
- **How Fast Image handles it:** Fast Image 9.x tiled with a drawable per view, with its own matrix ([#1196](https://github.com/DylanVann/react-native-fast-image/pull/1196)). Fast Image no longer supports tiling.

## Android image downloads have no timeout

- **What happens:** a download that stalls (a connection that never answers, or a response that stops sending data) never fails, so the image never shows and never gets `onError` or `onLoadEnd`. Because Fresco shares one fetch per encoded image, every `Image` of that url waits on it.
- **Where:** `packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/network/OkHttpClientProvider.kt`, `createClientBuilder()` sets connect, read and write timeouts to 0 (none), and `modules/fresco/FrescoModule.kt` builds the image pipeline's network fetcher from `OkHttpClientProvider.createClient()`.
- **How to reproduce:** Found by reading the code. Point an `Image` at a server that accepts the connection and then sends nothing (or stops partway through the body), and wait for `onError`.
- **How Fast Image handles it:** Fast Image's image client gets 15-second connect and read timeouts, as SDWebImage uses on iOS, unless the app's own client already sets timeouts, so a stalled download fails with `onError` ([#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271)).

## iOS can show an earlier image's blur over a newer image

- **What happens:** with `blurRadius`, the blur runs on a background queue and its result is set on the image view when it finishes, whatever the view shows by then. If the source changes (or `blurRadius` changes) while a blur is running, a slower earlier blur can replace the newer image; and if the view is recycled for another `Image` meanwhile, the previous image's blurred copy shows in it.
- **Where:** `packages/react-native/React/Fabric/Mounting/ComponentViews/Image/RCTImageComponentView.mm`, `didReceiveImage:metadata:fromObserver:` checks the observer before it starts, then dispatches `RCTBlurredImageWithRadius` to a global queue and sets `self->_imageView.image = blurredImage` on the main queue without checking that the observer, state or image are still current (`prepareForRecycle` clears `_imageView.image`, but a pending blur sets it again).
- **How to reproduce:** Found by reading the code. Show a large image with `blurRadius={20}`, and switch `source` to a small one (or to one with `blurRadius={0}`) right after the first loads, before its blur has finished; the first image's blur then replaces the second image.
- **How Fast Image handles it:** a blur that finishes after another image was set on the view is dropped, and the view keeps showing what it showed until the blur is ready ([#1193](https://github.com/DylanVann/react-native-fast-image/pull/1193)).

## iOS downloads a url again while it's already downloading

- **What happens:** when a second `Image` asks for a url that's still downloading for another (for example a photo opened full size while its thumbnail is loading), it starts its own download of the same url. Downloads also run at most 4 at a time, in the order they were asked for, so that second download waits behind the others. In Fast Image's benchmark (60 photos loading, then the last one opened at the screen's width 100 ms later), React Native's `Image` made 61 requests and showed the photo at 800 ms (median), where the other libraries made 60 and showed it at 532–580 ms.
- **Where:** `packages/react-native/Libraries/Image/RCTImageLoader.mm`: `_loadImageOrDataWithURLRequest:...` checks the decoded image cache (`RCTImageCache`, which only has finished images) and then calls `_loadURLRequest:progressBlock:completionBlock:`, which creates a new `RCTNetworkTask` per request; `dequeueTasks` starts them in order, up to `maxConcurrentLoadingTasks` (4).
- **How to reproduce:** Reproduced in Fast Image's benchmark (React Native 0.86.3, "Opening a photo while others load" in [benchmarks.md](../benchmarks.md#ios)). Mount two `Image`s of different sizes with the same uncached url at the same time and count the requests the server gets.
- **How Fast Image handles it:** on iOS, Fast Image loads through SDWebImage's downloader, which keeps one download per url and adds later requests for it to that download, whatever size each view decodes it at.

## iOS tinted animated images don't animate tinted

- **What happens:** an animated GIF with `tintColor` doesn't play in the tint color.
- **Where:** `packages/react-native/React/Fabric/Mounting/ComponentViews/Image/RCTImageComponentView.mm`, `didReceiveImage:metadata:fromObserver:` tints with `[image imageWithRenderingMode:UIImageRenderingModeAlwaysTemplate]`, which makes a new image object. `RCTAnimatedImage`'s frame data (the image source, frame count and durations) are instance variables set only in `initWithData:scale:` (`packages/react-native/Libraries/Image/RCTAnimatedImage.mm`), so the copy doesn't carry them over. And `RCTUIImageViewAnimated` (`Libraries/Image/RCTUIImageViewAnimated.mm`, `displayDidRefresh:`) shows each frame from `animatedImageFrameAtIndex:` as it is, in the default rendering mode, so frames after the first aren't drawn as templates.
- **How to reproduce:** Found by reading the code, not run. Show an animated GIF with `tintColor="red"`; what it shows (a still tinted frame, or untinted frames) depends on the class UIKit gives the template copy.
- **How Fast Image handles it:** a still image is shown as a template with the view's `tintColor`, as React Native does, and an animated image's frames are tinted as they're decoded, with SDWebImage's `animationTransformer` (`SDImageTintTransformer`) ([#1195](https://github.com/DylanVann/react-native-fast-image/pull/1195)).

## iOS animates only GIF

- **What happens:** animated WebP, APNG and animated AVIF files show their first frame only on iOS.
- **Where:** `packages/react-native/Libraries/Image/RCTGIFImageDecoder.mm`, `canDecodeImageData:` only takes data starting with `GIF87a` or `GIF89a`, and `RCTAnimatedImage` reads frame durations and the loop count from the GIF dictionary (`kCGImagePropertyGIFDictionary`). Other files are decoded as still images.
- **How to reproduce:** Found by reading the code. Show an animated WebP, APNG or AVIF on iOS.
- **How Fast Image handles it:** Fast Image animates GIF, animated WebP ([#1222](https://github.com/DylanVann/react-native-fast-image/pull/1222)), APNG and animated AVIF (with ImageIO on iOS 16+, [#1239](https://github.com/DylanVann/react-native-fast-image/pull/1239)), with `loop` and `paused`.

## Android blurRadius is in the decoded bitmap's pixels, and a change reloads the image

- **What happens:** on Android, the same `blurRadius` blurs a large network image much less than a small one, because the radius is applied to the bitmap as decoded, and network images are decoded at full size (see the first issue): a 1024 px photo at 64 dp with `blurRadius={6}` looks sharp. iOS blurs about in points, so the two platforms differ. Also, each change of `blurRadius` sends `onLoadStart`, `onLoad` and `onLoadEnd` again on Android (and `onLoad` and `onLoadEnd` on iOS, which requests the image again).
- **Where:** `packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/image/ReactImageView.kt`, `setBlurRadius()` turns the radius into `dp × density / 2` pixels for Fresco's `IterativeBoxBlurPostProcessor` and sets `isDirty`, so `maybeUpdateView()` submits a new request (its `onSubmit` sends `onLoadStart`). On iOS, `blurRadius` is part of `ImageRequestParams` in `packages/react-native/ReactCommon/react/renderer/components/image/ImageShadowNode.cpp` (`updateStateIfNeeded()`), so a change makes a new image request, and `RCTImageComponentView`'s `didReceiveImage:` sends `onLoad` and `onLoadEnd`.
- **How to reproduce:** the sharp 1024 px photo is reproduced in Fast Image's `blur` regression case, which shows React Native's `Image` next to Fast Image on the same photo from a 1024 px and a 256 px file. The events are found by reading the code: change `blurRadius` on a loaded image and log the load events.
- **How Fast Image handles it:** the image is blurred at about the size it's shown at, with React Native's iOS box-blur math on both platforms, so a radius looks the same on iOS and Android whatever the file's resolution ([#1193](https://github.com/DylanVann/react-native-fast-image/pull/1193)). A change blurs the image that's showing again without sending load events ([#1292](https://github.com/DylanVann/react-native-fast-image/pull/1292)).

## Android fades images in even with animations turned off

- **What happens:** network images fade in over 300 ms by default on Android, also when the user has turned animations off in the system settings ("Remove animations", or an animator duration scale of 0).
- **Where:** `packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/image/ReactImageView.kt`, `updateViewForSelectedSource()` sets `hierarchy.fadeDuration` to `fadeDurationMs` or `REMOTE_IMAGE_FADE_DURATION_MS` (300) for non-resource images, without checking the system's animation setting. Fresco's `FadeDrawable` times the fade with `SystemClock.uptimeMillis()` rather than an `Animator`, so the animator duration scale doesn't apply to it (checked in Fresco 3.7.0's classes; `main` uses 3.9.0).
- **How to reproduce:** Seen in Fast Image's burst benchmark (60 images fading in) on Firebase Test Lab's Pixel 8s, whose animations are off (an animator duration scale of 0), in runs before the benchmark started turning animations on for the test: React Native's `Image` drew extra frames for its fades, where Fast Image and expo-image drew none. To see it, turn on "Remove animations" (or set the animator duration scale to 0 in the developer options) and load a network image: it still fades in.
- **How Fast Image handles it:** the fade is a `ValueAnimator`, which follows the animator duration scale, so there's no fade when animations are off ([#1261](https://github.com/DylanVann/react-native-fast-image/pull/1261)). Checking `ValueAnimator.areAnimatorsEnabled()` (API 26+) before setting the fade duration would do the same.

## onProgress values are not bytes on Android, and the total can be negative on iOS

- **What happens:** on Android, `onProgress` sends Fresco's progress level, `loaded` from 0 to 10000 with `total` 10000, not bytes. On iOS, a response without a `Content-Length` (e.g. chunked) sends `total: -1`, so `loaded / total` is negative, and so is the event's `progress`.
- **Where:** Android: `packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/image/ReactImageDownloadListener.kt`, `onLevelChange()` calls `onProgressChange(level, MAX_LEVEL)` with `MAX_LEVEL = 10000` (the TODO in `ReactImageView.setShouldNotifyLoadEvents()` notes it). iOS: `packages/react-native/Libraries/Network/RCTNetworkTask.mm` passes `_response.expectedContentLength` (-1 when unknown) as the total, and `RCTImageManager.mm` (`ReactCommon/react/renderer/imagemanager/platform/ios/...`) sends `progress / total` as `progress`.
- **How to reproduce:** Found by reading the code. Log `onProgress` for an image served with chunked encoding on iOS, and any network image on Android.
- **How Fast Image handles it:** `onProgress` gets bytes on both platforms and a `progress` from 0 to 1, and isn't called while the total is unknown ([#1134](https://github.com/DylanVann/react-native-fast-image/pull/1134), [#1194](https://github.com/DylanVann/react-native-fast-image/pull/1194)).

## Android clears the image while a new source loads

- **What happens:** when `source` changes, Android shows the placeholder (`defaultSource`, or nothing) until the new image has loaded, so the view flashes blank; iOS keeps the previous image until the new one arrives.
- **Where:** `packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/image/ReactImageView.kt`, `maybeUpdateViewFromRequest()` reuses the controller with `setOldController(controller)`, and Fresco's `AbstractDraweeController.init()` resets the drawee hierarchy (`SettableDraweeHierarchy.reset()`) to its placeholder for the new request (only a multi-source image gets a cached low-res image meanwhile). iOS: `RCTImageComponentView` sets the new image in `didReceiveImage:` and clears only on failure.
- **How to reproduce:** Found by reading the code. Change an `Image`'s `source` from one loaded url to an uncached one on Android.
- **How Fast Image handles it:** the image showing stays until the new one has loaded, on both platforms, as browsers do; on Android the new request gets the previous image from the memory cache as its thumbnail. `recyclingKey` clears it when a list reuses the view for other content ([#1142](https://github.com/DylanVann/react-native-fast-image/pull/1142)).

## Several sources in a view without a size never load

- **What happens:** with `source` as an array of sizes, nothing loads until the view has a width and height, so an image whose size comes from its own `onLoad` (e.g. to keep its aspect ratio) never loads.
- **Where:** iOS: `packages/react-native/ReactCommon/react/renderer/components/image/ImageShadowNode.cpp` only calls `updateStateIfNeeded()` for several sources when the layout's width and height are above 0. Android: `ReactImageView.maybeUpdateView()` returns while `hasMultipleSources()` and the view's width or height is 0.
- **How to reproduce:** Found by reading the code. Render `<Image source={[{ uri: small, width: 100, height: 100 }, { uri: large, width: 1000, height: 1000 }]} onLoad={…} />` with no width or height in its style.
- **How Fast Image handles it:** a view with no size loads the largest source, and switches to the one that fits once it has a size, keeping the current image until the new one loads ([#1201](https://github.com/DylanVann/react-native-fast-image/pull/1201)).

## objectFit scale-down and none differ from CSS

- **What happens:** `objectFit: 'scale-down'` is treated as `contain`, so an image smaller than the view is scaled up, where CSS shows it at its own size. `objectFit: 'none'` (and `resizeMode="none"`) pins the image to the top-left corner, where CSS centers it; on Android it's also scaled down to fit. And an image's "own size" for `resizeMode="center"` is its size in device pixels for downloaded images on both platforms: a 40 × 40 px image is about 13 points on a 3× iPhone and 15 dp on the Android emulator, where CSS shows it at 40 CSS pixels. A bundled image is in points on iOS and at its file's pixels on Android.
- **Where:** `packages/react-native/Libraries/Image/ImageUtils.js`, `objectFitMap` maps `'scale-down'` to `'contain'`. iOS: `RCTContentModeFromImageResizeMode` in `ReactCommon/react/renderer/imagemanager/platform/ios/react/renderer/imagemanager/RCTImagePrimitivesConversions.h` maps `ImageResizeMode::None` to `UIViewContentModeTopLeft`. Android: `ImageResizeMode.kt` maps `none` to `ScaleTypeStartInside` (`ScaleTypeStartInside.kt`: scale at most 1, at the top-left). The pixel size: Android draws the bitmap as decoded (`CENTER_INSIDE`), and iOS decodes downloaded images at the screen's scale.
- **How to reproduce:** the sizes were checked on the iOS simulator and the Android emulator (2026-10-10, React Native 0.87); the mappings are found by reading the code. Show a 40 × 40 px downloaded image in a 200 × 200 view with each `objectFit`.
- **How Fast Image handles it:** `objectFit` follows CSS: `none` is the image at its own size, centered, and `scale-down` the smaller of `none` and `contain`; an image's own size is its pixels as points (dp on Android), and a bundled image's its size in points ([#1282](https://github.com/DylanVann/react-native-fast-image/pull/1282)).

## iOS keeps the rounded mask after overflow becomes visible

- **What happens:** an `Image` with a border radius is rounded through a mask on its `UIImageView` while `overflow` is `hidden` (the `Image` default). If `overflow` then changes to `visible`, the mask stays, so the image stays rounded; an `Image` that had `overflow: 'visible'` from the start isn't masked. The same props render differently depending on what the style was before. This is in React Native's view code, so it affects other components whose content view is a `UIImageView` too.
- **Where:** `packages/react-native/React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm`, `invalidateLayer`: it sets `self.currentContainerView.layer.mask = nil` and, when clipping (with `enableIOSViewClipToPaddingBox` off, the default), sets a mask on each `UIImageView` subview; when not clipping it doesn't remove those subview masks.
- **How to reproduce:** Found by reading the code for React Native's `Image`; Fast Image's single native view went through the same code and kept its rounded corners in a regression case that switches `overflow` from `hidden` to `visible` with a `borderRadius`, before the fix. To try: render an `Image` with `borderRadius: 40`, then change its style to `overflow: 'visible'`.
- **How Fast Image handles it:** Fast Image's view removes its image view's mask when `overflow` becomes `visible` ([#1262](https://github.com/DylanVann/react-native-fast-image/pull/1262)).

## iOS drops every header when one value isn't a string

- **What happens:** on iOS, a source whose `headers` has one value that isn't a string, such as a number from JSON (`{ Authorization: token, 'X-App-Version': 3 }`), loads with no headers at all, so a server that needs the others refuses the image. On Android, `getString` throws for a number value. Found by reading the code; whether that fails the load or crashes the app wasn't checked.
- **Where:**
    - iOS: `packages/react-native/React/Base/RCTConvert.mm`, `NSURLRequest:` sets `headers = nil` as soon as one value isn't an `NSString`, and logs it with `RCTLogInfo`.
    - Android: `packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/fresco/ReactOkHttpNetworkFetcher.kt`, `getHeaders()` reads each value with `readableMap.getString(key)`. That skips nulls but throws `UnexpectedNativeTypeException` for a number or a boolean.
- **How to reproduce:** Found by reading the code (React Native's `main` at `e9443bae7`, 2026-10-23). Show `<Image source={{ uri, headers: { 'x-token': 'a', 'x-n': 1 } }} />` with a url that needs `x-token`.
- **How Fast Image handles it:** both platforms send numbers and booleans as strings, as fetch does, leave out null and undefined values (headers that aren't set), and warn in development about values they can't send (objects) ([#1359](https://github.com/DylanVann/react-native-fast-image/pull/1359)).

## Some ARIA props do nothing

- **What happens:** `aria-live`, `aria-valuemax`, `aria-valuemin`, `aria-valuenow`, `aria-valuetext` and `id` on an `Image` have no effect on iOS and Android, though `Image` takes `View`'s props and `View` maps them all. So `<Image id="avatar" />` has no `nativeID`, and `aria-live` doesn't make it a live region.
- **Where:** `packages/react-native/Libraries/Image/Image.ios.js` and `Image.android.js` map only `aria-label`, `aria-labelledby`, `aria-hidden` and the state props (`aria-busy`, `aria-checked`, `aria-disabled`, `aria-expanded`, `aria-selected`). `Libraries/Components/View/View.js` maps the rest. The native views read none of the `aria-*` props.
- **How to reproduce:** Found by reading the code (React Native's `main` at `e9443bae7`, 2026-10-23). Render `<Image id="avatar" source={...} />` and look for a view with `nativeID` "avatar" in the inspector.
- **How Fast Image handles it:** it maps all of `View`'s ARIA props, and `id`, on iOS and Android, and on Android `accessible` makes it a TalkBack stop and `focusable` (and `tabIndex`) gives it keyboard and D-pad focus ([#1360](https://github.com/DylanVann/react-native-fast-image/pull/1360), [#1361](https://github.com/DylanVann/react-native-fast-image/pull/1361)).

## `accessible` makes an image a keyboard stop on Android

- **What happens:** on Android, `accessible` on an `Image` makes it focusable, so a keyboard, D-pad or Android TV remote stops on it, though an image has no action to take there. On iOS `accessible` only makes it a VoiceOver element. `focusable`, which is the prop for keyboard focus, does nothing on an `Image`.
- **Where:** `packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/image/ReactImageManager.kt`, `setAccessible` sets `view.isFocusable = accessible`; it has no `focusable` setter.
- **How to reproduce:** Found by reading the code (React Native's `main` at `e9443bae7`, 2026-10-23). Render `<Image accessible source={...} />` next to a button on Android TV and move focus with the D-pad.
- **How Fast Image handles it:** on Android, `accessible` (and `screenReaderFocusable`) make the image a TalkBack stop only, and `focusable` (and `tabIndex`) gives it keyboard and D-pad focus ([#1361](https://github.com/DylanVann/react-native-fast-image/pull/1361)).

## `focusable` doesn't make an image focusable on Apple TV

- **What happens:** with React Native tvOS, `<Image focusable />` or `<Image tabIndex={0} />` can't take focus on Apple TV, while a `View` with the same props can. Only `isTVSelectable` works on an `Image`.
- **Where:** react-native-tvos 0.87.1-1. `Libraries/Components/View/View.js` sets `isTVSelectable = focusable ?? isTVSelectable ?? false` on iOS and deletes `focusable`; `Libraries/Image/Image.ios.js` doesn't, and `React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm`'s `canBecomeFocused` reads only `isTVSelectable`.
- **How to reproduce:** Found by reading the code. Render `<Image focusable source={...} />` next to a button on Apple TV and move focus with the remote.
- **How Fast Image handles it:** on iOS it sends `focusable` as `isTVSelectable` too, as `View.js` does, and keeps `focusable`, which React Native reads on Apple TV from 0.88 ([#1362](https://github.com/DylanVann/react-native-fast-image/pull/1362)).

## Other issues

These were found while comparing implementations, but Fast Image has no counterpart for them, so there's no fix to point to.

### iOS downloads interrupted by the app going to the background may fail (possible)

- **What happens:** possibly, an image that's still downloading when the app goes to the background fails with `onError` when the app comes back, if it was away longer than the request's timeout, and stays empty. Not confirmed for React Native's `Image`: SDWebImage, which uses a 15-second timeout, does this (a suspended download times out with `NSURLErrorTimedOut` as soon as the app resumes); React Native's image requests use `NSURLRequest`'s default 60-second timeout, so the same would happen after more than a minute away.
- **Where:** `packages/react-native/ReactCommon/react/renderer/imagemanager/platform/ios/react/renderer/imagemanager/RCTImagePrimitivesConversions.h`, `NSURLRequestFromImageSource` sets no `timeoutInterval` (so 60 s); `packages/react-native/Libraries/Image/RCTImageLoader.mm`, `_loadURLRequest:progressBlock:completionBlock:` reports any task error to the view as a failure; nothing in `RCTImageLoader`, `RCTHTTPRequestHandler` or `RCTImageComponentView` observes the app going to the background or becoming active, or retries.
- **How to reproduce:** Unconfirmed. To confirm: start a large image download from a slow server (one that sends the body over several minutes), send the app to the background for more than 60 seconds, bring it back, and see whether the `Image` gets `onError` and stays empty, or finishes loading.
