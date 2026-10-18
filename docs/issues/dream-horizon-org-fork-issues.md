# Issues found in the dream-horizon-org fork

Fast Image's maintainers found these while comparing Fast Image with the dream-horizon-org fork (`@d11/react-native-fast-image`), which shares Fast Image's 8.x code; Fast Image fixes or works around each one in its own code, as described below, except those in the last section, [Other issues](#other-issues), which Fast Image has no counterpart for. They were checked on 2026-10-18 against the fork's `main` branch at commit `eabb78f` (2026-02-04; 8.13.0 plus the commits since). Paths are relative to the fork's repository. Many of them were found and tested in Fast Image 8.x or 9.x, which had the same code; where that's the case, the issue says so, but none of them were run against the fork itself. If you maintain the fork, feel free to hand this file to your coding agent.

## Android and preload crash on sources without a usable uri

- **What happens:**
    - On Android, since the raw resource lookup added after 8.13.0, a view whose `uri` isn't a url and isn't a bundled image (a relative path like `'photo.jpg'`, a typo, a missing asset) crashes the app with a `NullPointerException`. So does `{ uri: '' }` with a `defaultSource`, in release builds (where `defaultSource` resolves), e.g. `{ uri: user.avatarUrl ?? '' }` for a user without an avatar. In 8.13.0 these fire `onError` instead.
    - On Android, `FastImage.preload()` crashes on a source with `uri: null` (`NullPointerException`), and on a uri that can't be resolved (`NullPointerException` on `main`, `IllegalArgumentException: Must not be null or empty` from `GlideUrl` in 8.13.0).
    - On iOS, `preload()` throws `NSInvalidArgumentException` for a source without a valid url. On the New Architecture, React Native's TurboModule rethrows an exception from a void method on the module's queue (`ObjCTurboModule::performVoidMethodInvocation`), so the app crashes.
- **Where:**
    - `android/src/main/java/com/dylanvann/fastimage/FastImageSource.java`, `resolveResourceUri()`: when React Native's `ImageSource` gives `Uri.EMPTY` (no scheme and no drawable of that name), `tryResolveFromRawFolder()` returns `null` if there's no raw resource either, so `mUri` is `null`. `FastImageViewWithUrl.onAfterUpdate()` then calls `imageSource.getUri().toString()`, and `getGlideUrl()` does the same in preload.
    - `android/src/main/java/com/dylanvann/fastimage/FastImageViewModuleImplementation.java`, `preload()`: `source.getString("uri").isEmpty()` on a null uri, and `getGlideUrl()` on an unresolved one, on the UI thread.
    - `ios/FastImage/FFFastImageViewModule.mm`, `preload:`: `[urls setObject:source.url atIndexedSubscript:idx]` with a nil url.
- **How to reproduce:** Found by reading the code. Render `<FastImage source={{ uri: 'not-a-real-image.jpg' }} />` on Android, or call `FastImage.preload([{ uri: '' }, {}, { uri: null }, { uri: 'not-a-real-image.jpg' }])`. Fast Image before the fixes below, which had the same preload code, crashed in its `preload-no-uri` and `preload-unresolved` regression cases.
- **How Fast Image handles it:** a uri that's missing or can't be resolved fires `onError` and `onLoadEnd` and shows `defaultSource`, on both platforms, and `preload` skips such sources (and resolves them as not ok) instead of loading them ([#1091](https://github.com/DylanVann/react-native-fast-image/pull/1091), [#1099](https://github.com/DylanVann/react-native-fast-image/pull/1099), [#1109](https://github.com/DylanVann/react-native-fast-image/pull/1109)). Its raw resource lookup keeps the empty uri when there's no raw resource.

## iOS crashes when Fast Image is a Touchable's direct child on the legacy architecture

- **What happens:** on React Native 0.73+ with the legacy architecture, a Fast Image directly inside a `TouchableWithoutFeedback` (or anything that passes Pressability's handlers to its child) crashes with `-[FFFastImageView setOnClick:]: unrecognized selector sent to instance`.
- **Where:** `src/index.tsx` passes the rest of the props, including the `onClick` that Touchables add on React Native 0.73+, to the native `FastImageView`. The legacy view manager (`ios/FastImage/FFFastImageViewManager.mm`) inherits `onClick` from React Native's base view manager, but `FFFastImageView` (an `SDAnimatedImageView`) has no `onClick` property.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same code, crashed in a regression case that taps a Fast Image inside a `TouchableWithoutFeedback`, on iOS with both the legacy architecture and the New Architecture's interop layer.
- **How Fast Image handles it:** 9.x put `onClick` on its wrapper `View` ([#1100](https://github.com/DylanVann/react-native-fast-image/pull/1100)); 10.0 is a single native view that accepts all of `View`'s props ([#1262](https://github.com/DylanVann/react-native-fast-image/pull/1262)).

## iOS sends progress events from SDWebImage's download queue

- **What happens:** `onProgress` events are sent from a background queue while React Native changes the view's event handlers or emitter on the main queue, and while the view may be deallocated. Crash reports match this: `EXC_BAD_ACCESS` / `KERN_INVALID_ADDRESS` in the progress path (reported in this repository as [#331](https://github.com/dream-horizon-org/react-native-fast-image/issues/331), from `-[FFFastImageView onProgressEvent:expectedSize:]` on the New Architecture, and in Fast Image 8.x on the legacy architecture).
- **Where:** `ios/FastImage/FFFastImageView.mm`, `downloadImage:options:context:`: the `progress:` block, which SDWebImage calls on its download queue, calls `onProgressEvent:expectedSize:`, which reads `_eventEmitter` (New Architecture) or reads `self.onFastImageProgress` twice, to check it and to call it (legacy architecture), off the main queue.
- **How to reproduce:** Found by reading the code, with the crash reports above. Fast Image couldn't reproduce it on demand either.
- **How Fast Image handles it:** the progress block sends the event on the main queue, after checking the load is still the view's current one, and only when the image has an `onProgress` ([#1102](https://github.com/DylanVann/react-native-fast-image/pull/1102), [#1272](https://github.com/DylanVann/react-native-fast-image/pull/1272)).

## iOS sends a preloaded image's headers with every later image request

- **What happens:** the `headers` of a source passed to `FastImage.preload()` are sent with every image request the app makes afterwards, to any host, and one preload's headers replace another's. An `Authorization` token for one server is sent to every other image server.
- **Where:** `ios/FastImage/FFFastImageViewModule.mm`, `preload:` calls `[[SDWebImageDownloader sharedDownloader] setValue:header forHTTPHeaderField:key]`, which sets them on SDWebImage's shared downloader.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same code, failed its `preload-headers` regression case: an image preloaded with an `x-token` header, then a view of another url that the test server rejects when the request has that header.
- **How Fast Image handles it:** a preloaded source's headers go on that request only, with a request modifier, as views already did ([#1118](https://github.com/DylanVann/react-native-fast-image/pull/1118)).

## Android fails a download when another image on its url mounts or unmounts

- **What happens:** while an image downloads, another Fast Image of the same url mounting, unmounting or changing source can fail the download, and every image loading that url gets `onError` ("Failed to load resource", caused by `java.util.ConcurrentModificationException`).
- **Where:** `android/src/newarch/java/com/FastImageViewManager.java` and `android/src/oldarch/java/com/FastImageViewManager.java`, `onProgress()`: it goes through the url's list in `VIEWS_FOR_URLS` on the thread reading the download, while the UI thread adds views to it (`FastImageViewWithUrl.onAfterUpdate()`) and removes them (`onDropViewInstance()`). The exception is thrown inside the response body's `read()` (`FastImageOkHttpProgressGlideModule`), so Glide fails the load. The listener maps there (`LISTENERS`, a `WeakHashMap`, and `PROGRESSES`) are also used from several threads without a lock.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same code, failed its `progress-shared-url` case with `onError` and the `ConcurrentModificationException` as root cause: 40 images loading one slow url while 10 more on that url mount and unmount every other frame.
- **How Fast Image handles it:** progress goes through one map of the images that have `onProgress` during their own load, used under a lock, and is posted to the UI thread ([#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271)).

## iOS reports a load replaced by a new source as an error

- **What happens:** changing `source` while the previous image is still loading sends `onError` ("Operation cancelled by user during sending the request") and `onLoadEnd` for the old load, sometimes after the new source's `onLoad`. An app that shows a fallback on `onError` then replaces a loaded image with its fallback (reported in this repository as [#407](https://github.com/dream-horizon-org/react-native-fast-image/issues/407)). Changing to a `data:` uri doesn't cancel the previous load at all, so when that one finishes it replaces the `data:` image and sends another `onLoad`. Progress already queued for the old load can also arrive after the new `onLoadStart`.
- **Where:** `ios/FastImage/FFFastImageView.mm`: the completion block in `downloadImage:options:context:` sends `onError` and `onLoadEnd` for any error, including SDWebImage's `SDWebImageErrorCancelled`, without checking the load is still the current one; `reloadImage`'s `data:image` branch sets the image without cancelling the running load (`sd_cancelCurrentImageLoad`).
- **How to reproduce:** Found by reading the code, and reported in [#407](https://github.com/dream-horizon-org/react-native-fast-image/issues/407). Fast Image before the fix below, which had the same code, failed its `source-change` regression group: a slow image whose source changes to a cached photo (cancelled `onError`) or to a `data:` uri (two `onLoad`s, and the slow image showing).
- **How Fast Image handles it:** each reload cancels the view's current load, also for a `data:` uri or no source, and anything a replaced load still sends (completion, progress, an image or placeholder) is ignored ([#1159](https://github.com/DylanVann/react-native-fast-image/pull/1159), [#1272](https://github.com/DylanVann/react-native-fast-image/pull/1272)).

## Images reload and send load events again when an unrelated prop changes

- **What happens:** a change to another prop (`accessibilityLabel`, `testID`, `tintColor`, `resizeMode`, or, on iOS, each frame of a `LayoutAnimation`) loads the image again and sends `onLoadStart`, `onLoad` and `onLoadEnd` again. On iOS with the New Architecture, if the image is still loading, the restart cancels that load, which then reports `onError` (see above).
- **Where:**
    - Android: `android/src/main/java/com/dylanvann/fastimage/FastImageViewWithUrl.java`: `mNeedsReload` is set by `setSource()` and the other setters but never set back to `false`, so `onAfterUpdate()` (called from `onAfterUpdateTransaction()` for every prop update) reloads every time once the view has had a source.
    - iOS, New Architecture: `ios/FastImage/FFFastImageViewComponentView.mm`, `updateProps:oldProps:` builds a new `FFFastImageSource` on every update, and `FFFastImageView.setSource:` compares it by pointer (`_source != source`), so `didSetProps:` always reloads. The same applies to `blurRadius` and `tintColor`, which are set again on every update (a non-nil `tintColor` draws a new tinted copy each time).
- **How to reproduce:** Found by reading the code, and reported in [#407](https://github.com/dream-horizon-org/react-native-fast-image/issues/407) for iOS. Fast Image before the fix below, which had the same Android code, failed its `no-reload` regression case on Android: an image whose `accessibilityLabel` changes a few times after it loads must not load again.
- **How Fast Image handles it:** Android reloads only for changes that affect the request ([#1108](https://github.com/DylanVann/react-native-fast-image/pull/1108)); the New Architecture component compares each prop with the old props and only applies the ones that changed ([#1220](https://github.com/DylanVann/react-native-fast-image/pull/1220)).

## iOS on the New Architecture loads images without a cache setting as cache web

- **What happens:** on iOS with the New Architecture, a source without `cache` is loaded with `cache: 'web'`, although the README documents `immutable` as the default (Android and the legacy architecture use `immutable`). So every time a view shows an image that SDWebImage has cached, it shows it and then requests the url again through `NSURLCache` (`SDWebImageRefreshCached`). When `NSURLCache` has no fresh copy (it was evicted, or the response was over its per-response size limit), the image is revalidated or downloaded again in full, and when the downloaded bytes differ from `NSURLCache`'s copy (or it had none), the image is set again and `onLoad` and `onLoadEnd` fire a second time.
- **Where:** `src/FastImageViewNativeComponent.ts`: `type CacheControl = WithDefault<'immutable' | 'web' | 'cacheOnly', 'web'>`. Codegen (checked with `@react-native/codegen` 0.87.1) generates `FastImageViewCache cache{FastImageViewCache::Web};` in the source struct, used when the JS source has no `cache` key, and `ios/FastImage/FFFastImageViewComponentView.mm` maps `Web` to `"web"`, which `FFFastImageView.reloadImage` turns into `SDWebImageRefreshCached`. Android's Fabric view manager reads the source as a map, so it's not affected.
- **How to reproduce:** Found by reading the code and Codegen's output. On iOS with the New Architecture, show an image without `cache` twice (unmount and mount it again) and count the requests the server gets.
- **How Fast Image handles it:** its New Architecture component passes the source through as is (`CodegenTypes.UnsafeMixed`) and reads `cache` natively, where a missing value is `immutable` on both platforms ([#1220](https://github.com/DylanVann/react-native-fast-image/pull/1220)). In the fork, `'immutable'` as the `WithDefault` value would do it.

## Android doesn't cancel the load of a removed view or a cleared source

- **What happens:** a Fast Image that's removed from the screen keeps its Glide request: its download goes on, and its image stays in use (Glide's active resources), so `clearMemoryCache()` can't free it until the view is garbage collected. Clearing a view's `source` while it loads doesn't cancel the load either: it finishes, sends `onLoad`, and shows the image.
- **Where:** `android/src/main/java/com/dylanvann/fastimage/FastImageViewWithUrl.java`, `clearView()` only calls `requestManager.clear(this)` when `getTag() instanceof Request`. Glide 4 keeps a view's request under its own tag id (`ViewTarget.setTag(tagId, …)`), so `getTag()` is null and the request is never cleared (reported in this repository as [#386](https://github.com/dream-horizon-org/react-native-fast-image/issues/386)).
- **How to reproduce:** Found by reading the code, and reported in [#386](https://github.com/dream-horizon-org/react-native-fast-image/issues/386). Fast Image before the fix below, which had the same check, failed its `source-cleared` case: a slow image whose source is cleared while it loads got `onLoad` and showed the image.
- **How Fast Image handles it:** `clearView` clears whenever there's a request manager (`RequestManager.clear` does nothing for a view without a request) ([#1165](https://github.com/DylanVann/react-native-fast-image/pull/1165)).

## iOS keeps downloading the image of a removed view

- **What happens:** on iOS, a Fast Image that's removed from the screen while its image downloads isn't cancelled: the download goes on to the end, and the view stays in memory until then. On the New Architecture this happens to every removed view, since the component view replaces its image view without cancelling its load.
- **Where:** `ios/FastImage/FFFastImageView.mm`, `downloadImage:options:context:`: the `progress:` block captures `self` strongly, and SDWebImage's download operation keeps that block until the download ends, so `dealloc` (which calls `sd_cancelCurrentImageLoad`) can't run before then. `ios/FastImage/FFFastImageViewComponentView.mm`, `prepareForRecycle` creates a new `FFFastImageView` without cancelling the old one's load.
- **How to reproduce:** Found by reading the code. Show a large image from a slow server, remove the view while it downloads, and watch the server finish sending it.
- **How Fast Image handles it:** the component view stops its image view when it's recycled, which cancels its load and ignores anything the load still sends, and the load's blocks only hold the view weakly ([#1220](https://github.com/DylanVann/react-native-fast-image/pull/1220)).

## Android shows a zoomed-in slice when the view's size changes after loading

- **What happens:** when a view's size changes after its image loaded (e.g. a `cover` image whose height is set after the first layout), it shows a zoomed-in or cut-off part of the image until it's loaded again.
- **Where:** `FastImageViewWithUrl.onAfterUpdate()` loads with `into(this)`, so Glide crops or fits the bitmap to the view's size at that time; a later layout change doesn't go through a prop update, so nothing loads it at the new size.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which loaded the same way, showed the image zoomed in about 5 times in a regression case where the view's height grows after it loads.
- **How Fast Image handles it:** when the view's size changes after the image loaded, the same image loads again at the new size, without events, keeping the current image until then ([#1142](https://github.com/DylanVann/react-native-fast-image/pull/1142)).

## Android views showing the same animated image share one animation

- **What happens:** GIFs, APNGs and animated WebPs are decoded by APNG4Android's Glide plugin, and every view showing the same image at the same size gets the same drawable. When one of those views loads another source, Glide stops the drawable it showed, so the other views' animations stop too.
- **Where:** `android/build.gradle` adds `com.github.penfeizhou.android.animation:glide-plugin:3.0.5`, whose `GlideAnimationModule` prepends its decoder for animated WebP, APNG, GIF and AVIF. Its drawables have no `ConstantState`, so Glide's `DrawableResource.get()` returns the same drawable to every request that gets the resource from the memory cache or joins its load. Glide's `ImageViewTarget.onLoadCleared()` calls `stop()` on it when a view's request is replaced, and APNG4Android's `FrameAnimationDrawable.stop()` removes the drawable's render listener and stops its decoder. Once removed views clear their requests (see the `clearView()` issue above), unmounting one of the views will stop the others as well.
- **How to reproduce:** Found by reading the code (the fork's request code, APNG4Android 3.0.5's Glide plugin and Glide 4.16), not run. Show two Fast Image views of the same GIF at the same size, then change the source of one of them; the other should keep animating.
- **How Fast Image handles it:** each view plays its own animation: a view gets Glide's drawable when no other view shows it, and otherwise its own copy (GIFs [#1128](https://github.com/DylanVann/react-native-fast-image/pull/1128), animated WebP and AVIF [#1227](https://github.com/DylanVann/react-native-fast-image/pull/1227) and [#1229](https://github.com/DylanVann/react-native-fast-image/pull/1229), APNG [#1228](https://github.com/DylanVann/react-native-fast-image/pull/1228)), so `loop` and `paused` are per view too.

## defaultSource isn't shown in some cases

- **What happens:**
    - On iOS with the New Architecture, `defaultSource` is never shown (reported in this repository as [#385](https://github.com/dream-horizon-org/react-native-fast-image/issues/385)).
    - On Android, a `defaultSource` with no `source` shows nothing (a `NullPointerException`, caught and logged), in release builds where `defaultSource` resolves.
    - On Android, in 8.13.0, a source whose uri can't be resolved fires `onError` and then clears the view, so `defaultSource` doesn't show.
- **Where:** `ios/FastImage/FFFastImageViewComponentView.mm`, `updateProps:oldProps:` never reads `newViewProps.defaultSource`. `FastImageViewWithUrl.onAfterUpdate()` passes a null `imageSource` to `FastImageViewConverter.getOptions()`, which calls `imageSource.isResource()`; the error branch for an empty resolved uri calls `setImageDrawable(null)`.
- **How to reproduce:** Found by reading the code, and reported in [#385](https://github.com/dream-horizon-org/react-native-fast-image/issues/385) for iOS. Fast Image before the fix below, which had the same Android code, failed its `default-no-source` case on Android (the `isResource()` null pointer).
- **How Fast Image handles it:** `defaultSource` shows while an image loads, after an error, and with no source, on both platforms ([#1091](https://github.com/DylanVann/react-native-fast-image/pull/1091), [#1109](https://github.com/DylanVann/react-native-fast-image/pull/1109), [#1220](https://github.com/DylanVann/react-native-fast-image/pull/1220)).

## iOS tintColor can't be removed, and tinted animated images stop

- **What happens:**
    - Removing `tintColor` leaves the image tinted, and the images the view loads afterwards are tinted with the old color too.
    - A tinted GIF or animated WebP shows its first frame only.
    - Each tinted image is a copy drawn at the screen's scale: a 1× network image tinted on a 3× screen takes 9 times its memory.
- **Where:** `ios/FastImage/FFFastImageView.mm`: `setImageColor:` ignores `nil`, and `setImage:` draws a tinted copy with `makeImage:withTint:`, which replaces the original (so there's nothing to go back to), draws only the current frame of an animated image into a still image, and uses `[[UIGraphicsImageRenderer alloc] initWithSize:]`, whose default format has the screen's scale.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same `setImageColor:`, stayed tinted in its tint-removal regression case, and it also showed a tinted GIF on its first frame (`tint-gif`).
- **How Fast Image handles it:** the image is shown as a template with the view's `tintColor`, as React Native's `Image` does, so there's no copy and clearing `tintColor` shows the original; animated images' frames are tinted as they're decoded, with SDWebImage's `animationTransformer` ([#1098](https://github.com/DylanVann/react-native-fast-image/pull/1098), [#1195](https://github.com/DylanVann/react-native-fast-image/pull/1195)).

## Android doesn't send cookies with image requests

- **What happens:** on Android, image requests don't send the app's cookies and don't keep the ones they get, so an image behind cookie authentication loads on iOS (SDWebImage uses `NSHTTPCookieStorage`, shared with `fetch`) but fails on Android.
- **Where:** `android/src/main/java/com/dylanvann/fastimage/FastImageOkHttpProgressGlideModule.java` builds Glide's client from `OkHttpClientProvider.getOkHttpClient()`, whose cookie jar is an empty `ReactCookieJarContainer`: React Native only connects its own networking client's container to the cookie store.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which used the same client, failed its `cookies` regression case on Android (cookies set with `fetch`, then an image the server serves only with them).
- **How Fast Image handles it:** its image client uses Android's cookie store (the one `fetch` and React Native's `Image` use) through OkHttp's `JavaNetCookieJar`, keeps a cookie jar the app set up itself, and goes without cookies when the WebView isn't available ([#1138](https://github.com/DylanVann/react-native-fast-image/pull/1138)).

## Android keeps a response that isn't an image in the disk cache

- **What happens:** when a url once returns something that isn't an image with status 200 (a captive portal's or a proxy's HTML page), Glide keeps that response in its disk cache, and later loads of the url fail (also after relaunching the app) until the cache is cleared.
- **Where:** `FastImageViewConverter.getOptions()` uses Glide's default `DiskCacheStrategy.AUTOMATIC`, which writes the downloaded bytes to the disk cache before decoding them and doesn't remove them when decoding fails; nothing in `FastImageOkHttpProgressGlideModule`'s client checks the response.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same setup, failed its `view-retry` and `preload-retry` cases on Android: the test server sends an HTML page for a url's first request and the image afterwards.
- **How Fast Image handles it:** a network interceptor fails a successful response whose `Content-Type` isn't an image's and whose first bytes aren't an image format, so Glide doesn't cache it and the next load downloads it again; images sent with the wrong type still load ([#1178](https://github.com/DylanVann/react-native-fast-image/pull/1178)).

## Android downloads cache web images on every load

- **What happens:** on Android, `cache: 'web'` images are downloaded again every time they're shown, whatever the server's caching headers say, and with `transition="fade"` they fade in each time.
- **Where:** `FastImageViewConverter.getOptions()` turns off Glide's disk and memory caches for `web` so the HTTP cache decides, but the client (`OkHttpClientProvider.getOkHttpClient()`, React Native's `createClientBuilder()` without a context) has no `Cache`.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same setup, failed its `web-cache` case on Android: an image served with `Cache-Control: max-age=3600`, loaded twice, was requested twice.
- **How Fast Image handles it:** `web` images load through their own OkHttp client with a 50 MB HTTP cache, or the app's client if it already has one ([#1129](https://github.com/DylanVann/react-native-fast-image/pull/1129)), and those shown again from that cache don't fade in ([#1276](https://github.com/DylanVann/react-native-fast-image/pull/1276)).

## Android downloads an image again for each size, and during its preload

- **What happens:** on Android, an image shown at two sizes at the same time (a thumbnail and a full-size view, a grid with several sizes) is downloaded once per size, and a view mounted while `FastImage.preload()` is still downloading its image downloads it a second time.
- **Where:** views load with `into(this)` at their own size and `preload()` (`FastImageViewModuleImplementation.java`) with Glide's `preload()` at the original size. Glide only joins requests with the same key, which includes the size and transformations, so each of them downloads the url (Glide's disk cache only helps once a download has finished).
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which loaded the same way, failed its `downsample-preloading` ("requested 2 times") and `shared-download-chunked` cases on Android.
- **How Fast Image handles it:** requests for one image share one download, whatever their size, including preloads and views mounted during them, and each request decodes its own size from it ([#1231](https://github.com/DylanVann/react-native-fast-image/pull/1231), [#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271)).

## Android downloads that stall never fail

- **What happens:** a download that stalls (a server that accepts the connection and then sends nothing, or stops partway through the body) never fails, so the image never shows and never gets `onError` or `onLoadEnd`. Going by Glide's code, each one also holds one of Glide's source threads (at most 4) while it waits, so a few of them hold up every other remote image.
- **Where:** `FastImageOkHttpProgressGlideModule.registerComponents()` uses `OkHttpClientProvider.getOkHttpClient()`, which React Native builds with connect, read and write timeouts of 0 (none).
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which used the same client, was still waiting in its `stalled-download` case (half of an image sent, then nothing) when the case timed out after 30 s.
- **How Fast Image handles it:** its image clients get 15-second connect and read timeouts, as SDWebImage has on iOS, unless the app's client sets its own ([#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271)).

## iOS fails images that were loading when the app went to the background

- **What happens:** an image still downloading when the app goes to the background fails with `onError` when the app comes back more than 15 seconds later, and stays empty. iOS suspends the download, but SDWebImage's 15-second timeout keeps counting.
- **Where:** `ios/FastImage/FFFastImageView.mm`, `downloadImage:options:context:` sends the timeout error as is; nothing handles the app going to the background.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same code, failed its `background-loading` case on iOS (a slow image, the app sent to the background for 20 s): `onError` with progress stuck partway.
- **How Fast Image handles it:** a download that was running as the app went to the background and fails with a network error is loaded again once the app is active, once per load, without another `onLoadStart` ([#1139](https://github.com/DylanVann/react-native-fast-image/pull/1139)).

## Android views keep their Activity alive

- **What happens:** a Fast Image whose `source` changed stays referenced from a static map after its screen closes, keeping the view and its Activity alive. The view manager also keeps the Glide request manager of the last view it created, and with it a destroyed Activity's request manager fragment, until another Fast Image is created; views can end up loading with another Activity's request manager.
- **Where:** `android/src/newarch/java/com/FastImageViewManager.java` (and `oldarch`): `VIEWS_FOR_URLS` is a static `WeakHashMap` from url to views. `FastImageViewWithUrl.onAfterUpdate()` adds a view under its new url without removing it from the old one; its weak keys are url strings that Glide's memory cache keeps alive through the `GlideUrl` keys. `onDropViewInstance()` looks the view up with `glideUrl.toString()` while it was added with `toStringUrl()`, which differ for urls that need escaping, so such views aren't removed when dropped. `requestManager` is a field of the manager, set in `createViewInstance()` for every view.
- **How to reproduce:** Found by reading the code. In Fast Image before the fixes below, which had the same code, temporary logging showed a view cycling through three urls was in 3 url lists; LeakCanary traces in Fast Image's issues show `FastImageViewManager.requestManager` → `RequestManager` → the destroyed Activity's fragment.
- **How Fast Image handles it:** a view is removed from its previous url when its source changes, is cleared or is dropped, with the same key ([#1111](https://github.com/DylanVann/react-native-fast-image/pull/1111)), and each view keeps the request manager of its own Activity ([#1125](https://github.com/DylanVann/react-native-fast-image/pull/1125)). Since [#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271) there's no list of views per url.

## iOS decodes every image at full size

- **What happens:** on iOS, images are decoded at their full size whatever the size of the view, so a 4000 × 3000 photo in a 100-point thumbnail takes about 48 MB of memory, in the view and in SDWebImage's memory cache.
- **Where:** `ios/FastImage/FFFastImageView.mm`, `reloadImage` passes no thumbnail size (`SDWebImageContextImageThumbnailPixelSize`) or other downsampling to SDWebImage.
- **How to reproduce:** Found by reading the code. Show a few large photos in small views and read the app's memory.
- **How Fast Image handles it:** on iOS, images are decoded at the size the view needs for its fit (read from the image's header first, so `cover` and EXIF orientation are right), by default; the downloaded file stays in the disk cache, so a larger view decodes it again without downloading ([#1158](https://github.com/DylanVann/react-native-fast-image/pull/1158), [#1218](https://github.com/DylanVann/react-native-fast-image/pull/1218)).

## iOS adds the image coders again for every view

- **What happens:** every Fast Image view that's created adds the AVIF, WebP and SVG coders to SDWebImage's shared coders manager again, so the list of coders grows by three for each view over the app's life (also each time the New Architecture recycles a view). SDWebImage asks the coders whether they can decode an image, newest first, so a JPEG or PNG is checked against every added entry before it reaches ImageIO's coder.
- **Where:** `ios/FastImage/FFFastImageView.mm`, `commonInitUtils` (from `init` and `initWithFrame:`) calls `[[SDImageCodersManager sharedManager] addCoder:]` for each coder; SDWebImage's `addCoder:` (5.21.7) adds the coder to its array without checking for duplicates. `FFFastImageViewComponentView.prepareForRecycle` creates a new `FFFastImageView`.
- **How to reproduce:** Found by reading the code. Scroll a list of Fast Image views for a while and log `[SDImageCodersManager sharedManager].coders.count`.
- **How Fast Image handles it:** it registers its coders once, at startup: libwebp's for animated WebPs only (still WebPs keep ImageIO's decoder) and not over a WebP coder the app registered itself, and an ImageIO-based one for animated AVIF ([#1222](https://github.com/DylanVann/react-native-fast-image/pull/1222), [#1239](https://github.com/DylanVann/react-native-fast-image/pull/1239)).

## Android progress events go to every view of a url, and stop early

- **What happens:**
    - Android sends progress events for every image it downloads to every view loading that url, whether or not it has an `onProgress`, and keeps sending a url's progress to a view after its `onLoad`, as long as the view is on the url's list (see above).
    - When one download of a url finishes or fails, progress stops for other downloads of the same url (another size, or another view's `cache: 'web'` load).
    - When the server sends no `Content-Length` (e.g. chunked), events have `total: -1` (`total: 0` on iOS), so `loaded / total` is negative or infinite, and on Android only the first one is sent.
    - A url OkHttp writes differently (`HTTP://…`, an explicit default port) or that an app's interceptor rewrites gets no progress at all.
- **Where:** `FastImageViewManager.onProgress()` sends to every view in `VIEWS_FOR_URLS` for the url. `FastImageOkHttpProgressGlideModule`: `DispatchingProgressListener.update()` calls `forget(key)` when `contentLength <= bytesRead`, which is always true for an unknown length (-1) and also drops the url's listener for other downloads still running; the interceptor keys progress by `request.url().toString()` (OkHttp's form of the url), while views register `glideUrl.toStringUrl()`. iOS: `FFFastImageView.onProgressEvent:expectedSize:` sends SDWebImage's `expectedSize`, which is 0 when the length is unknown.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same code, failed the `progress-unknown-size` (`total -1` on Android, `total 0` on iOS) and `progress-shared-url` cases. In a full regression run on Android, temporary logging counted about 2,290 progress events that went to images without `onProgress`, against 313 used.
- **How Fast Image handles it:** progress is only sent to images with an `onProgress`, during their own load, keyed by the shared download rather than the url string ([#1225](https://github.com/DylanVann/react-native-fast-image/pull/1225), [#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271)); no events are sent while the total is unknown ([#1134](https://github.com/DylanVann/react-native-fast-image/pull/1134)), and events have a 0–1 `progress` ([#1194](https://github.com/DylanVann/react-native-fast-image/pull/1194)).

## Android doesn't work without an Activity

- **What happens:** on Android, Fast Image views in a root view that isn't in an Activity (e.g. created with the application context) don't load, without an error, unless an earlier Fast Image was created in an Activity, whose request manager they then use. `clearMemoryCache()` and `clearDiskCache()` resolve without clearing anything when the app has no current Activity (JS running after Android destroyed the Activity in the background, or in a headless task), and `preload()` does nothing then.
- **Where:** `FastImageViewManager.createViewInstance()` only sets `requestManager` when `isValidContextForGlide()` finds an Activity that isn't destroyed. `FastImageViewModuleImplementation`: `preload`, `clearMemoryCache` and `clearDiskCache` return early when `getCurrentActivity()` is null.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same module code, failed its `clear-without-activity` case on Android (the disk cache wasn't smaller after clearing); with `getActivityFromContext` returning null, it loaded nothing.
- **How Fast Image handles it:** views use `Glide.with(applicationContext)` when there's no Activity at all (a destroyed or finishing Activity is still skipped) ([#1110](https://github.com/DylanVann/react-native-fast-image/pull/1110)), and the module's functions use React Native's application context ([#1267](https://github.com/DylanVann/react-native-fast-image/pull/1267)).

## Android onLoad reports the decoded size, not the image's

- **What happens:** on Android, `onLoad`'s `width` and `height` are the size Glide decoded the image at to fit the view, not the image's own size (e.g. 126 × 63 for a 600 × 300 image in a 60 × 60 view), while iOS reports the image's size. Code that sizes a view from `onLoad` gets the wrong size on Android.
- **Where:** `android/src/main/java/com/dylanvann/fastimage/FastImageRequestListener.java`, `onResourceReady()` sends `resource.getIntrinsicWidth()` and `getIntrinsicHeight()`.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same listener, reported 126 × 63 in its `source-size` case (a 600 × 300 JPEG in a 60 × 60 view).
- **How Fast Image handles it:** the request records the source size Glide sees (after EXIF rotation) through its downsample strategy, keeps it for memory cache hits, and reads it from the header for local images from Glide's resized cache ([#1124](https://github.com/DylanVann/react-native-fast-image/pull/1124)).

## Android on the legacy architecture never loads a 0×0 image

- **What happens:** on Android with the legacy architecture, a Fast Image rendered at 0 × 0 at its parent's origin (for example to read the image's size in `onLoad` before sizing it) never loads, so `onLoad` never fires.
- **Where:** Glide waits for the view to have a size, and the legacy architecture never lays out a view whose frame stays at the initial 0,0,0,0, so `FastImageViewWithUrl` never gets one.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same view, failed its `zero-size` case in the legacy example app on Android.
- **How Fast Image handles it:** 9.x, on the legacy architecture, has a shadow node that tells the view when its computed size is 0 × 0, and the view then lays itself out at 0 × 0, which lets Glide's fallback size apply ([#1122](https://github.com/DylanVann/react-native-fast-image/pull/1122)). 10.0 is New Architecture only, where every view is laid out.

## Android preload fails for local files, and asset uris don't load

- **What happens:** on Android, `FastImage.preload()` of a `file://`, `content://` or `asset:/` uri fails (OkHttp or `URL` rejects the scheme, e.g. `MalformedURLException: unknown protocol: content`), and views don't load `asset:/` uris (files in the app's `assets` folder, which React Native's `Image` supports): `Expected URL scheme 'http' or 'https' but was 'asset'`.
- **Where:** `FastImageViewModuleImplementation.preload()` loads anything that isn't a `data:` uri or a resource as a `GlideUrl`; `FastImageSource.getSourceForLoad()` loads `asset:` uris as a `GlideUrl`.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same code, never loaded `asset:/fastimage-logo.png` in its `asset-uri` case, and logged the OkHttp scheme error for its preload.
- **How Fast Image handles it:** `asset:/` uris are converted to `file:///android_asset/…`, which Glide loads, and `preload` uses the view's `getSourceForLoad()` ([#1119](https://github.com/DylanVann/react-native-fast-image/pull/1119)).

## resizeMode center crops on iOS and differs between platforms

- **What happens:** with `resizeMode="center"`, iOS shows an image larger than the view at its full size, cropped to the middle, where React Native documents `center` as scaling a larger image down to fit, and Android does that. A smaller image is shown at its size in points on iOS and in device pixels on Android, so it's about a third of the size on a 3× Android phone.
- **Where:** `ios/FastImage/FFFastImageView.mm`, `setResizeMode:` sets `contentMode` to the resize mode directly (`UIViewContentModeCenter`); `android/src/main/java/com/dylanvann/fastimage/FastImageViewConverter.java` maps `center` to `ScaleType.CENTER_INSIDE`, which uses the bitmap's size in pixels.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same mapping, showed the `resize-center` case (a 600 × 300 image in a 48 × 48 view) cropped on iOS and scaled down on Android.
- **How Fast Image handles it:** iOS scales an image larger than the view down to fit and centers a smaller one ([#1144](https://github.com/DylanVann/react-native-fast-image/pull/1144)); with `objectFit="scale-down"` (which replaced `resizeMode` in 10.0), Android shows a smaller image at its size in dp, as iOS and CSS do ([#1282](https://github.com/DylanVann/react-native-fast-image/pull/1282)).

## View props go to the inner image view

- **What happens:** props meant for Fast Image's view go to the image view inside its wrapper `View`: `onLayout` reports `x` and `y` as 0 instead of the position in the parent, `pointerEvents="none"` doesn't let touches through to what's behind (the wrapper still takes them), and `hitSlop` (also a Touchable's, passed to its child) has no effect, since the wrapper clips touches outside it.
- **Where:** `src/index.tsx`, `FastImageBase` spreads the rest of the props (`...props`) onto `FastImageView`, which fills the wrapper `View` (`StyleSheet.absoluteFill`).
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same JS, failed regression cases for each: `onLayout` with `marginLeft: 10` reported `x=0`, a tap through a `pointerEvents="none"` image didn't reach the `Pressable` under it, and a tap beside an image, inside its `hitSlop`, didn't reach it.
- **How Fast Image handles it:** 9.x moved them to the wrapper ([#1095](https://github.com/DylanVann/react-native-fast-image/pull/1095), [#1105](https://github.com/DylanVann/react-native-fast-image/pull/1105), [#1264](https://github.com/DylanVann/react-native-fast-image/pull/1264), [#1265](https://github.com/DylanVann/react-native-fast-image/pull/1265)); 10.0 has no wrapper: Fast Image is one native view with all of `View`'s props ([#1262](https://github.com/DylanVann/react-native-fast-image/pull/1262)).

## iOS sends extra or wrong load events

- **What happens:**
    - On the legacy architecture, `onLoadStart` fires twice for one load when `source` and `onLoadStart` are set in the same update, as on mount.
    - A `data:` uri that isn't an image (or is corrupt) fires `onLoad` with a 0 × 0 size instead of `onError`.
    - On the legacy architecture, an `onLoad` handler added after the image loaded is called with no `width` or `height`.
    - A `cache: 'cacheOnly'` image that isn't cached fires `onLoad` (with no size) instead of `onError`.
    - A `cache: 'web'` image fires `onError` after `onLoad` when its check with the server fails (offline, or a server error), though it keeps showing the cached copy.
- **Where:** `ios/FastImage/FFFastImageView.mm`: `setOnFastImageLoadStart:` sends the event when a source is set and it hasn't been sent, and `reloadImage` sends it again; `reloadImage`'s `data:image` branch sends `onLoad` for whatever `sd_imageWithData:` returned, including nil; `setOnFastImageLoad:` sends `self.onLoadEvent` to a handler set after the load, but `onLoadEventSend:` builds the event in a local variable and never sets that property, so it's nil; `cacheOnly` sets `SDWebImageFromCacheOnly`, with which SDWebImage completes a load that isn't cached with neither an image nor an error, and the completion block sends `onLoad` whenever there's no error; `web` sets `SDWebImageRefreshCached`, with which SDWebImage completes with the cached image and again after the check, and the second completion's error is sent as `onError`.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same code, failed its `load-start-once` ("onLoadStart fired 2 times") and `error-invalid-data-uri` cases on iOS, and its `cache-only-miss` case ("onLoad") and `stale-if-error` case (`onError` after `onLoad`), which had the same completion. The missing `onLoad` size was found by reading the code.
- **How Fast Image handles it:** the setter only sends `onLoadStart` for a load already running ([#1114](https://github.com/DylanVann/react-native-fast-image/pull/1114)), and a `data:` uri that can't be decoded fails like a remote image, with `onError`, `onLoadEnd` and `defaultSource` ([#1126](https://github.com/DylanVann/react-native-fast-image/pull/1126)), and so does a `cacheOnly` image that isn't cached ([#1315](https://github.com/DylanVann/react-native-fast-image/pull/1315)); a `web` image whose check fails because the server can't be reached or has an error keeps its cached copy without `onError` ([#1316](https://github.com/DylanVann/react-native-fast-image/pull/1316)). Fast Image 9.x keeps the load's event and sends it to a handler added later; Fast Image now doesn't call a handler added after its image loaded.

## iOS keeps fading after transition is removed

- **What happens:** on iOS, once a view has had `transition="fade"`, it keeps fading images in after `transition` is removed or set to `none`. The fade's length is fixed (SDWebImage's `fadeTransition`, 0.5 s), where Android's cross-fade uses Glide's default (300 ms).
- **Where:** `ios/FastImage/FFFastImageView.mm`, `downloadImage:options:context:` sets `self.sd_imageTransition` for `fade` but never sets it back to nil.
- **How to reproduce:** Found by reading the code. Load an image with `transition="fade"`, set `transition="none"`, and change the source to an image that isn't in the memory cache.
- **How Fast Image handles it:** each load uses the current `transition`, and its length can be set (a number of milliseconds, or `true` for the platform's usual length) ([#1164](https://github.com/DylanVann/react-native-fast-image/pull/1164)).

## blurRadius reloads when it changes, differs between platforms, and isn't cached on Android 12+

- **What happens:**
    - Changing `blurRadius` loads the image again, with `onLoadStart`, `onLoad` and `onLoadEnd`, on both platforms.
    - On iOS, the blur runs on the main thread, on the full-size image, and `defaultSource` is blurred too.
    - A radius looks different on iOS and Android, and on iOS it depends on the image's resolution: iOS blurs in the image's pixels, Android scales the radius against a 540-pixel reference (by the bitmap's size before Android 12, by the view's size from Android 12).
    - On Android 12 and later, blurred images never come from Glide's memory cache, so each one is decoded again when it's shown, and the blur is set on the view from Glide's decoding thread.
    - On Android, GIFs, APNGs and animated WebPs aren't blurred at all.
    - Possible, not confirmed: on Android 12 and later, a blurred local image (bundled or a file) shown again from Glide's disk cache of transformed images could show unblurred.
- **Where:**
    - iOS: `FFFastImageView.setBlurRadius:` sets `_needsReload`, and `setImage:` (called by SDWebImage on the main queue, for the placeholder too) runs `FFFastImageBlurTransformation.transform:`, which creates a `CIContext` and blurs `image.CGImage` with `CIGaussianBlur` at the radius as given.
    - Android: `FastImageViewWithUrl.setBlurRadius()` sets `mNeedsReload`; `FastImageBlurHelper.transform()` adds `FastImageBlurTransformation`, whose `equals()` returns `false` on Android 12+ (`Build.VERSION_CODES.S`), so no request's key matches a cached one. There, `transform()` calls `FastImageBlurEffectEngine.apply()`, which sets a `RenderEffect` and tags on the `ImageView` (on Glide's thread) and returns the bitmap unblurred; before Android 12, `FastImageBlurScriptEngine` blurs a copy scaled to about 540 pixels with RenderScript. The animated formats are decoded by APNG4Android's plugin to a `FrameSeqDecoder`, for which Glide has no transformation, so it applies none (`DecodeHelper.getTransformation()` falls back to `UnitTransformation` when other transformations are set).
    - The possible issue: Glide's default `DiskCacheStrategy.AUTOMATIC` keeps transformed local images in its resource cache under the transformation's disk key (`updateDiskCacheKey()` is by radius), and a load from there doesn't run `transform()`, so nothing would set the `RenderEffect` on a new view.
- **How to reproduce:** Found by reading the code. Change `blurRadius` on a loaded image and count `onLoad`; show one image with the same `blurRadius` on iOS and Android and compare; show a GIF with `blurRadius=10` on Android. To confirm the possible issue, show a bundled image with `blurRadius` on Android 12+, then mount a second view of it at the same size.
- **How Fast Image handles it:** it blurs a copy of the image off the main thread (Glide's threads on Android), at about the size it's shown at, with React Native's iOS box-blur math, so a radius looks the same on both platforms whatever the file's resolution; the blur is part of the request's cache key with a value-based `equals`, `defaultSource` isn't blurred, and a new radius doesn't send load events again, also when it changes several times in a row on Android ([#1193](https://github.com/DylanVann/react-native-fast-image/pull/1193), [#1292](https://github.com/DylanVann/react-native-fast-image/pull/1292)). On Android a blurred animated image shows its first frame, blurred.

## iOS preload doesn't try failed urls again

- **What happens:** after a url failed in a way SDWebImage remembers (data that isn't an image, an invalid url, a DNS or TLS failure), from a view or a preload, every later `FastImage.preload()` of it fails without a request ("Image url is blacklisted") until the app is relaunched. Views try again, since they pass `SDWebImageRetryFailed`.
- **Where:** `ios/FastImage/FFFastImageViewModule.mm`, `preload:` calls `[[SDWebImagePrefetcher sharedImagePrefetcher] prefetchURLs:]` with the prefetcher's default options (`SDWebImageLowPriority`).
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which preloaded the same way, failed its `preload-retry` case on iOS: a url that sends a page once and the image afterwards, preloaded twice.
- **How Fast Image handles it:** preloads pass `SDWebImageRetryFailed` too ([#1177](https://github.com/DylanVann/react-native-fast-image/pull/1177)).

## Android priority doesn't move a download ahead

- **What happens:** on Android, `priority: 'high'` doesn't make an image download sooner while other images load: requests go to OkHttp as soon as Glide starts them, and OkHttp sends them first come, first served (5 per host), so a high-priority image mounted while others load is requested after them.
- **Where:** `FastImageViewConverter.getOptions()` sets Glide's `priority`, which only orders jobs waiting for one of Glide's source threads; Glide's OkHttp fetcher (`okhttp3-integration`) enqueues the call as soon as its job starts.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which loaded through the same fetcher, failed its `download-priority` case ("the high-priority image was requested after all 20 others").
- **How Fast Image handles it:** it queues downloads itself: a limited number run at once and the rest wait in priority order, a waiting download moves up for a more urgent request, and at most OkHttp's per-host limit wait for a server's response ([#1271](https://github.com/DylanVann/react-native-fast-image/pull/1271), [#1285](https://github.com/DylanVann/react-native-fast-image/pull/1285)).

## Android loses its Glide setup in apps with expo-image

- **What happens:** in an app that also has expo-image, the app ends up with two of Glide's generated `GeneratedAppGlideModuleImpl` classes, and when expo-image's is the one used, the fork's own Glide modules aren't registered: `FastImageOkHttpProgressGlideModule` (so `onProgress` never comes, and images don't load through React Native's OkHttp client) and its `SvgModule`. `excludeAppGlideModule` only removes the fork's `AppGlideModule`; nothing registers its components otherwise.
- **Where:** `android/src/main/java/com/dylanvann/fastimage/FastImageGlideModule.java` (an `AppGlideModule`), `FastImageOkHttpProgressGlideModule.java` (a `LibraryGlideModule`, only registered by a generated module that lists it), and the `excludeAppGlideModule` option in `android/build.gradle`.
- **How to reproduce:** Found by reading the code. Fast Image before the fix below, which had the same setup, failed its `smoke-progress` and `smoke-web-cache` cases in an Expo app with expo-image.
- **How Fast Image handles it:** it registers its components with Glide the first time it uses Glide, if Glide started without them, leaves its `AppGlideModule` out automatically when the app has expo-image, and limits its decoders to its own requests ([#1241](https://github.com/DylanVann/react-native-fast-image/pull/1241)).

## TypeScript style types lose layout props with the Strict TypeScript API

- **What happens:** with React Native's Strict TypeScript API (opt-in since 0.80, and the default in 0.87 according to the report below), `style={{ width: 48, height: 48 }}` on a Fast Image is a type error, since `ImageStyle` extends types that are no longer exported (reported in this repository as [#402](https://github.com/dream-horizon-org/react-native-fast-image/issues/402)). Radii and `opacity` are typed `number` and colors `string`, so Animated values, string radii and `ColorValue`s (e.g. `PlatformColor`) don't type-check.
- **Where:** `src/index.tsx`: `export interface ImageStyle extends FlexStyle, TransformsStyle, ShadowStyleIOS` with its own `number` and `string` fields.
- **How to reproduce:** Reported in [#402](https://github.com/dream-horizon-org/react-native-fast-image/issues/402).
- **How Fast Image handles it:** `ImageStyle` is React Native's `ViewStyle` plus `overlayColor` and `tintColor`, so every style key has the app's React Native types ([#1086](https://github.com/DylanVann/react-native-fast-image/pull/1086), [#1104](https://github.com/DylanVann/react-native-fast-image/pull/1104), [#1211](https://github.com/DylanVann/react-native-fast-image/pull/1211)).

## Jest needs transformIgnorePatterns

- **What happens:** an app's Jest tests that import Fast Image fail with a syntax error unless the app adds the fork to `transformIgnorePatterns`, since the package's entry point is TypeScript.
- **Where:** `package.json`: `"main": "src/index"` (and `module`, `source`), so Jest resolves to `src/index.tsx`, which React Native's Jest preset doesn't transform in `node_modules` (its `transformIgnorePatterns` only allows `react-native` and `@react-native` packages).
- **How to reproduce:** Found by reading the code. Import the package in a test of a new React Native app with its default Jest config.
- **How Fast Image handles it:** its published entry point is plain JavaScript (`dist`, including the Codegen specs), while Metro still reads the TypeScript sources through the `react-native` field, so it renders in an app's Jest tests with no setup ([#1220](https://github.com/DylanVann/react-native-fast-image/pull/1220)).

## Other issues

These were found while comparing the two libraries, but Fast Image has no counterpart for them, so there's no fix to point to.

### iOS build fails with DISABLE_SVG=1

- **What happens:** with `DISABLE_SVG=1` set when installing pods, as the README describes for leaving SVG support out, the iOS build fails with `'SDWebImageSVGCoder/SDImageSVGCoder.h' file not found` (reported in this repository as [#379](https://github.com/dream-horizon-org/react-native-fast-image/issues/379)).
- **Where:** `RNFastImage.podspec` leaves out the `SDWebImageSVGCoder` dependency when the `DISABLE_SVG` environment variable is `1`, but doesn't pass `DISABLE_SVG` to the compiler (no `GCC_PREPROCESSOR_DEFINITIONS`). `ios/FastImage/FFFastImageView.mm` imports the coder under `#if !defined(DISABLE_SVG) || DISABLE_SVG == 0`, which is then always true. Adding `DISABLE_SVG=1` to the pod's `GCC_PREPROCESSOR_DEFINITIONS` in the podspec when the variable is set would match the two.
- **How to reproduce:** Found by reading the code, and reported in [#379](https://github.com/dream-horizon-org/react-native-fast-image/issues/379). Run `DISABLE_SVG=1 pod install` and build.

### Android build fails with the other AndroidSVG package

- **What happens:** an app (or another library) with `com.caverock:androidsvg` fails to build with "Duplicate class com.caverock.androidsvg…", since the fork brings `com.caverock:androidsvg-aar`, which has the same classes (reported in this repository as [#378](https://github.com/dream-horizon-org/react-native-fast-image/issues/378)). Fast Image includes the same package and has the same conflict; it [documents](../troubleshooting.md#duplicate-androidsvg-classes) leaving its package out with `configurations.all { exclude group: 'com.caverock', module: 'androidsvg-aar' }`. That should work for the fork too, since its decoder only uses classes both packages have, but it hasn't been tried with the fork.
- **Where:** `android/build.gradle`: `implementation "com.caverock:androidsvg-aar:1.4"`.
- **How to reproduce:** Reported in [#378](https://github.com/dream-horizon-org/react-native-fast-image/issues/378): add `com.caverock:androidsvg` to an app that has the fork and build it.
