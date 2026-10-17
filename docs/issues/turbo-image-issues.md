# Issues found in Turbo Image

Fast Image's maintainers found these while comparing Fast Image with Turbo Image (`react-native-turbo-image`); Fast Image fixes or works around the issues in the main sections in its own code, as described in each. The last section lists issues Fast Image has no counterpart for. They were checked against Turbo Image 1.24.3 (commit `9fd1175`, 2026-09-07) on 2026-10-18, with Coil 2.6.0 on Android and the bundled Nuke 12.8.0 on iOS. Paths are relative to the react-native-turbo-image repository. If you maintain Turbo Image, feel free to hand this file to your coding agent.

## Android prefetch of a source without a uri ends the app

- **What happens:** `TurboImage.prefetch([{ uri: undefined }])` (for example, a url missing from an API response) throws on Android, in the native module, which ends the app. On iOS the same source is skipped.
- **Where:** `android/src/main/java/com/turboimage/TurboImageModule.kt`, `prefetch()`: `(source as HashMap<*, *>)["uri"] as String` throws a `NullPointerException` when `uri` is missing or `null`. iOS (`ios/TurboImageViewManager.swift`, `prefetch`) uses `compactMap` and drops it.
- **How to reproduce:** Found by reading the code. Call `TurboImage.prefetch([{ uri: undefined as any }])` in a release build on Android.
- **How Fast Image handles it:** `preload` checks each source and resolves a source without a uri as `{ ok: false, error }`, without loading it ([#1091](https://github.com/DylanVann/react-native-fast-image/pull/1091), [#1099](https://github.com/DylanVann/react-native-fast-image/pull/1099)).

## Android a missing source ends the app

- **What happens:** on Android, a `TurboImage` whose `source` is `null` or `undefined` (for example while data loads, or when a source is removed) ends the app when the prop is applied. On iOS the view sends `onFailure`.
- **Where:** `android/src/main/java/com/turboimage/TurboImageViewManager.kt`, `setSource(view: TurboImageView, source: ReadableMap)`: the parameter isn't nullable, so when React Native calls the setter with `null` for a missing prop, Kotlin's parameter check throws a `NullPointerException`, which React Native reports as an error updating the `source` property. `src/TurboImage.tsx` passes `source` through as it is.
- **How to reproduce:** Found by reading the code. Render `<TurboImage source={undefined as any} style={{ width: 100, height: 100 }} />` on Android, or change a loaded image's source to `undefined`.
- **How Fast Image handles it:** a missing source, or one without a uri, sends `onError` and shows `defaultSource` (or nothing) ([#1091](https://github.com/DylanVann/react-native-fast-image/pull/1091), [#1109](https://github.com/DylanVann/react-native-fast-image/pull/1109)).

## Android returning to the app reloads only the last view created

- **What happens:** when the app goes to the background and comes back, the view manager cancels and reloads one view: the one created most recently, not the ones on screen. That view loads its image again and sends `onStart`, `onSuccess` (or `onFailure`) and `onCompletion` again, although it had loaded. If that view has been removed meanwhile, it loads its image (downloading it if it isn't cached) into a view that's no longer shown, and its progress listener is registered again and never removed. The other views' loads aren't touched.
- **Where:** `android/src/main/java/com/turboimage/TurboImageViewManager.kt`: `private lateinit var imageView` is set in `createViewInstance()` for every view, so it holds the last one; `onHostPause()`, `onHostResume()` (`reloadImage(imageView, force = true)`) and `onHostDestroy()` act on it.
- **How to reproduce:** Found by reading the code. Show a list of images, log `onSuccess`, put the app in the background and bring it back: the last-created image logs `onSuccess` again. Or remove that image first and watch the server's log for its url when the app comes back.
- **How Fast Image handles it:** Fast Image had the same pattern (a field in the view manager holding the last view's Glide request manager) and changed it so each view keeps its own ([#1125](https://github.com/DylanVann/react-native-fast-image/pull/1125)). Nothing is loaded again when the app comes back: an image that has loaded stays, without new events.

## A response that isn't an image stays in the dataCache

- **What happens:** with `cachePolicy="dataCache"`, a successful (2xx) response that isn't an image, such as a captive portal's or a CDN's HTML page, is stored in the disk cache before it's decoded. Every later load of that url reads it from the cache and fails, without a request, until the cache is cleared, even once the network is fine. With the default `urlCache`, the same happens on Android when the page's cache headers make it fresh.
- **Where:** Android: `TurboImageViewManager.kt`, `sharedImageLoader()` builds the `dataCache` loader with `respectCacheHeaders(false)`; Coil 2.6.0's `HttpUriFetcher.fetch()` writes any successful response with `writeToDiskCache()` before decoding, and returns a cached entry without checking it again when cache headers aren't respected. iOS: `ios/Utilities/CachePolicy.swift`, `dataCachePipeline` is `ImagePipeline(configuration: .withDataCache)`, whose `dataCachePolicy` is `.storeOriginalData`; Nuke stores the downloaded data in `TaskFetchOriginalData.dataTaskDidFinish()` (`storeDataInCacheIfNeeded`) before decoding, and `DataLoader.validate` only checks the status code.
- **How to reproduce:** Found by reading the code. Serve an HTML page with status 200 at an image's url, load it with `cachePolicy="dataCache"` (it fails), then serve the image at that url and load it again: it still fails.
- **How Fast Image handles it:** on Android, a response that isn't an image (its content type and its first bytes both checked, so a mislabelled image still loads) fails before it reaches Glide's disk cache; on iOS, it's removed from the HTTP cache of `cache: 'web'` images, and SDWebImage only stores images that decoded ([#1178](https://github.com/DylanVann/react-native-fast-image/pull/1178), [#1181](https://github.com/DylanVann/react-native-fast-image/pull/1181)).

## Android cacheKey shares one memory entry across tint, blur, monochrome and rounded

- **What happens:** on Android, views with the same `source.cacheKey` share one decoded image in the memory cache whatever their `tint`, `blur`, `monochrome` or `rounded`. A view without blur can show the blurred image another view loaded, and changing `tint` or `blur` on a view whose image is in memory keeps showing the previous effect.
- **Where:** `android/src/main/java/com/turboimage/TurboImageViewManager.kt`, `reloadImage()`: `memoryCacheKey(it)` with the cacheKey. In Coil 2.6.0, `MemoryCacheService.newCacheKey()` returns an explicit memory cache key as it is, so the transformations aren't part of it (they are when Coil makes the key), and the transformed bitmap is stored under it. iOS isn't affected: Nuke's memory cache key includes the processors.
- **How to reproduce:** Found by reading the code. Show two `TurboImage`s with the same `source` and `cacheKey`, one with `blur={20}` and one without, mounting the blurred one first: both show the blurred image.
- **How Fast Image handles it:** `tintColor` is drawn with a color filter on the view, so it never changes a cached image, and `blurRadius` is part of the Glide request's key, so blurred and unblurred views of one image keep separate decoded images while sharing the downloaded file ([#1193](https://github.com/DylanVann/react-native-fast-image/pull/1193)).

## Android image requests don't send the app's cookies

- **What happens:** on Android, image requests don't carry the cookies the app has (from `fetch` or a WebView, kept in Android's `CookieManager`), so images behind cookie authentication fail. They also skip anything the app configured on React Native's OkHttp client, such as interceptors or certificate pinning. On iOS, Nuke's `URLSession` sends the shared cookies.
- **Where:** `android/src/main/java/com/turboimage/TurboImageViewManager.kt`, `progressClient`: `OkHttpClient.Builder().addInterceptor(ProgressInterceptor()).build()`, with no cookie jar; `TurboImageModule.kt`'s prefetch uses Coil's default client, also without one.
- **How to reproduce:** Found by reading the code. Log in with `fetch` to a server that sets a session cookie, then load an image that needs that cookie.
- **How Fast Image handles it:** Fast Image loads with React Native's OkHttp client (`OkHttpClientProvider`), with a cookie jar on React Native's `ForwardingCookieHandler` when the app hasn't set its own, so the app's cookies and interceptors apply ([#1138](https://github.com/DylanVann/react-native-fast-image/pull/1138), [#1277](https://github.com/DylanVann/react-native-fast-image/pull/1277)).

## Android downloads an image again for each size, with no priority

- **What happens:** on Android, a url shown at two sizes at once (a thumbnail and a larger view of it) is downloaded once per size, and an image the user opens while a list loads waits behind the list's downloads. In Fast Image's benchmark on Pixel 8 phones, 16 photos at two sizes made 32 requests and showed at 564 ms (median), against 16 requests and 348 ms for Fast Image; a photo opened over a loading grid showed at 832 ms, against 280 ms with Fast Image's `priority: 'high'`. On iOS, Nuke shares the download (60 requests for 61 images, shown at 528 ms, the fastest measured).
- **Where:** `TurboImageViewManager.kt`, `reloadImage()` loads each view with its own Coil request, sized to the view; Coil 2 doesn't share a running download between requests of different sizes. Each request also carries the view's tag header (`ProgressInterceptor.VIEW_TAG_HEADER`). There's no priority prop, and OkHttp's dispatcher starts queued requests in order (5 per host).
- **How to reproduce:** Reproduced in Fast Image's benchmark (the "Sizes" and "Opening a photo while others load" scenarios in [benchmarks.md](../benchmarks.md#android)). Mount two `TurboImage`s of different sizes with the same uncached url and count the server's requests.
- **How Fast Image handles it:** on Android, all of an image's requests share one download (any size, a preload), keyed by its cacheKey or url and headers. Downloads that haven't started wait in Fast Image's own queue, in Glide's priority order, so a `source.priority: 'high'` request moves the waiting download ahead ([#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271), [#1285](https://github.com/DylanVann/react-native-fast-image/pull/1285)).

## Prefetch gives no result per image and doesn't use cacheKey

- **What happens:**
    - `TurboImage.prefetch()` resolves `true` once every source has finished, whether they loaded or failed, so an app can't tell which images are ready.
    - On Android, `prefetch([])` never resolves.
    - A source's `cacheKey` is ignored: the image is cached under its url, so a view that uses the `cacheKey` misses it and downloads the image again (always on Android; on iOS with `dataCache`, or when the HTTP cache doesn't keep the response).
- **Where:** `android/src/main/java/com/turboimage/TurboImageModule.kt`, `prefetch()`: `handleRequestCount()` resolves `true` when the count of finished requests reaches `sources.size()`, which never happens for 0 sources, and the requests set neither `diskCacheKey` nor `memoryCacheKey`. `ios/TurboImageViewManager.swift`, `prefetch`: `resolve(true)` in `didComplete`, and `ImageRequest(urlRequest:)` without the `.imageIdKey` the view sets from `cacheKey` (`TurboImageView.swift`, `source`).
- **How to reproduce:** Found by reading the code. Prefetch a url that returns 404 (resolves `true`); on Android, prefetch `{ uri, cacheKey: 'a' }`, then show a `TurboImage` with the same source and count the server's requests (2).
- **How Fast Image handles it:** `preload(sources)` resolves with a result per source, `{ ok: true, width, height }` or `{ ok: false, error }`, never rejects, resolves `[]` for no sources, and caches each image under its `cacheKey` as views do ([#1133](https://github.com/DylanVann/react-native-fast-image/pull/1133), [#1147](https://github.com/DylanVann/react-native-fast-image/pull/1147), [#1161](https://github.com/DylanVann/react-native-fast-image/pull/1161)).

## iOS a source with an invalid uri shows the previous image again

- **What happens:** on iOS, when `source` changes to one whose `uri` isn't a valid url (empty, or missing), the view sends `onFailure` and then reloads the previous source, so it keeps showing the previous image and sends `onStart` and `onSuccess` for it after the failure.
- **Where:** `ios/TurboImageView.swift`: `source`'s `didSet` sends `onFailure` and returns without changing `imageRequest`; `didSetProps(_:)` then calls `reloadImage()` because `source` changed, which sets the previous `imageRequest` on the `LazyImageView` again.
- **How to reproduce:** Found by reading the code. Show a `TurboImage` with a valid url, then change its source to `{ uri: '' }` and log the events.
- **How Fast Image handles it:** a new source cancels the previous load first; a source without a usable url shows `defaultSource` (or nothing) and sends `onError` ([#1159](https://github.com/DylanVann/react-native-fast-image/pull/1159), and on Android [#1109](https://github.com/DylanVann/react-native-fast-image/pull/1109)).

## Tinted animated images don't animate tinted

- **What happens:** an animated GIF or APNG with `tint` plays untinted on iOS, and shows a still, tinted first frame on Android. On Android the same happens with `blur`, `monochrome` and `rounded`.
- **Where:** iOS: `ios/TurboImageView.swift`, `handleGif()` and `handleAPNG()` build the animated view from `container.data`, the downloaded file, while the processors (`composeProcessors()`) only change `container.image`. Android: `TurboImageView.kt`, `transformations` adds `ColorFilterTransformation` (and the others) to the request, and Coil 2.6.0's `EngineInterceptor.transform()` converts an animated drawable to a bitmap of its first frame before applying transformations.
- **How to reproduce:** Found by reading the code. Show an animated GIF with `format="gif"` and `tint="red"` on both platforms.
- **How Fast Image handles it:** on iOS, an animated image's frames are tinted as they're decoded, with SDWebImage's `animationTransformer` ([#1195](https://github.com/DylanVann/react-native-fast-image/pull/1195)); on Android, `tintColor` is a color filter on the view, so animated images keep playing, tinted.

## iOS resizeMode center doesn't scale large images down

- **What happens:** with `resizeMode="center"`, an image larger than the view is scaled down to fit on Android but shown at its own size, cropped, on iOS. React Native's `Image` documents `center` as scaling a larger image down.
- **Where:** `ios/Utilities/ResizeMode.swift`: `center` maps to `UIView.ContentMode.center`; `android/src/main/java/com/turboimage/TurboImageViewManager.kt`, `RESIZE_MODE`: `center` maps to `ScaleType.CENTER_INSIDE`.
- **How to reproduce:** Found by reading the code. Show a 2000 × 2000 px image in a 100 × 100 view with `resizeMode="center"` on both platforms.
- **How Fast Image handles it:** Fast Image 9's `resizeMode="center"` scales a larger image down on iOS as on Android ([#1144](https://github.com/DylanVann/react-native-fast-image/pull/1144)); its `objectFit="scale-down"`, which replaced `resizeMode`, does the same on every platform.

## Android sends progress events for every image and every read

- **What happens:** on Android, every view's download sends an `onProgress` event to JavaScript for each read from the network, whether or not the image has an `onProgress` handler, and with `total: -1` when the server doesn't send a `Content-Length` (chunked responses).
- **Where:** `android/src/main/java/com/turboimage/TurboImageViewManager.kt`, `reloadImage()` registers a `ProgressListener` for every view; `events/interceptor/ProgressResponseBody.kt` calls `update()` on every `read()` with `responseBody.contentLength()`.
- **How to reproduce:** Found by reading the code. Load a list of images without `onProgress` and count the `onProgress` events dispatched (for example with a breakpoint in the listener's `update`), or load an image served with chunked encoding with `onProgress` and log `total`.
- **How Fast Image handles it:** progress is tracked only for views with an `onProgress` handler ([#1225](https://github.com/DylanVann/react-native-fast-image/pull/1225)), and isn't sent when the total size is unknown ([#1134](https://github.com/DylanVann/react-native-fast-image/pull/1134)); the event also has a 0–1 `progress` ([#1194](https://github.com/DylanVann/react-native-fast-image/pull/1194)).

## Other issues

These were found while comparing the code; Fast Image has no counterpart for them, so there's no fix to point to.

### Android prefetch leaves a network callback registered per call

- **What happens:** each `TurboImage.prefetch()` call on Android creates a new Coil `ImageLoader`, whose network observer registers a `ConnectivityManager` network callback when the app has the `ACCESS_NETWORK_STATE` permission (most apps do, through libraries such as NetInfo or Google Play services). The callback stays registered after the prefetch is done, until the network changes or the system trims memory. Android allows 100 per app, so after enough prefetch calls the next registration in the app throws `TooManyRequestsException`, as reported for the views in [Turbo Image's issue 440](https://github.com/duguyihou/react-native-turbo-image/issues/440) (fixed there by sharing loaders, in 1.24.3).
- **Where:** `android/src/main/java/com/turboimage/TurboImageModule.kt`, `prefetch()`: `Coil.imageLoader(context).newBuilder().respectCacheHeaders(...).build()` on every call, with the network observer left on. In Coil 2.6.0, `SystemCallbacks.registerNetworkObserver()` registers the callback lazily on the loader's first request (`RequestService.updateOptionsOnWorkerThread()` reads `isOnline`), and only `shutdown()` unregisters it. The views' loaders (`sharedImageLoader()` in `TurboImageViewManager.kt`) avoid this with one loader and `networkObserverEnabled(false)`.
- **How to reproduce:** Found by reading the code. In an app with `ACCESS_NETWORK_STATE`, call `TurboImage.prefetch([{ uri }])` 100 times without the network changing, then do something that registers a network callback (or keep prefetching and look at `dumpsys connectivity` for the app's requests).

### dispose is still exported but not implemented

- **What happens:** `TurboImage.dispose(sources)` is still in the JavaScript API, the types (`TurboImageApi`) and the README's feature list, but calling it rejects with a `TypeError` (`dispose` is not a function), on both platforms.
- **Where:** `src/TurboImage.tsx` calls `TurboImageViewManager.dispose(sources)`, but neither native module has it any more: `ios/TurboImageViewManager.m` exports `prefetch`, `clearMemoryCache` and `clearDiskCache`, and so does `android/src/main/java/com/turboimage/TurboImageModule.kt`. Commit `94a8929` ("refactor: remove dispose function") removed the native methods and the README's `dispose` section, but not the JavaScript function or its type.
- **How to reproduce:** Found by reading the code. Call `await TurboImage.dispose([{ uri }])`.

### Android decodes the placeholder hash several times per load, on the main thread

- **What happens:** with a `blurhash` or `thumbhash` placeholder, each load decodes the hash into a new bitmap two or three times on the UI thread, instead of once.
- **Where:** `android/src/main/java/com/turboimage/TurboImageView.kt`: `blurhashDrawable` and `thumbhashDrawable` are getters that decode the hash every time they're read. `TurboImageViewManager.kt`, `reloadImage()`, reads them for `defaultCrossfade`, for `placeholder(...)` and, with `showPlaceholderOnFailure`, for `error(...)`; `reloadImage()` runs from `onAfterUpdateTransaction()`, on the UI thread.
- **How to reproduce:** Found by reading the code. Put a breakpoint or a counter in `drawThumbhash()` and load one image with a `thumbhash` placeholder. The cost per decode is small (BlurHash at 8 × 8 px, ThumbHash at about 32 px); it adds up in lists.

### iOS Live Text adds another interaction on every load

- **What happens:** with `enableLiveTextInteraction`, every completed load adds a new `ImageAnalysisInteraction` to the image view, and the earlier ones aren't removed, so a view whose source changes keeps one interaction per image it has shown. What several interactions do at once (for example, text from a previous image staying selectable) is unconfirmed.
- **Where:** `ios/TurboImageView.swift`, `handleLiveTextInteraction()`: `lazyImageView.imageView.addInteraction(interaction)` on every call (from `onCompletion`); only `liveTextTask` is cancelled.
- **How to reproduce:** Found by reading the code. With `enableLiveTextInteraction`, change the source a few times and print `imageView.interactions.count`.

### iOS prefetch may never resolve (unconfirmed)

- **What happens:** possibly, `TurboImage.prefetch()` on iOS never resolves when there's nothing to download, for example an empty list or images already in the memory cache. Unconfirmed: it depends on a race, and the window is small.
- **Where:** `ios/TurboImageViewManager.swift`, `prefetch`: `startPrefetching(with:)` hands the requests to Nuke's pipeline queue, and `didComplete` is set afterward on the calling thread. When no request needs loading, Nuke's `ImagePrefetcher._startPrefetching(with:)` calls `sendCompletionIfNeeded()` once, which does nothing if `didComplete` isn't set yet, so the promise would never resolve. Setting `didComplete` before `startPrefetching` would remove the race.
- **How to reproduce:** Not reproduced. Calling `TurboImage.prefetch([])` many times in a row (or with images already shown) and checking that each resolves, or running with the Thread Sanitizer, would confirm it.

### Android a prop change after layout reloads the image (unconfirmed)

- **What happens:** possibly, on Android, the first change to any prop after an image has loaded, even one that doesn't affect the image (such as `accessibilityLabel` or `resizeMode`), loads the image again and sends `onStart`, `onSuccess` and `onCompletion` again. Unconfirmed: it depends on the view having no size when its first props are applied.
- **Where:** `android/src/main/java/com/turboimage/TurboImageView.kt`, `buildLoadSignature()` includes the view's `width` and `height` (when there's no `resize`). The first load's signature is built in `onAfterUpdateTransaction()`, which for a new view runs before layout, when the size is 0 × 0; the next prop update builds a signature with the laid-out size, `shouldSkipReload()` sees a different signature, and `reloadImage()` loads again.
- **How to reproduce:** Not reproduced. Log the events of a loaded `TurboImage`, then change its `accessibilityLabel`: a second `onStart` would confirm it.
