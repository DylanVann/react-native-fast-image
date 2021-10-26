<h1 align="center">
  🚩 FastImage
</h1>

<div align="center">

Performant React Native image component.

[![Version][version-badge]][package]
[![Downloads][downloads-badge]][npmtrends]
[![Build Status][build-badge]][build]
[![Code Coverage][coverage-badge]][coverage]

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

-   Flickering.
-   Cache misses.
-   Low performance loading from cache.
-   Low performance in general.

`FastImage` is an `Image` replacement that solves these issues.
`FastImage` is a wrapper around
[SDWebImage (iOS)](https://github.com/rs/SDWebImage)
and
[Glide (Android)](https://github.com/bumptech/glide).

## Features

-   [x] Aggressively cache images.
-   [x] Add authorization headers.
-   [x] Prioritize images.
-   [x] Preload images.
-   [x] GIF support.
-   [x] Border radius.

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

-   [Are you using Glide already using an AppGlideModule?](docs/app-glide-module.md) (you might have problems if you don't read this)

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

---

### `source.uri?: string`

Remote url to load the image from. e.g. `'https://facebook.github.io/react/img/logo_og.png'`.

---

### `source.headers?: object`

Headers to load the image with. e.g. `{ Authorization: 'someAuthToken' }`.

---

### `source.priority?: enum`

-   `FastImage.priority.low` - Low Priority.
-   `FastImage.priority.normal` **(Default)** - Normal Priority.
-   `FastImage.priority.high` - High Priority.

---

### `source.cache?: enum`

-   `FastImage.cacheControl.immutable` - **(Default)** - Only updates if url changes.
-   `FastImage.cacheControl.web` - Use headers and follow normal caching procedures.
-   `FastImage.cacheControl.cacheOnly` - Only show images from cache, do not make any network requests.

---

### `resizeMode?: enum`

-   `FastImage.resizeMode.contain` - Scale the image uniformly (maintain the image's aspect ratio) so that both dimensions (width and height) of the image will be equal to or less than the corresponding dimension of the view (minus padding).
-   `FastImage.resizeMode.cover` **(Default)** - Scale the image uniformly (maintain the image's aspect ratio) so that both dimensions (width and height) of the image will be equal to or larger than the corresponding dimension of the view (minus padding).
-   `FastImage.resizeMode.stretch` - Scale width and height independently, This may change the aspect ratio of the src.
-   `FastImage.resizeMode.center` - Do not scale the image, keep centered.

---

### `onLoadStart?: () => void`

Called when the image starts to load.

---

### `onProgress?: (event) => void`

Called when the image is loading.

e.g. `onProgress={e => console.log(e.nativeEvent.loaded / e.nativeEvent.total)}`

---

### `onLoad?: (event) => void`

Called on a successful image fetch. Called with the width and height of the loaded image.

e.g. `onLoad={e => console.log(e.nativeEvent.width, e.nativeEvent.height)}`

---

### `onError?: () => void`

Called on an image fetching error.

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

### `FastImage.preload: (source[]) => void`

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

-   FastImage - MIT © [DylanVann](https://github.com/DylanVann)
-   SDWebImage - `MIT`
-   Glide - BSD, part MIT and Apache 2.0. See the [LICENSE](https://github.com/bumptech/glide/blob/master/license) file for details.

[build-badge]: https://github.com/dylanvann/react-native-fast-image/workflows/CI/badge.svg
[build]: https://github.com/DylanVann/react-native-fast-image/actions?query=workflow%3ACI
[coverage-badge]: https://img.shields.io/codecov/c/github/dylanvann/react-native-fast-image.svg
[coverage]: https://codecov.io/github/dylanvann/react-native-fast-image
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
