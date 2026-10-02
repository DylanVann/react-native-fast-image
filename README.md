# React Native Fast Image

Performant React Native image component.

[![Version][version-badge]][package]
[![Downloads][downloads-badge]][npmtrends]
[![Build Status][build-badge]][build]

It caches aggressively, and is built on [SDWebImage](https://github.com/SDWebImage/SDWebImage) on iOS and [Glide](https://github.com/bumptech/glide) on Android. Use it in place of React Native's `Image` where images flicker, miss the cache, or load slowly from it.

## Features

- **Caching** on disk and in memory, with control over how fresh images must be ([`cache`](#sourcecache)), keys for urls that change ([`cacheKey`](#sourcecachekey)), and the cache's size ([`configureCache`](#configurecachelimits)).
- **Preloading** images before they're shown, with a result for each ([`preload`](#preloadsources)), and the cached file's path ([`getCachePath`](#getcachepathsource)).
- **Headers** for images that need them, and [**priorities**](#sourcepriority) for which images to start loading first.
- **Several sizes** of an image, loading the one that fits the view ([`source`](#source)), and large images [**downsampled**](#downsample) to the view's size.
- **Animated images** (GIF, animated WebP) that can [loop](#loop) and [pause](#paused), and [**fades**](#transition) in and between images.
- [**SVG**](#svg-images) and [**photo library**](#photo-library-images-ios) images.
- [**`FastImageBackground`**](#fastimagebackground) for content on top of an image.
- **Expo**, with a config plugin, and the [**web**](#web).

## Installation

Works with React Native 0.60 and later, with the New Architecture (through React Native's interop layer) and the legacy architecture, and with Expo. It's tested on React Native 0.87 with the New Architecture, 0.73 with the legacy architecture, and Expo SDK 57. A native New Architecture component is planned for the next major version.

```bash
npm install react-native-fast-image
cd ios && pod install
```

With Expo:

```bash
npx expo install react-native-fast-image
```

It has native code, so it needs a [development build](https://docs.expo.dev/develop/development-builds/introduction/) (e.g. `npx expo run:ios`), not Expo Go.

If your Android app has its own Glide `AppGlideModule`, read [using FastImage with an AppGlideModule](docs/android-build-settings.md#if-your-app-has-its-own-appglidemodule) first, or FastImage may not work.

## Usage

```jsx
import FastImage from 'react-native-fast-image'

const YourImage = () => (
    <FastImage
        style={{ width: 200, height: 200 }}
        source={{
            uri: 'https://example.com/image.jpg',
            headers: { Authorization: 'someAuthToken' },
            priority: 'normal',
        }}
        resizeMode="contain"
    />
)
```

## Components

### `FastImage`

<!-- api:props start (generated from src/ by website/scripts/generate.mts) -->

#### `source`

**Type:** `number | Source | Source[]`

Source for the remote image to load: a `Source`, a `require()`d image, or an array of the same image at different sizes.

When `source` changes, the image that's showing stays until the new one has loaded. In views that get reused for other content, such as rows in FlashList or recyclerlistview, set `recyclingKey` so a reused row doesn't show the previous row's image.

**Several sizes of an image.** `source` can also be an array of the same image at different sizes, each with its `width` and `height` in pixels (times `scale`, if it has one). The view loads the one whose size is closest to its own, in pixels, so a small view downloads a small image:

```jsx
<FastImage
    style={{ width: 120, height: 120 }}
    source={[
        { uri: 'https://example.com/photo-200.jpg', width: 200, height: 200 },
        { uri: 'https://example.com/photo-800.jpg', width: 800, height: 800 },
    ]}
/>
```

- The view picks once it has been laid out. One that has no size (e.g. sized from `onLoad`) loads the largest.
- When the view's size changes so that another size fits better, it loads that one (with its load events), and keeps showing the current image until then, without a `transition`.
- Each size is cached separately. A `cacheKey` applies to its own entry: give each size its own key (or none), or the sizes would replace each other in the cache.
- `FastImage.preload`, `getCachePath` and `writeToCache` take one size: pass the one a view will show. An array fails with `{ ok: false, error }`.
- An array of one is the same as that source.

---

##### `source.uri`

**Type:** `string`

Remote url to load the image from. e.g. `'https://example.com/image.jpg'`.

Also loads local files (`file://`, and on Android `content://`), photo library images on iOS (`ph://`, see [Photo library images](#photo-library-images-ios)) and SVG images (see [SVG images](#svg-images)).

---

##### `source.headers`

**Type:** `{ [key: string]: string }`

Headers to load the image with. e.g. `{ Authorization: 'someAuthToken' }`.

---

##### `source.priority`

**Type:** `Priority` · **Default:** `'normal'`

A hint for which images to start loading first when several are waiting: `'high'` ones before `'normal'` ones, and `'low'` ones after. It's best effort, not an order: several images load at once, and when each finishes depends on its size and the network.

- `'low'`: e.g. images further down a list.
- `'normal'`: the default.
- `'high'`: e.g. the image the screen is about.

---

##### `source.cache`

**Type:** `Cache` · **Default:** `'immutable'`

How fresh the image must be. See [how caching is handled](docs/how-is-caching-handled.md) for how the options fit together.

- `'immutable'`: loads the image once, then shows the cached copy until its url (or `cacheKey`) changes.
- `'web'`: follows the server's HTTP cache headers, as a browser does, checking with the server when it loads. These responses are kept in their own HTTP cache (50 MB on each platform), which `clearDiskCache` also clears.
- `'cacheOnly'`: only shows a cached image, without making a request.

---

##### `source.cacheKey`

**Type:** `string`

The key the image is cached under, instead of its uri. Use it for urls that change while the image stays the same, e.g. signed urls with a token or an expiry. Use something that identifies the image, and change it when the image changes (e.g. include a version or the time it was updated), or the old image keeps showing.

Not used with `cache: 'web'`, which follows the HTTP cache (keyed by url).

```jsx
<FastImage
    source={{
        uri: signedUrl,
        cacheKey: `avatar-${user.id}-${user.avatarUpdatedAt}`,
    }}
/>
```

---

##### `source.memoryCache`

**Type:** `boolean` · **Default:** `true`

Whether the decoded image is kept in the memory cache. With `false` it's only kept on disk: a view doesn't leave it in memory once it stops showing it, and `FastImage.preload` downloads it without decoding it. Use it for large images that are shown once or rarely, like a full-screen photo: a decoded photo can take tens of MB of memory. Images shown again, like a list scrolled back, are decoded from disk again.

---

##### `source.width`

**Type:** `number`

With several sources (`source` as an array), the image's width at this uri, in pixels (times `scale`, if given).

---

##### `source.height`

**Type:** `number`

With several sources (`source` as an array), the image's height at this uri, in pixels (times `scale`, if given).

---

##### `source.scale`

**Type:** `number`

With several sources, the scale `width` and `height` are multiplied by.

---

#### `defaultSource`

**Type:** `number`

An asset loaded with `require(...)`, shown while the first image loads, and if an image fails to load. When `source` changes, the previous image shows while the new one loads instead (see `source` and `recyclingKey`).

On Android, `defaultSource` doesn't show in debug builds: there the dev server serves `require()`d images, and `defaultSource` is only loaded from the app's resources.

---

#### `resizeMode`

**Type:** `ResizeMode` · **Default:** `'cover'`

How the image fills the view.

- `'contain'`: scales it uniformly (keeping its aspect ratio) so all of it fits in the view (minus padding).
- `'cover'`: scales it uniformly (keeping its aspect ratio) so it covers the view (minus padding), cropping what doesn't fit.
- `'stretch'`: scales its width and height separately to fill the view, which can change its aspect ratio.
- `'center'`: centers it at its own size, scaled down uniformly to fit if it's larger than the view.
- `'repeat'`: repeats it to cover the view, from its top-left corner, at the image's own size in pixels (a bundled image at its size in points), scaled down to fit if it's larger than the view. An animated image repeats its first frame, and `defaultSource` repeats too.

---

#### `fallback`

**Type:** `boolean`

If true, the image is shown with React Native's `Image` instead, styled and laid out the same way. FastImage's own features, such as its caching options, `priority` and `transition`, don't apply.

---

#### `recyclingKey`

**Type:** `string | null`

For views that get reused for other content, such as rows in FlashList or recyclerlistview. Set it to something that identifies the content, e.g. the item's id. When it changes, the image is cleared right away (to `defaultSource`, or blank) instead of staying until the new one has loaded. Unlike changing `key`, this keeps the view, which is what list recycling is for.

```jsx
<FastImage recyclingKey={item.id} source={{ uri: item.imageUrl }} />
```

---

#### `loop`

**Type:** `number | boolean`

How many times an animated image (GIF, animated WebP) plays:

- Not set: as many times as the file says (like a browser).
- `true`: forever.
- `false`: once.
- A number: that many times.

Changing it restarts the animation.

---

#### `imageRendering`

**Type:** `'auto' | 'smooth' | 'pixelated'` · **Default:** `'auto'`

How the image is filtered when it's drawn smaller or larger than its size (like CSS's `image-rendering`):

- `'auto'`: the platform's usual filtering.
- `'smooth'`: iOS only. Keeps a large image drawn much smaller than its size (e.g. a big photo as a thumbnail, or fine lines and text) from looking jagged or noisy. Such an image is already decoded at about the view's size by default (see `downsample`), so this is for images shown at less than half their size with `downsample={false}`, or a little smaller than their size. **It uses more memory:** the image is also kept at smaller sizes for drawing, about a third more than the decoded image. On Android it's the same as `'auto'` (images are always decoded at about the view's size there).
- `'pixelated'`: sharp pixels, without smoothing, e.g. for pixel art drawn larger than its size. On Android, animated images are still smoothed.

---

#### `paused`

**Type:** `boolean`

Pauses an animated image (GIF, and animated WebP on iOS) on the frame it's showing; `false` plays it again from there. Each image animates on its own, so pausing one doesn't pause others showing the same file.

---

#### `transition`

**Type:** `number | boolean | Transition | null` · **Default:** `false`

Fades the image in when it loads. `true` uses the platform's usual fade, a number is the duration in milliseconds, or pass a `Transition`.

Downloads, local files (`file://`, `content://`) and bundled images (`require()`) fade in. In lists that reuse views (e.g. FlashList), set `recyclingKey`, so a reused view starts empty and its image fades in, instead of showing the previous item's image until it loads.

```jsx
<FastImage source={{ uri }} transition />
<FastImage source={{ uri }} transition={500} />
<FastImage source={{ uri }} transition={{ betweenImages: true, skipOnCacheHit: 'none' }} />
```

---

#### `downsample`

**Type:** `boolean` · **Default:** `true` · iOS only

Decodes a large image at about the size it's shown at, instead of at full size, so it takes much less memory.

- `true`: an image at least twice the size its view needs is decoded at about the view's size. If the view grows, the image is decoded again for its new size (from the disk cache).
- `false`: images are decoded at full size, e.g. for an image that's zoomed in on with a transform (a pinch-to-zoom viewer), which would otherwise show the smaller copy enlarged.

It doesn't change `onLoad`'s width and height (the image's own size) or the cached file. Needs SDWebImage 5.19.7 or later: before 5.19 images are decoded at full size, and 5.19.0 to 5.19.6 show photos stored sideways with an EXIF orientation (most phone photos) sideways. Photo library images are always decoded this way, and on Android images are always decoded at about the view's size.

If you control the images, serve them at the size they're shown (resized on your server or by an image CDN), which also saves bandwidth.

---

#### `blurRadius`

**Type:** `number` · **Default:** `0`

Blurs the image by this radius, in points (the same radius looks about the same on iOS and Android). `0` is no blur.

It's for still images, or a radius that changes now and then (e.g. blurring a photo behind a sheet). Each change blurs the image again on the CPU, so don't animate it.

- Only the loaded image is blurred, not `defaultSource`.
- An animated image (GIF, animated WebP) shows its first frame, blurred, and doesn't animate.
- With `tintColor`, the blurred image is tinted.
- The image is blurred at about the size it's shown at, off the main thread. The cached file stays the original image, so `getCachePath` and other views of it aren't affected.
- Changing it blurs the image that's showing again, without sending the load events again.

To animate a blur, or to blur an animated image, use React Native's `filter` style instead, which the GPU draws: `style={{ filter: [{ blur: 6 }] }}`. It needs the New Architecture. React Native's docs list `blur` for Android 12+ only; on iOS it's behind an experimental React Native feature flag (`enableSwiftUIBasedFilters`, SwiftUI-based filters).

---

#### `onLoadStart`

**Type:** `() => void`

Called when the image starts to load.

---

#### `onProgress`

**Type:** `(event: OnProgressEvent) => void`

Called while the image downloads, with the bytes `loaded` so far, the `total`, and `progress` (`loaded / total`, from 0 to 1; the last event has 1). Not called while the total is unknown (a response without a `Content-Length`).

```jsx
onProgress={e => console.log(e.nativeEvent.progress)}
```

---

#### `onLoad`

**Type:** `(event: OnLoadEvent) => void`

Called on a successful image fetch. Called with the width and height of the image itself, not of the view (on iOS, in points: an `@2x` asset reports half its pixel size).

```jsx
onLoad={e => console.log(e.nativeEvent.width, e.nativeEvent.height)}
```

---

#### `onError`

**Type:** `(event: OnErrorEvent) => void`

Called on an image fetching error, with a message describing it (e.g. the HTTP status code).

```jsx
onError={e => console.log(e.nativeEvent.error)}
```

---

#### `onLoadEnd`

**Type:** `(result: LoadResult) => void`

Called when the image finishes loading, whether it was successful or an error, with the result: `{ ok: true, width, height }` (the image's size, as `onLoad` gets it) or `{ ok: false, error }` (as `onError` gets it). TypeScript makes you check `ok` before reading the size or the error.

```jsx
<FastImage
    source={{ uri }}
    onLoadEnd={(result) => {
        if (result.ok) setAspectRatio(result.width / result.height)
        else setFailed(result.error)
    }}
/>
```

---

#### `onLayout`

**Type:** `(event: LayoutChangeEvent) => void`

Invoked on mount and layout changes with `{ nativeEvent: { layout: { x, y, width, height } } }`.

---

#### `style`

**Type:** `StyleProp<ImageStyle>`

A React Native style. Supports using `borderRadius`.

---

#### `tintColor`

**Type:** `ColorValue`

If supplied, changes the color of all the non-transparent pixels to the given color.

---

#### `testID`

**Type:** `string`

A unique identifier for this element to be used in UI Automation testing scripts.

---

#### `children`

**Type:** `ReactNode`

Render children within the image. In the next major version, `FastImage` won't render children: use `FastImageBackground`.

<!-- api:props end -->

### `FastImageBackground`

An image with content on top of it: a view that the image fills, with the children on top.

Use it rather than giving `FastImage` children: in the next major version, `FastImage` won't render children, since the image will be a single native view ([#1137](https://github.com/DylanVann/react-native-fast-image/pull/1137)), which can't hold them. `FastImageBackground` works the same in both.

```jsx
import { FastImageBackground } from 'react-native-fast-image'

const Banner = () => (
    <FastImageBackground
        source={{ uri: 'https://example.com/banner.jpg' }}
        style={{ width: 200, height: 100 }}
        imageStyle={{ borderRadius: 8 }}
    >
        <Text>On top of the image</Text>
    </FastImageBackground>
)
```

Its own props are these; the others are `FastImage`'s and go to the image. Its ref is the view's (`imageRef` is the image's).

<!-- api:background-props start (generated from src/ by website/scripts/generate.mts) -->

- `style?` (`StyleProp<ViewStyle>`): The container's style; the image fills it.
- `imageStyle?` (`StyleProp<ImageStyle>`): The image's style.
- `imageRef?` (`Ref<any>`): A ref to the image (the FastImage inside).
- `children?` (`ReactNode`): Content shown on top of the image.

<!-- api:background-props end -->

## Methods

### `preload(sources)`

**Parameters:** `sources: Source[]` · **Returns:** `Promise<PreloadResult[]>`

Preload images to display later. e.g.

```js
FastImage.preload([
    {
        uri: 'https://example.com/image-1.jpg',
        headers: { Authorization: 'someAuthToken' },
    },
    {
        uri: 'https://example.com/image-2.jpg',
        headers: { Authorization: 'someAuthToken' },
    },
])
```

It resolves when all the images have loaded or failed, with a result for each source, in order: `{ uri, ok: true, width, height }` if it loaded, or `{ uri, ok: false, error }` if it didn't (checking `ok` narrows the type in TypeScript). `width` and `height` are the image's size (as in `onLoad`), which is also a way to find an image's size without showing it. A few sources load at a time (3, or `SDWebImagePrefetcher`'s `maxConcurrentPrefetchCount` on iOS), so a long list doesn't hold up the images the app is showing, and at low priority unless the source sets `priority`. It never rejects:

```js
const results = await FastImage.preload(sources)
for (const result of results) {
    if (result.ok) {
        console.log(result.uri, result.width, result.height)
    } else {
        console.warn(result.uri, result.error)
    }
}
```

Each source's `cache` applies, as for a view: with `web` the preload follows the HTTP cache, and with `cacheOnly` it doesn't download. A `cacheOnly` preload resolves `ok` only if the image is cached, and loads it from the disk cache into memory, so a view shows it at once.

A source with `memoryCache: false` is only downloaded to the disk cache, without being decoded into memory, and is decoded when it's shown. Use it to preload many images, or large ones, e.g. the next pages of a feed: a decoded photo can take tens of MB of memory. Other sources are also kept decoded in memory, so they show at once.

```js
await FastImage.preload(photos.map((uri) => ({ uri, memoryCache: false })))
```

### `clearMemoryCache()`

**Returns:** `Promise<void>`

Removes every image from the memory cache, e.g. to free memory. They're decoded from the disk cache again when they're next shown.

### `clearDiskCache()`

**Returns:** `Promise<void>`

Removes every image from the disk cache, including the HTTP cache of `cache: 'web'` images, e.g. when a user logs out. They're downloaded again when they're next shown. There's no way to remove a single image: to load one again after it changed, change its [`cacheKey`](#sourcecachekey).

### `getCachePath(source)`

**Parameters:** `source: Source` · **Returns:** `Promise<CachePathResult>`

The path of the source's downloaded file in the disk cache, e.g. to share, save or upload an image without downloading it again. If the file isn't there, it's downloaded first, without decoding the image or keeping it in memory. Resolves with `{ ok: true, path }`, or `{ ok: false, error }` if it can't be downloaded. Never rejects.

```js
const result = await FastImage.getCachePath({ uri: photo.url })
if (result.ok) {
    await shareFile(`file://${result.path}`) // e.g. with react-native-share
}
```

With `cache: 'cacheOnly'` it doesn't download: use it to check whether an image is cached. A source with a `cacheKey` and no `uri` is only looked up too (there's no url to download from), e.g. for an image whose signed url has expired.

```js
const { ok } = await FastImage.getCachePath({
    uri: photo.url,
    cache: 'cacheOnly',
})
```

- The source's `headers`, `cacheKey` and `priority` apply, as for a view. Downloads wait in the same queue as `preload`'s, so they don't hold up the images on screen.
- The file belongs to the cache, which can remove it at any time: copy it to keep it.
- Its name may not have an image extension (on Android it ends in `.0` or `.1`): copy it with one for APIs that need it.
- A `file://` source is its own path. Other local images (`require()` in a release build, `content://`) have no file to give.
- With `cache: 'web'`, Android only keeps the file if the server allows caching it (in an HTTP cache), and returns `ok: false` otherwise. If the server compressed the image with `Content-Encoding` (rare for images), that file is compressed.

There's no way to remove a single image from the cache. To load an image again after it changed on the server, change its [`cacheKey`](#sourcecachekey).

### `writeToCache(source, file)`

**Parameters:** `source: Source`, `file: string` · **Returns:** `Promise<CachePathResult>`

Stores a local image file as the source's image in the disk cache, so views and preloads of the source show it without downloading it. For example, after a user uploads a new avatar, store the photo they picked under the avatar's new url or [`cacheKey`](#sourcecachekey), and it shows at once. `file` is a `file://` uri or a path (or on Android a `content://` uri, as image pickers often return). A source with a `cacheKey` doesn't need a `uri`, so the image can be stored before its url is known. Resolves with `{ ok: true, path }` (the cached file) or `{ ok: false, error }`. Never rejects.

```js
const result = await FastImage.writeToCache(
    {
        uri: user.avatarUrl,
        cacheKey: `avatar-${user.id}-${user.avatarUpdatedAt}`,
    },
    pickedPhoto.uri,
)
```

- The file must be an image.
- It doesn't replace an image that's already cached under the source's key: give a new image a new `cacheKey` (Glide can't replace one on Android).
- Not for `cache: 'web'` sources, which are kept in an HTTP cache.
- Like any cached image, it can be removed from the cache later, and then it's downloaded from the source's url.

### `configureCache(limits)`

**Parameters:** `limits?: CacheLimits` · **Returns:** `Promise<CacheState>`

How much the image cache keeps. Set the limits your app starts with in its native config, so they're in effect from the first image, and change them while the app runs with `configureCache`, e.g. from a storage setting. Runtime changes are saved, and used on the next launches too.

| Limit                                                                                                             | iOS                                                                                        | Android                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `maxDiskSize`: the most bytes of images kept on disk. When it's over, the least recently used images are removed. | Changes apply at once (the cache is trimmed to half the limit). Default: no limit.         | Changes apply from the next launch (Glide's disk cache size is set when it starts). Default: 250 MB. |
| `maxDiskAge`: seconds an image is kept on disk after it was last used.                                            | Default: 1 week (counted from when it was stored before SDWebImage 5.21, unless it's set). | No age limit.                                                                                        |
| `maxMemorySize`: the most bytes of decoded images kept in memory.                                                 | Default: no limit (they're removed when the system is low on memory).                      | Sized from the screen by Glide.                                                                      |

`0` means no limit.

**Starting limits.** With Expo, in `app.json`:

```json
"plugins": [["react-native-fast-image", { "maxDiskSize": 209715200, "maxDiskAge": 2592000 }]]
```

Without Expo, in `ios/<App>/Info.plist`:

```xml
<key>FastImageMaxDiskSize</key>
<integer>209715200</integer>
<key>FastImageMaxDiskAge</key>
<integer>2592000</integer>
```

and in `android/app/src/main/AndroidManifest.xml`, inside `<application>`:

```xml
<meta-data android:name="fastimage.MAX_DISK_SIZE" android:value="209715200" />
```

**Changing them at runtime.** Pass the limits to change; `null` goes back to the native config's (or the default). It resolves with the limits in effect and `diskSize`, the bytes the image disk cache uses now. Call it without limits to see them.

```js
await FastImage.configureCache({ maxDiskSize: 500 * 1024 * 1024 })
const { maxDiskSize, diskSize } = await FastImage.configureCache()
```

On Android, if your app has its own `AppGlideModule` (see [using FastImage with an AppGlideModule](docs/android-build-settings.md#if-your-app-has-its-own-appglidemodule)), set the disk cache size there instead: `maxDiskSize` isn't applied or reported.

Images with `cache: 'web'` are kept in their own HTTP cache instead, up to 50 MB on each platform, which these limits don't change.

## Types

<!-- api:types start (generated from src/ by website/scripts/generate.mts) -->

### `Cache`

**Type:** `'immutable' | 'web' | 'cacheOnly'`

How fresh an image must be: see [`source.cache`](#sourcecache).

---

### `CacheLimits`

`configureCache`'s changes: a number (0 for no limit), or `null` to go back to the app's native config (Info.plist, AndroidManifest.xml) or the platform's default. Leave one out to keep it. Changes are saved, and used on the next launches too. Android only has `maxDiskSize`.

- `maxDiskSize?` (`number | null`): The most bytes of images kept on disk. When it's over, the least recently used are removed (on iOS, until it's half this size). Default: no limit on iOS, 250 MB on Android.
- `maxDiskAge?` (`number | null`): iOS: the seconds an image is kept on disk after it was last used, or 0 to keep them until `maxDiskSize` removes them. Default: 1 week.
- `maxMemorySize?` (`number | null`): iOS: the most bytes of decoded images kept in memory. Default: no limit (they're removed when the system is low on memory).

---

### `CachePathResult`

**Type:** `{ ok: true; path: string } | { ok: false; error: string }`

`getCachePath`'s and `writeToCache`'s result: `ok` with the file's path, or not `ok` with the error.

---

### `CacheState`

`configureCache`'s result: the limits in effect (0 for no limit), and the bytes the disk cache uses now. Android only has `maxDiskSize` and `diskSize`, and neither if the app has its own `AppGlideModule`.

- `maxDiskSize?` (`number`)
- `maxDiskAge?` (`number`)
- `maxMemorySize?` (`number`)
- `diskSize?` (`number`): The bytes the disk cache uses now.

---

### `LoadResult`

**Type:** `{ ok: true; width: number; height: number } | { ok: false; error: string }`

A load's result, as `onLoadEnd` gets it: `ok` with the image's size, or not `ok` with the error (as `onLoad` and `onError` get them).

---

### `OnErrorEvent`

`onError`'s event: `nativeEvent.error` says what went wrong, e.g. an HTTP status code or an image that can't be decoded.

- `nativeEvent` (`{ error: string }`)

---

### `OnLoadEvent`

`onLoad`'s event: `nativeEvent` has the image's `width` and `height`, in pixels, and `target`, the view's React tag (missing on Android with the legacy architecture).

- `nativeEvent` (`{ width: number; height: number; target?: number }`)

---

### `OnProgressEvent`

`onProgress`'s event: `nativeEvent` has the bytes `loaded` and the `total`, and `progress`, `loaded / total` from 0 to 1.

- `nativeEvent` (`{ loaded: number; total: number; progress: number }`)

---

### `PreloadFailure`

A preloaded source that failed to load.

- `uri?` (`string`): The source's uri (none for a source without one, e.g. `null`).
- `ok` (`false`)
- `error` (`string`): What went wrong.

---

### `PreloadResult`

**Type:** `PreloadSuccess | PreloadFailure`

`preload`'s result for a source. Check `ok` to tell which it is: e.g. `if (result.ok)` narrows it to a `PreloadSuccess`, with its size. Reading `width` or `error` without checking is a type error.

---

### `PreloadSuccess`

A preloaded source that loaded (and is now cached).

- `uri` (`string`): The source's uri.
- `ok` (`true`)
- `width` (`number`): The image's width (as in `onLoad`).
- `height` (`number`): The image's height (as in `onLoad`).

---

### `Priority`

**Type:** `'low' | 'normal' | 'high'`

An image's load priority: see [`source.priority`](#sourcepriority).

---

### `ResizeMode`

**Type:** `'contain' | 'cover' | 'stretch' | 'center' | 'repeat'`

How the image fits the view: see [`resizeMode`](#resizemode).

---

### `Transition`

How the image fades in: see [`transition`](#transition).

- `duration?` (`number`): How long the fade takes, in milliseconds; 0 means no fade. Defaults to the platform's usual length: 300 ms on Android, 250 ms on iOS.
- `betweenImages?` (`boolean`, default `false`): Also fades between images: a new `source` replacing an image that's showing cross-dissolves from it. Otherwise only an image that appears over nothing (or over `defaultSource`) fades in, and a new source replaces the image showing at once, once it has loaded.
- `skipOnCacheHit?` (`'none' | 'memory' | 'all' | null`, default `'memory'`): Skips the fade for an image from a cache, so images already loaded show at once, e.g. in a list scrolled back up or a reused row.

    - `'memory'`: skips it for images from the memory cache.
    - `'all'`: skips it for images from the memory or disk cache too, so images that download fade in, and local files and bundled images usually only the first time (the disk cache usually keeps them too).
    - `'none'`: always fades.

    Downloads, local files and bundled images (`require()`) fade in.

<!-- api:types end -->

## Photo library images (iOS)

A photo library url (`ph://<localIdentifier>`, as camera roll libraries give) loads when the app has SDWebImagePhotosPlugin. Add it to the app's `ios/Podfile` and run `pod install`:

```ruby
pod 'SDWebImagePhotosPlugin'
```

With Expo, add it with [expo-build-properties](https://docs.expo.dev/versions/latest/sdk/build-properties/):

```json
[
    "expo-build-properties",
    { "ios": { "extraPods": [{ "name": "SDWebImagePhotosPlugin" }] } }
]
```

The app needs access to the photo library, which it has if it got the url from there. A photo library image is decoded at about the view's size, since photos are large and usually shown small; `onLoad` still reports the photo's own size. `FastImage.preload` of a `ph://` source loads the full-size photo (there's no view to size it for), which doesn't make a view's smaller copy load faster, so preloading photo library images usually isn't worth it. Without the plugin, a `ph://` source fails with `onError`, saying so. `assets-library://` urls aren't supported. On Android, photo pickers give `content://` urls, which load as they are.

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

## Web

FastImage works on the web with [react-native-web](https://necolas.github.io/react-native-web/). Bundlers pick the web version through the package's `browser` field, or the `.web.js` files next to the native ones.

Support is minimal:

- Props that work: `source` (a `uri`, a `require()`d image, or several sizes), `defaultSource`, `resizeMode`, `tintColor`, `blurRadius`, `style`, children, `onLoadStart`, `onLoad`, `onError`, `onLoadEnd`, and View props such as `testID`, accessibility props, `onLayout` and `pointerEvents`.
- Ignored: `source.headers` (a browser can't send them for an image), `source.priority`, `source.cache`, `source.cacheKey`, `source.memoryCache`, `recyclingKey`, `loop`, `imageRendering`, `paused`, `transition`, `downsample`, `fallback` and `onProgress`.
- Several sizes are shown with a lazily loaded `<img>` whose `srcset` lists them, with `sizes="auto, 100vw"`: the browser loads the one for the width the image is shown at, in device pixels (usually the smallest that's at least as wide). Browsers that don't support `sizes="auto"` use the viewport's width. `tintColor`, `defaultSource` and `resizeMode="repeat"` don't apply to them.
- `FastImage.preload` loads the images into the browser's cache and resolves with a result per source. `clearMemoryCache`, `clearDiskCache` and `configureCache` resolve without doing anything (the browser manages its cache), and `getCachePath` and `writeToCache` resolve with `{ ok: false, error: 'Not supported on the web' }`.

## Troubleshooting

If you have any problems using this library try the steps in [troubleshooting](docs/troubleshooting.md) and see if they fix it.

## Development

[Follow these instructions to get the example app running.](docs/development.md)

## Credits

The idea for this modules came from
[vovkasm's](https://github.com/vovkasm)
[react-native-web-image](https://github.com/vovkasm/react-native-web-image)
package.
It also uses Glide and SDWebImage, but didn't have some features I needed (priority, headers).

Thanks to [@mobinni](https://github.com/mobinni) for helping with the conceptualization

## Licenses

- React Native Fast Image - MIT © [Dylan Vann](https://github.com/DylanVann). See the [LICENSE](LICENSE) file.
- [SDWebImage](https://github.com/SDWebImage/SDWebImage) (iOS) - MIT. See its [LICENSE](https://github.com/SDWebImage/SDWebImage/blob/master/LICENSE) file.
- [Glide](https://github.com/bumptech/glide) (Android) - BSD, part MIT and Apache 2.0. See its [LICENSE](https://github.com/bumptech/glide/blob/master/LICENSE) file.

[build-badge]: https://github.com/DylanVann/react-native-fast-image/actions/workflows/ci.yml/badge.svg
[build]: https://github.com/DylanVann/react-native-fast-image/actions/workflows/ci.yml
[downloads-badge]: https://img.shields.io/npm/dm/react-native-fast-image.svg
[npmtrends]: http://www.npmtrends.com/react-native-fast-image
[package]: https://www.npmjs.com/package/react-native-fast-image
[version-badge]: https://img.shields.io/npm/v/react-native-fast-image.svg
