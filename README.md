<h1 align="center">
  🚩 FastImage
</h1>

<div align="center">

Performant React Native image component.

[![Version][version-badge]][package]
[![Downloads][downloads-badge]][npmtrends]
[![Build Status][build-badge]][build]

[![Watch on GitHub][github-watch-badge]][github-watch]
[![Star on GitHub][github-star-badge]][github-star]
[![Tweet][twitter-badge]][twitter]

</div>

<p align="center" >
  <kbd>
    <img
      src="https://github.com/DylanVann/react-native-fast-image/blob/main/docs/assets/scroll.gif?raw=true"
      title="Scroll Demo"
      float="left"
    >
  </kbd>
  <kbd>
    <img
      src="https://github.com/DylanVann/react-native-fast-image/blob/main/docs/assets/priority.gif?raw=true"
      title="Priority Demo"
      float="left"
    >
  </kbd>
  <br>
  <em>FastImage example app.</em>
</p>

React Native's `Image` component handles image caching like browsers
for the most part.
If the server is returning proper cache control
headers for images you'll generally get the sort of built in
caching behavior you'd have in a browser.
Even so many people have noticed:

- Flickering.
- Cache misses.
- Low performance loading from cache.
- Low performance in general.

`FastImage` is an `Image` replacement that solves these issues.
`FastImage` is a wrapper around
[SDWebImage (iOS)](https://github.com/rs/SDWebImage)
and
[Glide (Android)](https://github.com/bumptech/glide).

## Features

- [x] Aggressively cache images.
- [x] Add authorization headers.
- [x] Prioritize images.
- [x] Preload images.
- [x] GIF support.
- [x] Border radius.

## Usage

**Note: You must be using React Native 0.60.0 or higher to use the most recent version of `react-native-fast-image`.**

```bash
yarn add react-native-fast-image
cd ios && pod install
```

```jsx
import FastImage from 'react-native-fast-image'

const YourImage = () => (
    <FastImage
        style={{ width: 200, height: 200 }}
        source={{
            uri: 'https://unsplash.it/400/400?image=1',
            headers: { Authorization: 'someAuthToken' },
            priority: FastImage.priority.normal,
        }}
        resizeMode={FastImage.resizeMode.contain}
    />
)
```

## Are you using Glide already using an AppGlideModule?

- [Are you using Glide already using an AppGlideModule?](docs/app-glide-module.md) (you might have problems if you don't read this)

## Properties

### `source?: object`

Source for the remote image to load.

When `source` changes, the image that's showing stays until the new one has loaded, as with `<img>` in browsers and React Native's `Image` on iOS. In views that get reused for other content, such as rows in FlashList or recyclerlistview, set `recyclingKey` so a reused row doesn't show the previous row's image.

---

### `source.uri?: string`

Remote url to load the image from. e.g. `'https://facebook.github.io/react/img/logo_og.png'`.

#### Photo library images (iOS)

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

---

### `source.headers?: object`

Headers to load the image with. e.g. `{ Authorization: 'someAuthToken' }`.

---

### `source.priority?: enum`

Indicates the load order priority of an image. Images with `FastImage.priority.high` will load before images in a similar context with low or normal priority.

- `FastImage.priority.low` - Low Priority.
- `FastImage.priority.normal` **(Default)** - Normal Priority.
- `FastImage.priority.high` - High Priority.

---

### `source.cache?: enum`

How fresh the image must be. See [how caching is handled](docs/how-is-caching-handled.md) for how the options fit together.

- `FastImage.cacheControl.immutable` - **(Default)** - Only updates if url changes.
- `FastImage.cacheControl.web` - Use headers and follow normal caching procedures. These responses are kept in their own HTTP cache (50 MB on each platform), which `clearDiskCache` also clears.
- `FastImage.cacheControl.cacheOnly` - Only show images from cache, do not make any network requests.

---

### `source.cacheKey?: string`

The key the image is cached under, instead of its uri. Use it for urls that change while the image stays the same, e.g. signed urls with a token or an expiry. Use something that identifies the image, and change it when the image changes (e.g. include a version or the time it was updated), or the old image keeps showing:

```jsx
<FastImage
    source={{
        uri: signedUrl,
        cacheKey: `avatar-${user.id}-${user.avatarUpdatedAt}`,
    }}
/>
```

Not used with `cache: 'web'`, which follows the HTTP cache (keyed by url).

---

### `source.memoryCache?: boolean`

Whether the decoded image is kept in the memory cache. **Default: true.** With `false` it's only kept on disk: a view doesn't leave it in memory once it stops showing it, and `FastImage.preload` downloads it without decoding it. Use it for large images that are shown once or rarely, like a full-screen photo: a decoded photo can take tens of MB of memory. Images shown again, like a list scrolled back, are decoded from disk again.

---

### Several sizes of an image

`source` can also be an array of the same image at different sizes, each with its `width` and `height` in pixels (times `scale`, if it has one). The view loads the one whose size is closest to its own, in pixels, so a small view downloads a small image:

```jsx
<FastImage
    style={{ width: 120, height: 120 }}
    source={[
        { uri: 'https://example.com/photo-200.jpg', width: 200, height: 200 },
        { uri: 'https://example.com/photo-800.jpg', width: 800, height: 800 },
        {
            uri: 'https://example.com/photo-2000.jpg',
            width: 2000,
            height: 2000,
        },
    ]}
/>
```

- The view picks once it has been laid out. One that has no size (e.g. sized from `onLoad`) loads the largest.
- When the view's size changes so that another size fits better, it loads that one (with its load events), and keeps showing the current image until then, without a `transition`.
- Each size is cached separately. A `cacheKey` applies to its own entry: give each size its own key (or none), or the sizes would replace each other in the cache.
- `FastImage.preload`, `getCachePath` and `writeToCache` take one size: pass the one a view will show. An array fails with `{ ok: false, error }`.
- An array of one is the same as that source.

---

### `defaultSource?: number`

- An asset loaded with `require(...)`.
- Shown while the first image loads, and if an image fails to load. When `source` changes, the previous image shows while the new one loads instead (see `source` and `recyclingKey`).
- Note that like the built-in `Image` implementation, on Android `defaultSource` does not work in debug mode. This is due to the fact that assets are sent from the dev server, but RN's functions only know how to load it from `res`.

---

### `recyclingKey?: string`

For views that get reused for other content, such as rows in FlashList or recyclerlistview. Set it to something that identifies the content, e.g. the item's id. When it changes, the image is cleared right away (to `defaultSource`, or blank) instead of staying until the new one has loaded. Unlike changing `key`, this keeps the view, which is what list recycling is for.

```jsx
<FastImage recyclingKey={item.id} source={{ uri: item.imageUrl }} />
```

---

### `resizeMode?: enum`

- `FastImage.resizeMode.contain` - Scale the image uniformly (maintain the image's aspect ratio) so that both dimensions (width and height) of the image will be equal to or less than the corresponding dimension of the view (minus padding).
- `FastImage.resizeMode.cover` **(Default)** - Scale the image uniformly (maintain the image's aspect ratio) so that both dimensions (width and height) of the image will be equal to or larger than the corresponding dimension of the view (minus padding).
- `FastImage.resizeMode.stretch` - Scale width and height independently, This may change the aspect ratio of the src.
- `FastImage.resizeMode.center` - Do not scale the image, keep centered.
- `FastImage.resizeMode.repeat` - Repeat the image to cover the view, from its top-left corner, at the image's own size in pixels (a bundled image at its size in points), scaled down to fit if it's larger than the view. An animated image repeats its first frame, and `defaultSource` repeats too.

---

### `loop?: boolean | number`

How many times an animated image (GIF, animated WebP) plays:

- Not set **(Default)** - As many times as the file says (like a browser).
- `true` - Loop forever.
- `false` - Play once.
- A number - Play that many times.

Changing it restarts the animation.

---

### `imageRendering?: 'auto' | 'smooth' | 'pixelated'`

How the image is filtered when it's drawn smaller or larger than its size (like CSS's `image-rendering`):

- `'auto'` **(Default)** - The platform's usual filtering.
- `'smooth'` - iOS only. Keeps a large image drawn much smaller than its size (e.g. a big photo as a thumbnail, or fine lines and text) from looking jagged or noisy. **It uses more memory:** the image is also kept at smaller sizes for drawing, about a third more than the decoded image. On Android it's the same as `'auto'` (images are already decoded at about the view's size there).
- `'pixelated'` - Sharp pixels, without smoothing, e.g. for pixel art drawn larger than its size. On Android, animated images are still smoothed.

---

### `paused?: boolean`

Pauses an animated image (GIF, and animated WebP on iOS) on the frame it's showing; `false` plays it again from there. Each image animates on its own, so pausing one doesn't pause others showing the same file.

---

### `transition?: boolean | number | Transition`

Fades the image in when it loads. Off by default. `true` uses the platform's usual fade, a number is the duration in milliseconds, or pass an object:

- `duration`: milliseconds; 0 is no fade. Defaults to the platform's usual length: 300 ms on Android, 250 ms on iOS.
- `betweenImages` (default `false`): also fade between images. By default an image fades in when it appears over nothing (or over `defaultSource`), and a new `source` replaces the image that's showing at once, once it has loaded. With `true`, the new image cross-dissolves from the one showing (for a gallery or an avatar that changes, say).
- `skipOnCacheHit`: which images show at once, without the fade:
    - `'memory'` (default): images from the memory cache, so a list scrolled back up shows images it already loaded at once. Images from the disk cache fade in.
    - `'all'`: images from the memory or disk cache: images that download fade in, and local files and bundled images usually only the first time they load (the disk cache usually keeps them too).
    - `'none'`: every image fades in.

Downloads, local files (`file://`, `content://`) and bundled images (`require()`) fade in. In lists that reuse views (e.g. FlashList), set `recyclingKey`, so a reused view starts empty and its image fades in, instead of showing the previous item's image until it loads.

```jsx
<FastImage source={{ uri }} transition />
<FastImage source={{ uri }} transition={500} />
<FastImage source={{ uri }} transition={{ betweenImages: true, skipOnCacheHit: 'none' }} />
```

---

### `downsample?: boolean`

iOS only. Decodes a large image at about the size it's shown at, instead of at full size, so it takes much less memory.

Use it when you show images much larger than their views and can't get them at the right size, e.g. user uploads or other people's URLs in a list. If you control the images, serve them at the size they're shown instead (resized on your server or by an image CDN), which also saves bandwidth.

Decoding a smaller copy can take a little longer, so use it where the memory matters. Needs SDWebImage 5.19.7 or later. Photo library images are always decoded this way. On Android images are already decoded at about the view's size.

---

### `blurRadius?: number`

Blurs the image by this radius, in points, like React Native's `Image` (the same radius looks about the same on iOS and Android). `0` **(Default)** is no blur.

It's for still images, or a radius that changes now and then (e.g. blurring a photo behind a sheet). Each change blurs the image again on the CPU, so don't animate it.

- Only the loaded image is blurred, not `defaultSource`.
- An animated image (GIF, animated WebP) shows its first frame, blurred, and doesn't animate.
- With `tintColor`, the blurred image is tinted.
- The image is blurred at about the size it's shown at, off the main thread. The cached file stays the original image, so `getCachePath` and other views of it aren't affected.
- Changing it blurs the image that's showing again, without sending the load events again.

To animate a blur, or to blur an animated image, use React Native's `filter` style instead, which the GPU draws: `style={{ filter: [{ blur: 6 }] }}`. It needs the New Architecture. React Native's docs list `blur` for Android 12+ only; on iOS it's behind an experimental React Native feature flag (`enableSwiftUIBasedFilters`, SwiftUI-based filters).

---

### `onLoadStart?: () => void`

Called when the image starts to load.

---

### `onProgress?: (event) => void`

Called while the image downloads, with the bytes `loaded` so far, the `total`, and `progress` (`loaded / total`, from 0 to 1; the last event has 1). Not called while the total is unknown (a response without a `Content-Length`).

e.g. `onProgress={e => console.log(e.nativeEvent.progress)}`

---

### `onLoad?: (event) => void`

Called on a successful image fetch. Called with the width and height of the image itself, not of the view (on iOS, in points: an `@2x` asset reports half its pixel size).

e.g. `onLoad={e => console.log(e.nativeEvent.width, e.nativeEvent.height)}`

---

### `onError?: (event) => void`

Called on an image fetching error, with a message describing it (e.g. the HTTP status code).

e.g. `onError={e => console.log(e.nativeEvent.error)}`

---

### `onLoadEnd?: (result) => void`

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

### `style`

A React Native style. Supports using `borderRadius`.

---

### `fallback: boolean`

If true will fallback to using `Image`.
In this case the image will still be styled and laid out the same way as `FastImage`.

---

### `tintColor?: number | string`

If supplied, changes the color of all the non-transparent pixels to the given color.

## `FastImageBackground`

An image with content on top of it, like React Native's `ImageBackground`: a view that the image fills, with the children on top.

Use it rather than giving `FastImage` children: in the next major version, `FastImage` won't render children, since the image will be a single native view ([#1137](https://github.com/DylanVann/react-native-fast-image/pull/1137)), which can't hold them. `FastImageBackground` works the same in both.

```jsx
import { FastImageBackground } from 'react-native-fast-image'

const Banner = () => (
    <FastImageBackground
        source={{ uri: 'https://unsplash.it/400/200?image=1' }}
        style={{ width: 200, height: 100 }}
        imageStyle={{ borderRadius: 8 }}
    >
        <Text>On top of the image</Text>
    </FastImageBackground>
)
```

- `style`: the view's style (it sizes the view, which the image fills).
- `imageStyle`: the image's style.
- `imageRef`: a ref to the image.
- The other props are `FastImage`'s, for the image.

## Static Methods

### `FastImage.preload: (source[]) => Promise<result[]>`

Preload images to display later. e.g.

```js
FastImage.preload([
    {
        uri: 'https://facebook.github.io/react/img/logo_og.png',
        headers: { Authorization: 'someAuthToken' },
    },
    {
        uri: 'https://facebook.github.io/react/img/logo_og.png',
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

### `FastImage.clearMemoryCache: () => Promise<void>`

Clear all images from memory cache.

### `FastImage.clearDiskCache: () => Promise<void>`

Clear all images from disk cache.

### `FastImage.getCachePath: (source: Source) => Promise<CachePathResult>`

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
    cache: FastImage.cacheControl.cacheOnly,
})
```

- The source's `headers`, `cacheKey` and `priority` apply, as for a view. Downloads wait in the same queue as `preload`'s, so they don't hold up the images on screen.
- The file belongs to the cache, which can remove it at any time: copy it to keep it.
- Its name may not have an image extension (on Android it ends in `.0` or `.1`): copy it with one for APIs that need it.
- A `file://` source is its own path. Other local images (`require()` in a release build, `content://`) have no file to give.
- With `cache: 'web'`, Android only keeps the file if the server allows caching it (in an HTTP cache), and returns `ok: false` otherwise. If the server compressed the image with `Content-Encoding` (rare for images), that file is compressed.

There's no way to remove a single image from the cache. To load an image again after it changed on the server, change its [`cacheKey`](#sourcecachekey-string).

### `FastImage.writeToCache: (source: Source, file: string) => Promise<CachePathResult>`

Stores a local image file as the source's image in the disk cache, so views and preloads of the source show it without downloading it. For example, after a user uploads a new avatar, store the photo they picked under the avatar's new url or [`cacheKey`](#sourcecachekey-string), and it shows at once. `file` is a `file://` uri or a path (or on Android a `content://` uri, as image pickers often return). A source with a `cacheKey` doesn't need a `uri`, so the image can be stored before its url is known. Resolves with `{ ok: true, path }` (the cached file) or `{ ok: false, error }`. Never rejects.

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

### `FastImage.configureCache: (limits?: CacheLimits) => Promise<CacheState>`

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

On Android, if your app has its own `AppGlideModule` (see [Are you using Glide already](docs/app-glide-module.md)), set the disk cache size there instead: `maxDiskSize` isn't applied or reported.

Images with `cache: 'web'` are kept in their own HTTP cache instead, up to 50 MB on each platform, which these limits don't change.

## Web

With [react-native-web](https://necolas.github.io/react-native-web/), FastImage shows images with the web's `Image`. Bundlers pick the web version through the package's `browser` field, or the `.web.js` files next to the native ones.

Support is minimal:

- Props that work: `source` (a `uri`, a `require()`d image, or several sizes, picked once the view has been laid out), `defaultSource`, `resizeMode`, `tintColor`, `blurRadius`, `style`, children, `onLoadStart`, `onLoad`, `onError`, `onLoadEnd`, and View props such as `testID`, accessibility props, `onLayout` and `pointerEvents`.
- Ignored: `source.headers` (a browser can't send them for an image), `source.priority`, `source.cache`, `source.cacheKey`, `source.memoryCache`, `recyclingKey`, `loop`, `imageRendering`, `paused`, `transition`, `downsample`, `fallback` and `onProgress`.
- `FastImage.preload` loads the images into the browser's cache and resolves with a result per source. `clearMemoryCache`, `clearDiskCache` and `configureCache` resolve without doing anything (the browser manages its cache), and `getCachePath` and `writeToCache` resolve with `{ ok: false, error: 'Not supported on the web' }`.

## Troubleshooting

If you have any problems using this library try the steps in [troubleshooting](docs/troubleshooting.md) and see if they fix it.

## Development

[Follow these instructions to get the example app running.](docs/development.md)

## Supported React Native Versions

This project only aims to support the latest version of React Native.\
This simplifies the development and the testing of the project.

If you require new features or bug fixes for older versions you can fork this project.

## Credits

The idea for this modules came from
[vovkasm's](https://github.com/vovkasm)
[react-native-web-image](https://github.com/vovkasm/react-native-web-image)
package.
It also uses Glide and SDWebImage, but didn't have some features I needed (priority, headers).

Thanks to [@mobinni](https://github.com/mobinni) for helping with the conceptualization

## Licenses

- FastImage - MIT © [DylanVann](https://github.com/DylanVann)
- SDWebImage - `MIT`
- Glide - BSD, part MIT and Apache 2.0. See the [LICENSE](https://github.com/bumptech/glide/blob/master/LICENSE) file for details.

[build-badge]: https://github.com/DylanVann/react-native-fast-image/actions/workflows/ci.yml/badge.svg
[build]: https://github.com/DylanVann/react-native-fast-image/actions/workflows/ci.yml
[downloads-badge]: https://img.shields.io/npm/dm/react-native-fast-image.svg
[npmtrends]: http://www.npmtrends.com/react-native-fast-image
[package]: https://www.npmjs.com/package/react-native-fast-image
[version-badge]: https://img.shields.io/npm/v/react-native-fast-image.svg
[twitter]: https://twitter.com/home?status=Check%20out%20react-native-fast-image%20by%20%40atomarranger%20https%3A//github.com/DylanVann/react-native-fast-image
[twitter-badge]: https://img.shields.io/twitter/url/https/github.com/DylanVann/react-native-fast-image.svg?style=social
[github-watch-badge]: https://img.shields.io/github/watchers/dylanvann/react-native-fast-image.svg?style=social
[github-watch]: https://github.com/dylanvann/react-native-fast-image/watchers
[github-star-badge]: https://img.shields.io/github/stars/dylanvann/react-native-fast-image.svg?style=social
[github-star]: https://github.com/dylanvann/react-native-fast-image/stargazers
