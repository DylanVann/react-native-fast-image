# Issues found in Turbo Image

FastImage's maintainers found these while comparing FastImage with Turbo Image (`react-native-turbo-image`); FastImage fixes or works around each one in its own code, as described below. They were checked against Turbo Image 1.24.3 (commit `9fd1175`, 2026-09-07) on 2026-10-18, with Coil 2.6.0 on Android and the bundled Nuke 12.8.0 on iOS. Paths are relative to the react-native-turbo-image repository. If you maintain Turbo Image, feel free to hand this file to your coding agent.

## Android prefetch of a source without a uri ends the app

- **What happens:** `TurboImage.prefetch([{ uri: undefined }])` (for example, a url missing from an API response) throws on Android, in the native module, which ends the app. On iOS the same source is skipped.
- **Where:** `android/src/main/java/com/turboimage/TurboImageModule.kt`, `prefetch()`: `(source as HashMap<*, *>)["uri"] as String` throws a `NullPointerException` when `uri` is missing or `null`. iOS (`ios/TurboImageViewManager.swift`, `prefetch`) uses `compactMap` and drops it.
- **How to reproduce:** Found by reading the code. Call `TurboImage.prefetch([{ uri: undefined as any }])` in a release build on Android.
- **How FastImage handles it:** `preload` checks each source and resolves a source without a uri as `{ ok: false, error }`, without loading it ([#1091](https://github.com/DylanVann/react-native-fast-image/pull/1091), [#1099](https://github.com/DylanVann/react-native-fast-image/pull/1099)).

## Android prefetch leaves a network callback registered per call

- **What happens:** each `TurboImage.prefetch()` call on Android creates a new Coil `ImageLoader`, whose network observer registers a `ConnectivityManager` network callback when the app has the `ACCESS_NETWORK_STATE` permission (most apps do, through libraries such as NetInfo or Google Play services). The callback stays registered after the prefetch is done, until the network changes or the system trims memory. Android allows 100 per app, so after enough prefetch calls the next registration in the app throws `TooManyRequestsException`, as reported for the views in [Turbo Image's issue 440](https://github.com/duguyihou/react-native-turbo-image/issues/440) (fixed there by sharing loaders, in 1.24.3).
- **Where:** `android/src/main/java/com/turboimage/TurboImageModule.kt`, `prefetch()`: `Coil.imageLoader(context).newBuilder().respectCacheHeaders(...).build()` on every call, with the network observer left on. In Coil 2.6.0, `SystemCallbacks.registerNetworkObserver()` registers the callback lazily on the loader's first request (`RequestService.updateOptionsOnWorkerThread()` reads `isOnline`), and only `shutdown()` unregisters it.
- **How to reproduce:** Found by reading the code. In an app with `ACCESS_NETWORK_STATE`, call `TurboImage.prefetch([{ uri }])` 100 times without the network changing, then do something that registers a network callback (or keep prefetching and look at `dumpsys connectivity` for the app's requests).
- **How FastImage handles it:** `preload` goes through the same Glide instance as FastImage's views, so nothing is created per call; the views' loaders in Turbo Image 1.24.3 (`sharedImageLoader()`, with `networkObserverEnabled(false)`) would do the same for prefetch.

## Android returning to the app reloads only the last view created

- **What happens:** when the app goes to the background and comes back, the view manager cancels and reloads one view: the one created most recently, not the ones on screen. That view loads its image again and sends `onStart`, `onSuccess` (or `onFailure`) and `onCompletion` again, although it had loaded. If that view has been removed meanwhile, it loads its image (downloading it if it isn't cached) into a view that's no longer shown, and its progress listener is registered again and never removed. The other views' loads aren't touched.
- **Where:** `android/src/main/java/com/turboimage/TurboImageViewManager.kt`: `private lateinit var imageView` is set in `createViewInstance()` for every view, so it holds the last one; `onHostPause()`, `onHostResume()` (`reloadImage(imageView, force = true)`) and `onHostDestroy()` act on it.
- **How to reproduce:** Found by reading the code. Show a list of images, log `onSuccess`, put the app in the background and bring it back: the last-created image logs `onSuccess` again. Or remove that image first and watch the server's log for its url when the app comes back.
- **How FastImage handles it:** FastImage had the same pattern (a field in the view manager holding the last view's Glide request manager) and changed it so each view keeps its own ([#1125](https://github.com/DylanVann/react-native-fast-image/pull/1125)). Nothing is loaded again when the app comes back: an image that has loaded stays, without new events.

## A response that isn't an image stays in the dataCache

- **What happens:** with `cachePolicy="dataCache"`, a successful (2xx) response that isn't an image, such as a captive portal's or a CDN's HTML page, is stored in the disk cache before it's decoded. Every later load of that url reads it from the cache and fails, without a request, until the cache is cleared, even once the network is fine. With the default `urlCache`, the same happens on Android when the page's cache headers make it fresh.
- **Where:** Android: `TurboImageViewManager.kt`, `sharedImageLoader()` builds the `dataCache` loader with `respectCacheHeaders(false)`; Coil 2.6.0's `HttpUriFetcher.fetch()` writes any successful response with `writeToDiskCache()` before decoding, and returns a cached entry without checking it again when cache headers aren't respected. iOS: `ios/Utilities/CachePolicy.swift`, `dataCachePipeline` is `ImagePipeline(configuration: .withDataCache)`, whose `dataCachePolicy` is `.storeOriginalData`; Nuke stores the downloaded data in `TaskFetchOriginalData.dataTaskDidFinish()` (`storeDataInCacheIfNeeded`) before decoding, and `DataLoader.validate` only checks the status code.
- **How to reproduce:** Found by reading the code. Serve an HTML page with status 200 at an image's url, load it with `cachePolicy="dataCache"` (it fails), then serve the image at that url and load it again: it still fails.
- **How FastImage handles it:** on Android, a response that isn't an image (its content type and its first bytes both checked, so a mislabelled image still loads) fails before it reaches Glide's disk cache; on iOS, it's removed from the HTTP cache of `cache: 'web'` images, and SDWebImage only stores images that decoded ([#1178](https://github.com/DylanVann/react-native-fast-image/pull/1178), [#1181](https://github.com/DylanVann/react-native-fast-image/pull/1181)).

## Android cacheKey shares one memory entry across tint, blur, monochrome and rounded

- **What happens:** on Android, views with the same `source.cacheKey` share one decoded image in the memory cache whatever their `tint`, `blur`, `monochrome` or `rounded`. A view without blur can show the blurred image another view loaded, and changing `tint` or `blur` on a view whose image is in memory keeps showing the previous effect.
- **Where:** `android/src/main/java/com/turboimage/TurboImageViewManager.kt`, `reloadImage()`: `memoryCacheKey(it)` with the cacheKey. In Coil 2.6.0, `MemoryCacheService.newCacheKey()` returns an explicit memory cache key as it is, so the transformations aren't part of it (they are when Coil makes the key), and the transformed bitmap is stored under it. iOS isn't affected: Nuke's memory cache key includes the processors.
- **How to reproduce:** Found by reading the code. Show two `TurboImage`s with the same `source` and `cacheKey`, one with `blur={20}` and one without, mounting the blurred one first: both show the blurred image.
- **How FastImage handles it:** `tintColor` is drawn with a color filter on the view, so it never changes a cached image, and `blurRadius` is part of the Glide request's key, so blurred and unblurred views of one image keep separate decoded images while sharing the downloaded file ([#1193](https://github.com/DylanVann/react-native-fast-image/pull/1193)).

## Android image requests don't send the app's cookies

- **What happens:** on Android, image requests don't carry the cookies the app has (from `fetch` or a WebView, kept in Android's `CookieManager`), so images behind cookie authentication fail. They also skip anything the app configured on React Native's OkHttp client, such as interceptors or certificate pinning. On iOS, Nuke's `URLSession` sends the shared cookies.
- **Where:** `android/src/main/java/com/turboimage/TurboImageViewManager.kt`, `progressClient`: `OkHttpClient.Builder().addInterceptor(ProgressInterceptor()).build()`, with no cookie jar; `TurboImageModule.kt`'s prefetch uses Coil's default client, also without one.
- **How to reproduce:** Found by reading the code. Log in with `fetch` to a server that sets a session cookie, then load an image that needs that cookie.
- **How FastImage handles it:** FastImage loads with React Native's OkHttp client (`OkHttpClientProvider`), with a cookie jar on React Native's `ForwardingCookieHandler` when the app hasn't set its own, so the app's cookies and interceptors apply ([#1138](https://github.com/DylanVann/react-native-fast-image/pull/1138), [#1277](https://github.com/DylanVann/react-native-fast-image/pull/1277)).

## Android downloads an image again for each size, with no priority

- **What happens:** on Android, a url shown at two sizes at once (a thumbnail and a larger view of it) is downloaded once per size, and an image the user opens while a list loads waits behind the list's downloads. In FastImage's benchmark on Pixel 8 phones, 16 photos at two sizes made 32 requests and showed at 564 ms (median), against 16 requests and 348 ms for FastImage; a photo opened over a loading grid showed at 832 ms, against 280 ms with FastImage's `priority: 'high'`. On iOS, Nuke shares the download (60 requests for 61 images, shown at 528 ms, the fastest measured).
- **Where:** `TurboImageViewManager.kt`, `reloadImage()` loads each view with its own Coil request, sized to the view; Coil 2 doesn't share a running download between requests of different sizes. Each request also carries the view's tag header (`ProgressInterceptor.VIEW_TAG_HEADER`). There's no priority prop, and OkHttp's dispatcher starts queued requests in order (5 per host).
- **How to reproduce:** Reproduced in FastImage's benchmark (the "Sizes" and "Opening a photo while others load" scenarios in [benchmarks.md](../benchmarks.md#android)). Mount two `TurboImage`s of different sizes with the same uncached url and count the server's requests.
- **How FastImage handles it:** on Android, all of an image's requests share one download (any size, a preload), keyed by its cacheKey or url and headers. Downloads that haven't started wait in FastImage's own queue, in Glide's priority order, so a `source.priority: 'high'` request moves the waiting download ahead ([#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271), [#1285](https://github.com/DylanVann/react-native-fast-image/pull/1285)).

## Prefetch gives no result per image and doesn't use cacheKey

- **What happens:**
    - `TurboImage.prefetch()` resolves `true` once every source has finished, whether they loaded or failed, so an app can't tell which images are ready.
    - On Android, `prefetch([])` never resolves.
    - A source's `cacheKey` is ignored: the image is cached under its url, so a view that uses the `cacheKey` misses it and downloads the image again (always on Android; on iOS with `dataCache`, or when the HTTP cache doesn't keep the response).
- **Where:** `android/src/main/java/com/turboimage/TurboImageModule.kt`, `prefetch()`: `handleRequestCount()` resolves `true` when the count of finished requests reaches `sources.size()`, which never happens for 0 sources, and the requests set neither `diskCacheKey` nor `memoryCacheKey`. `ios/TurboImageViewManager.swift`, `prefetch`: `resolve(true)` in `didComplete`, and `ImageRequest(urlRequest:)` without the `.imageIdKey` the view sets from `cacheKey` (`TurboImageView.swift`, `source`).
- **How to reproduce:** Found by reading the code. Prefetch a url that returns 404 (resolves `true`); on Android, prefetch `{ uri, cacheKey: 'a' }`, then show a `TurboImage` with the same source and count the server's requests (2).
- **How FastImage handles it:** `preload(sources)` resolves with a result per source, `{ ok: true, width, height }` or `{ ok: false, error }`, never rejects, resolves `[]` for no sources, and caches each image under its `cacheKey` as views do ([#1133](https://github.com/DylanVann/react-native-fast-image/pull/1133), [#1147](https://github.com/DylanVann/react-native-fast-image/pull/1147), [#1161](https://github.com/DylanVann/react-native-fast-image/pull/1161)).

## iOS a source with an invalid uri shows the previous image again

- **What happens:** on iOS, when `source` changes to one whose `uri` isn't a valid url (empty, or missing), the view sends `onFailure` and then reloads the previous source, so it keeps showing the previous image and sends `onStart` and `onSuccess` for it after the failure.
- **Where:** `ios/TurboImageView.swift`: `source`'s `didSet` sends `onFailure` and returns without changing `imageRequest`; `didSetProps(_:)` then calls `reloadImage()` because `source` changed, which sets the previous `imageRequest` on the `LazyImageView` again.
- **How to reproduce:** Found by reading the code. Show a `TurboImage` with a valid url, then change its source to `{ uri: '' }` and log the events.
- **How FastImage handles it:** a new source cancels the previous load first; a source without a usable url shows `defaultSource` (or nothing) and sends `onError` ([#1159](https://github.com/DylanVann/react-native-fast-image/pull/1159), and on Android [#1109](https://github.com/DylanVann/react-native-fast-image/pull/1109)).

## Tinted animated images don't animate tinted

- **What happens:** an animated GIF or APNG with `tint` plays untinted on iOS, and shows a still, tinted first frame on Android. On Android the same happens with `blur`, `monochrome` and `rounded`.
- **Where:** iOS: `ios/TurboImageView.swift`, `handleGif()` and `handleAPNG()` build the animated view from `container.data`, the downloaded file, while the processors (`composeProcessors()`) only change `container.image`. Android: `TurboImageView.kt`, `transformations` adds `ColorFilterTransformation` (and the others) to the request, and Coil 2.6.0's `EngineInterceptor.transform()` converts an animated drawable to a bitmap of its first frame before applying transformations.
- **How to reproduce:** Found by reading the code. Show an animated GIF with `format="gif"` and `tint="red"` on both platforms.
- **How FastImage handles it:** on iOS, an animated image's frames are tinted as they're decoded, with SDWebImage's `animationTransformer` ([#1195](https://github.com/DylanVann/react-native-fast-image/pull/1195)); on Android, `tintColor` is a color filter on the view, so animated images keep playing, tinted.

## iOS resizeMode center doesn't scale large images down

- **What happens:** with `resizeMode="center"`, an image larger than the view is scaled down to fit on Android but shown at its own size, cropped, on iOS. React Native's `Image` documents `center` as scaling a larger image down.
- **Where:** `ios/Utilities/ResizeMode.swift`: `center` maps to `UIView.ContentMode.center`; `android/src/main/java/com/turboimage/TurboImageViewManager.kt`, `RESIZE_MODE`: `center` maps to `ScaleType.CENTER_INSIDE`.
- **How to reproduce:** Found by reading the code. Show a 2000 × 2000 px image in a 100 × 100 view with `resizeMode="center"` on both platforms.
- **How FastImage handles it:** FastImage 9's `resizeMode="center"` scales a larger image down on iOS as on Android ([#1144](https://github.com/DylanVann/react-native-fast-image/pull/1144)); FastImage 10's `objectFit="scale-down"` does the same on every platform.

## Android sends progress events for every image and every read

- **What happens:** on Android, every view's download sends an `onProgress` event to JavaScript for each read from the network, whether or not the image has an `onProgress` handler, and with `total: -1` when the server doesn't send a `Content-Length` (chunked responses).
- **Where:** `android/src/main/java/com/turboimage/TurboImageViewManager.kt`, `reloadImage()` registers a `ProgressListener` for every view; `events/interceptor/ProgressResponseBody.kt` calls `update()` on every `read()` with `responseBody.contentLength()`.
- **How to reproduce:** Found by reading the code. Load a list of images without `onProgress` and count the `onProgress` events dispatched (for example with a breakpoint in the listener's `update`), or load an image served with chunked encoding with `onProgress` and log `total`.
- **How FastImage handles it:** progress is tracked only for views with an `onProgress` handler ([#1225](https://github.com/DylanVann/react-native-fast-image/pull/1225)), and isn't sent when the total size is unknown ([#1134](https://github.com/DylanVann/react-native-fast-image/pull/1134)); the event also has a 0–1 `progress` ([#1194](https://github.com/DylanVann/react-native-fast-image/pull/1194)).
