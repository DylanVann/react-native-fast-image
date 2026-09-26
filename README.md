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

## Are you using Proguard?

If you use Proguard you will need to add these lines to `android/app/proguard-rules.pro`:

```
-keep public class com.dylanvann.fastimage.* {*;}
-keep public class com.dylanvann.fastimage.** {*;}
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep public class * extends com.bumptech.glide.module.AppGlideModule
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
  **[] $VALUES;
  public *;
}
```

## Properties

### `source?: object`

Source for the remote image to load.

When `source` changes, the image that's showing stays until the new one has loaded, as with `<img>` in browsers and React Native's `Image` on iOS. In views that get reused for other content, such as rows in FlashList or recyclerlistview, set `recyclingKey` so a reused row doesn't show the previous row's image.

---

### `source.uri?: string`

Remote url to load the image from. e.g. `'https://facebook.github.io/react/img/logo_og.png'`.

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

- `FastImage.cacheControl.immutable` - **(Default)** - Only updates if url changes.
- `FastImage.cacheControl.web` - Use headers and follow normal caching procedures. On Android these responses are kept in a 50 MB HTTP cache (or the app's own, if its OkHttp client has one).
- `FastImage.cacheControl.cacheOnly` - Only show images from cache, do not make any network requests.

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

### `downsample?: boolean`

iOS only. Decodes the image at about the size it's shown at (the view's size in pixels, enough to cover it for `cover` and `stretch`) instead of at full size, for images at least twice that size. It's for memory: a large image in a small view then takes much less of it, e.g. a 12 megapixel photo in a 150 × 150 view takes about 1 MB instead of tens of megabytes, and a very large image can be shown without running out of memory. It isn't faster: newer iPhones decode JPEG and HEIC at full size in hardware, while decoding smaller is done in software, so it can take a little longer (about 27 ms instead of 21 ms for a 12 megapixel JPEG in a 48 × 48 view on an iPhone 15 Pro Max). An image less than twice the size the view needs is decoded at full size, since decoding it a little smaller would take longer and more memory while decoding.

Where you control the images, serving them at the size they're shown (resized on the server or by an image CDN, and cached there) is better: it also saves bandwidth and decoding time. This prop is for images you can't get in the right size.

- The downloaded file is still cached on disk at full size. A larger view of the same image (e.g. a detail screen) decodes it again from there at its own size, without downloading it again.
- The image loads once the view has its size, which comes in the same update, so it doesn't wait for another frame. A view without a size (e.g. one sized from `onLoad`) loads the image at full size.
- If the view grows by more than a fifth, the image is decoded again for the new size, keeping the current one until then, without sending the load events again.
- `onLoad` still reports the image's full size.
- Not for `resizeMode="repeat"`, which tiles the image at its own size.
- Needs SDWebImage 5.19.7 or later (`pod update SDWebImage`). Before 5.19 images are decoded at full size; 5.19.7 fixed the orientation of some JPEGs decoded smaller.

On Android images are already decoded at about the view's size (by Glide).

---

### `onLoadStart?: () => void`

Called when the image starts to load.

---

### `onProgress?: (event) => void`

Called when the image is loading.

e.g. `onProgress={e => console.log(e.nativeEvent.loaded / e.nativeEvent.total)}`

---

### `onLoad?: (event) => void`

Called on a successful image fetch. Called with the width and height of the image itself, not of the view (on iOS, in points: an `@2x` asset reports half its pixel size).

e.g. `onLoad={e => console.log(e.nativeEvent.width, e.nativeEvent.height)}`

---

### `onError?: (event) => void`

Called on an image fetching error, with a message describing it (e.g. the HTTP status code).

e.g. `onError={e => console.log(e.nativeEvent.error)}`

---

### `onLoadEnd?: () => void`

Called when the image finishes loading, whether it was successful or an error.

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

### `FastImage.clearMemoryCache: () => Promise<void>`

Clear all images from memory cache.

### `FastImage.clearDiskCache: () => Promise<void>`

Clear all images from disk cache.

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
