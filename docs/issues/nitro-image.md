# Issues found in Nitro Image

FastImage's maintainers found these while comparing FastImage with Nitro Image (`react-native-nitro-image` and `react-native-nitro-web-image`, which loads web images); FastImage fixes or works around the issues in the main sections in its own code, as described in each. The last section lists issues FastImage has no counterpart for. They were checked against Nitro Image 0.15.2 (commit `c96240d`, 2026-09-14) on 2026-10-18, with Coil 3.3.0 on Android and SDWebImage on iOS. Paths are relative to the react-native-nitro-image repository. If you maintain Nitro Image, feel free to hand this file to your coding agent.

## Web images can't send cookies or headers

- **What happens:** images that need authentication don't load: web image requests carry neither the app's cookies nor any headers, on either platform, and there's no option to add headers.
- **Where:** `packages/react-native-nitro-web-image/src/specs/WebImageFactory.nitro.ts`: `AsyncImageLoadOptions` has no headers. iOS: `ios/Extensions/AsyncImageLoadOptions+toSDWebImageOptions.swift`, `toSDWebImageOptions()` never adds `.handleCookies`, and SDWebImage's downloader sets `HTTPShouldHandleCookies` only with that option. Android: `android/src/main/java/com/margelo/nitro/web/image/HybridWebImageFactory.kt` creates `ImageLoader(context)`, which uses Coil's default OkHttp fetcher (`OkHttpNetworkFetcherFactory()`, a plain `OkHttpClient()`), with no cookie jar.
- **How to reproduce:** Found by reading the code. Log in with `fetch` to a server that sets a session cookie, then show `<NitroImage image={{ url }} />` for an image that needs it.
- **How FastImage handles it:** `source.headers` are sent with that image's request (and its preload); on iOS, requests send the app's cookies (`SDWebImageHandleCookies`, [#284](https://github.com/DylanVann/react-native-fast-image/pull/284)), and on Android they go through React Native's OkHttp client with a cookie jar on React Native's `ForwardingCookieHandler`, so the app's cookies and interceptors apply ([#1138](https://github.com/DylanVann/react-native-fast-image/pull/1138), [#1277](https://github.com/DylanVann/react-native-fast-image/pull/1277)).

## Android keeps a response that isn't an image in the disk cache

- **What happens:** on Android, a successful (2xx) response that isn't an image, such as a captive portal's or a CDN's HTML page, is written to Coil's disk cache before it's decoded. Every later load of that url reads it from the disk cache and fails, without a request, even once the network is fine. Nitro Image has no way to clear the cache, and `forceRefresh` doesn't load anything on Android ([below](#android-forcerefresh-always-fails)).
- **Where:** `packages/react-native-nitro-web-image/android/src/main/java/com/margelo/nitro/web/image/HybridWebImageFactory.kt` and `HybridWebImageLoader.kt` load with Coil's defaults. In Coil 3.3.0, `NetworkFetcher.fetch()` calls `writeToDiskCache()` for any successful response, and the default `CacheStrategy.DEFAULT` returns the cached entry on later loads. iOS isn't affected: SDWebImage only stores images that decoded.
- **How to reproduce:** Found by reading the code. Serve an HTML page with status 200 at an image's url and load it on Android (it fails), then serve the image there and load it again: it still fails.
- **How FastImage handles it:** on Android, a response that isn't an image (its content type and its first bytes both checked, so a mislabelled image still loads) fails before it reaches Glide's disk cache ([#1178](https://github.com/DylanVann/react-native-fast-image/pull/1178)). `FastImage.clearDiskCache()` is there for anything else.

## iOS a url that failed once fails until the app is relaunched

- **What happens:** on iOS, after some failures of a url (data that isn't an image, an invalid url, or a network error other than the connectivity ones, such as a TLS failure), SDWebImage remembers the url and fails every later load of it without a request, until the app is relaunched (a JavaScript reload keeps them). This applies to `<NitroImage>`, `loadFromURLAsync` and `preload`. Connectivity errors (no connection, timeouts, lost connections) aren't remembered.
- **Where:** `packages/react-native-nitro-web-image/ios/Extensions/AsyncImageLoadOptions+toSDWebImageOptions.swift`, `toSDWebImageOptions()` never adds `.retryFailed`, used by `HybridWebImageLoader.requestImage(forView:)` and `SDWebImageManager+loadImage.swift`; `HybridWebImageFactory.preload(url:)` uses `SDWebImagePrefetcher.shared` with its default options (`.lowPriority`).
- **How to reproduce:** Found by reading the code. Serve an HTML page with status 200 at an image's url and show it on iOS, then serve the image there and show it again (or call `preload`): it fails with "Image url is blacklisted".
- **How FastImage handles it:** views load with `SDWebImageRetryFailed`, and so does `preload` since [#1177](https://github.com/DylanVann/react-native-fast-image/pull/1177), so a url that failed is requested again next time.

## Android clearing the image keeps the previous one

- **What happens:** on Android, setting `image` to `undefined` on a `<NativeNitroImage>` (for example when `useImage` fails to load a new source and returns no image) leaves the previous image on screen, and a load that was still running finishes into the view. On iOS the view is cleared.
- **Where:** `packages/react-native-nitro-image/android/src/main/java/com/margelo/nitro/image/HybridImageView.kt`, `updateImage()`: `image?.match(...)` does nothing when `image` is `null` (`prepareForRecycle()` clears the bitmap, but a prop change doesn't). `HybridWebImageLoader.dropImage(forView:)` (Android) is empty, so the Coil request isn't disposed. On iOS, `HybridImageView.swift`'s `updateImage()` sets `view.image = nil`.
- **How to reproduce:** Found by reading the code. Show `<NativeNitroImage image={loader} />`, then render it with `image={undefined}`.
- **How FastImage handles it:** on Android, a view whose source is cleared (or that's removed) cancels its request and releases its image ([#1165](https://github.com/DylanVann/react-native-fast-image/pull/1165)).

## Android downloads an image again for each size, and priority doesn't reorder downloads

- **What happens:** on Android, a url shown at two sizes at once (a thumbnail and a larger view of it) is downloaded once per size, and an image the user opens while a list loads waits behind the list's downloads. In FastImage's benchmark on Pixel 8 phones, 16 photos at two sizes made 32 requests and showed at 564 ms (median), against 16 requests and 348 ms for FastImage; a photo opened over a loading grid (without Nitro's `priority` option) showed at 832 ms, against 280 ms with FastImage's `priority: 'high'`. On iOS, SDWebImage shares the download (60 requests for 61 images, shown at 548 ms).
- **Where:** `packages/react-native-nitro-web-image/android/src/main/java/com/margelo/nitro/web/image/HybridWebImageLoader.kt`, `requestImage(forView:)` loads each view with its own Coil request, sized to the view, and Coil doesn't share a running download between requests of different sizes. `extensions/AsyncImagePriority+toCoroutineContext.kt` maps `priority: 'high'` to `Dispatchers.IO` (the dispatcher Coil fetches on by default) and `'low'` to `Dispatchers.IO.limitedParallelism(2)`: that changes which threads run a request, but not the order of OkHttp's queue (5 requests per host, first come first served), so a `'high'` image still waits behind the requests queued before it.
- **How to reproduce:** The extra downloads are reproduced in FastImage's benchmark (the "Sizes" scenario in [benchmarks.md](../benchmarks.md#android)); the priority mapping was found by reading the code, as the benchmark didn't set `priority`. Mount two `<NitroImage>`s of different sizes with the same uncached url and count the server's requests; for priority, start 60 images, then one with `options: { priority: 'high' }`, and compare when it shows with and without the option.
- **How FastImage handles it:** on Android, all of an image's requests share one download (any size, a preload), keyed by its cacheKey or url and headers. Downloads that haven't started wait in FastImage's own queue, in Glide's priority order, so a `source.priority: 'high'` request moves the waiting download ahead ([#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271), [#1285](https://github.com/DylanVann/react-native-fast-image/pull/1285)).

## iOS decodes large images at full size

- **What happens:** on iOS, a large photo is decoded at its full size whatever the size of its view, so large photos in small views use a lot of memory. In FastImage's benchmark on an iPhone 15 Pro Max, 20 photos of 4000 × 3000 px in small views took 407 MB, against 52 MB for FastImage. `scaleDownLargeImages` doesn't help here: it only scales images over SDWebImage's limit (60 MB decoded by default), and a 12-megapixel photo is 48 MB. On Android, Coil decodes at about the view's size (92 MB in the same test).
- **Where:** `packages/react-native-nitro-web-image/ios/HybridWebImageLoader.swift`, `requestImage(forView:)` calls `sd_setImage(with:placeholderImage:options:context:)` without SDWebImage's `.imageThumbnailPixelSize` context, so the image is decoded at full size and kept so in the memory cache.
- **How to reproduce:** Reproduced in FastImage's benchmark (the "Large" scenario in [benchmarks.md](../benchmarks.md#ios)). Show 20 photos of 4000 × 3000 px in 100 pt views and read the app's memory.
- **How FastImage handles it:** with `downsample` (on by default), an image at least twice the size its view needs is decoded at about the view's size, read from the image's header first so the fit and EXIF orientation come out right; the downloaded file is cached once, and a view that grows decodes it again from disk ([#1158](https://github.com/DylanVann/react-native-fast-image/pull/1158), [#1217](https://github.com/DylanVann/react-native-fast-image/pull/1217), [#1218](https://github.com/DylanVann/react-native-fast-image/pull/1218)).

## Preload gives no result, takes no options, and on Android starts every request at once

- **What happens:**
    - `WebImages.preload(url)` returns nothing, so an app can't tell when an image is ready or whether it failed.
    - It takes only a url: a view that loads the image with `options.cacheKey` doesn't find the preloaded image (cached under its url) and downloads it again.
    - On Android, each call enqueues its request at once on the same image loader (and OkHttp client) as the views, so preloading a long list queues those downloads ahead of the images the app shows next.
- **Where:** `packages/react-native-nitro-web-image/src/specs/WebImageFactory.nitro.ts`, `preload(url: string): void`. iOS: `ios/HybridWebImageFactory.swift`, `preload(url:)`, `SDWebImagePrefetcher.shared.prefetchURLs([url])`. Android: `android/src/main/java/com/margelo/nitro/web/image/HybridWebImageFactory.kt`, `preload()`, `imageLoader.enqueue(request)` with a request that has only the url.
- **How to reproduce:** Found by reading the code. On Android, preload 200 urls from a slow server and then show an image from it: it shows after the preloads ahead of it in OkHttp's queue.
- **How FastImage handles it:** `preload(sources)` resolves with a result per source, `{ ok: true, width, height }` or `{ ok: false, error }`, takes the same sources as views (headers, `cacheKey`, `priority`), and loads a few at a time (3) across calls, at low priority by default, so it doesn't hold up the images on screen ([#1133](https://github.com/DylanVann/react-native-fast-image/pull/1133), [#1147](https://github.com/DylanVann/react-native-fast-image/pull/1147), [#1161](https://github.com/DylanVann/react-native-fast-image/pull/1161)).

## Android a new url blanks the view until it loads

- **What happens:** on Android, when a `<NitroImage>`'s url changes (without a new `recyclingKey`), the view goes blank until the new image has loaded, unless it's in the memory cache. On iOS the previous image stays until then, as the `recyclingKey` documentation describes.
- **Where:** `packages/react-native-nitro-web-image/android/src/main/java/com/margelo/nitro/web/image/HybridWebImageLoader.kt`, `requestImage(forView:)` calls `imageView.load(url, imageLoader)` without a placeholder; Coil's `GenericViewTarget.onStart()` sets the view's image to that (null) placeholder when the request starts. iOS (`ios/HybridWebImageLoader.swift`) passes `placeholderImage: view.imageView.image`.
- **How to reproduce:** Found by reading the code. Show `<NitroImage image={{ url: a }} />` on Android, then change the url to an uncached `b` from a slow server.
- **How FastImage handles it:** when `source` changes, the image that's showing stays until the new one has loaded, on both platforms, and `recyclingKey` starts from blank in reused views ([#1142](https://github.com/DylanVann/react-native-fast-image/pull/1142), [#1286](https://github.com/DylanVann/react-native-fast-image/pull/1286)).

## Other issues

These were found while comparing the code; FastImage has no counterpart for them, so there's no fix to point to.

### Android forceRefresh always fails

- **What happens:** on Android, a web image loaded with `options: { forceRefresh: true }` (in `<NitroImage>`, `loadFromURLAsync` or `createWebImageLoader`) always fails, without a request to the server.
- **Where:** `packages/react-native-nitro-web-image/android/src/main/java/com/margelo/nitro/web/image/extensions/ImageRequestBuilder+applyOptions.kt`, `applyOptions()`: `forceRefresh` sets the memory, disk and network cache policies to `CachePolicy.WRITE_ONLY`. For Coil, reading from the network policy means fetching from the network, so this turns off both the disk cache and the network. Coil 3.3.0's `NetworkFetcher.newRequest()` then sends `Cache-Control: no-cache, only-if-cached`, which, as its comment says, fails with a 504. Leaving `networkCachePolicy` enabled (with disk and memory reads off) would load a fresh copy.
- **How to reproduce:** Found by reading the code. On Android, call `WebImages.loadFromURLAsync(url, { forceRefresh: true })`: it rejects, and the server gets no request.

### iOS loadFromURLAsync with progressive resolves with a partial image

- **What happens:** on iOS, `loadFromURLAsync(url, { progressive: true })` (also through `loadImage` and `useImage` with `{ url, options }`) resolves with the first partial image SDWebImage decodes when the image arrives in several parts (a progressive JPEG, or a large image on a slow network), not the full image. The continuation is then resumed again for the later parts and the final image. Swift documents resuming an unsafe continuation more than once as undefined behavior (a checked continuation would stop the app); what it does here in practice is unconfirmed.
- **Where:** `packages/react-native-nitro-web-image/ios/Extensions/SDWebImageManager+loadImage.swift`, `loadImage(with:options:)`: the `completed` block resumes the `withUnsafeThrowingContinuation` whenever it gets an image, without checking `finished`. With `.progressiveLoad` (from `progressive: true`, in `toSDWebImageOptions()`), SDWebImage calls that block repeatedly with partial images, as `SDWebImageManager.h` documents.
- **How to reproduce:** Found by reading the code. Load a large progressive JPEG from a slow server with `progressive: true` and look at the resolved image (its lower part not yet decoded). Switching to `withCheckedThrowingContinuation` would show the extra resumes as a crash.

### Android loadFromURLAsync rejects animated images

- **What happens:** on Android, `loadFromURLAsync` (and `loadImage` or `useImage` with a url) rejects a GIF, or on Android 9 and later an animated WebP, with "Requested Image is not a Bitmap!". On iOS it resolves with the image.
- **Where:** `packages/react-native-nitro-web-image/android/src/main/java/com/margelo/nitro/web/image/extensions/ImageLoader+loadImageAsync.kt`, `loadImageAsync()`: `image as? BitmapImage ?: throw Error(...)`. `coil-gif`, a dependency in `packages/react-native-nitro-web-image/android/build.gradle`, registers its decoder with Coil automatically (`AnimatedImageDecoder` on Android 9 and later, `GifDecoder` before), so these images decode to an animated drawable rather than a bitmap.
- **How to reproduce:** Found by reading the code. On Android, call `WebImages.loadFromURLAsync` with a GIF's url.

### Android scaleDownLargeImages makes views decode larger images

- **What happens:** on Android, `scaleDownLargeImages: true` on a `<NitroImage>` makes a large photo decode at up to 4096 × 4096 px instead of about the view's size, so it uses more memory with the option than without it (a 4000 × 3000 photo in a 100 dp view: about 48 MB instead of under 1 MB).
- **Where:** `packages/react-native-nitro-web-image/android/src/main/java/com/margelo/nitro/web/image/extensions/ImageRequestBuilder+applyOptions.kt`, `applyOptions()`: `scaleDownLargeImages` sets `size(4096, 4096)` with `Precision.INEXACT`, which replaces the view-size resolver Coil uses for an `ImageView` target (`HybridWebImageLoader.requestImage(forView:)`).
- **How to reproduce:** Found by reading the code. Show a 4000 × 3000 photo in a 100 dp `<NitroImage>` with and without `options: { scaleDownLargeImages: true }` and compare the decoded bitmap's size (or the app's memory).

### Some documented options do nothing on Android

- **What happens:** `continueInBackground`, `allowInvalidSSLCertificates`, `queryMemoryDataSync` and `queryDiskDataSync` are documented in `AsyncImageLoadOptions` without a platform note, but have no effect on Android. (`progressive` and `allowHardware` are marked as one platform's.)
- **Where:** `packages/react-native-nitro-web-image/src/specs/WebImageFactory.nitro.ts` documents them; `packages/react-native-nitro-web-image/android/src/main/java/com/margelo/nitro/web/image/extensions/ImageRequestBuilder+applyOptions.kt`, `applyOptions()`, has a `// TODO: Implement` for each.
- **How to reproduce:** Found by reading the code. For example, load an image from a server with a self-signed certificate on Android with `allowInvalidSSLCertificates: true`: it fails.

### iOS prints a line for every progress update

- **What happens:** on iOS, `loadFromURLAsync` and an image loader's `loadImage()` print `<url>: Loaded <bytes>/<total> bytes` for every progress update of every download, in release builds too, which costs a little time per update and puts the image urls (with any tokens in them) in the device log.
- **Where:** `packages/react-native-nitro-web-image/ios/Extensions/SDWebImageManager+loadImage.swift`, `loadImage(with:options:)`: `print(...)` in the progress block. `HybridWebImageLoader.loadImage()` and `HybridWebImageFactory.loadFromURLAsync()` both go through it; views (`requestImage(forView:)`) don't.
- **How to reproduce:** Found by reading the code. Call `WebImages.loadFromURLAsync(url)` in a release build and watch the device's console.
