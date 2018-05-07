# FastImage

🚩 FastImage, performant React Native image component.

[![npm](https://img.shields.io/npm/v/react-native-fast-image.svg?style=flat-square)](https://www.npmjs.com/package/react-native-fast-image)
[![npm](https://img.shields.io/npm/dm/react-native-fast-image.svg?style=flat-square)](https://npmjs.com/package/react-native-fast-image)
[![CircleCI](https://img.shields.io/circleci/project/github/DylanVann/react-native-fast-image.svg?style=flat-square)](https://circleci.com/gh/DylanVann/react-native-fast-image)
[![license](https://img.shields.io/github/license/DylanVann/react-native-fast-image.svg?style=flat-square)](https://github.com/DylanVann/react-native-fast-image/blob/master/LICENSE)

<p align="center" >
  <kbd>
    <img src="docs/assets/scroll.gif" title="Scroll Demo" float="left">
  </kbd>
  <kbd>
    <img src="docs/assets/priority.gif" title="Priority Demo" float="left">
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

```bash
# Install
yarn add react-native-fast-image

# Automatic linking. (other linking methods listed below)
react-native link
```

```jsx
import FastImage from 'react-native-fast-image'

const YourImage = () =>
  <FastImage
    style={styles.image}
    source={{
      uri: 'https://unsplash.it/400/400?image=1',
      headers:{ Authorization: 'someAuthToken' },
      priority: FastImage.priority.normal,
    }}
    resizeMode={FastImage.resizeMode.contain}
  />
```

## Other Linking Methods

- [Manual](docs/installation-manual.md) (might be needed if something went wrong with `react-native link`)
- [CocoaPods (iOS)](docs/installation-cocoapods.md) (you may wish to use this if you are already using CocoaPods)

## Proguard

If you use Proguard you will need to add these lines to `android/app/proguard-rules.pro`:

```
-keep public class com.dylanvann.fastimage.* {*;}
-keep public class com.dylanvann.fastimage.** {*;}
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

- `FastImage.priority.low` - Low Priority
- `FastImage.priority.normal` **(Default)** - Normal Priority
- `FastImage.priority.high` - High Priority

---

### `resizeMode?: enum`

- `FastImage.resizeMode.contain` - Scale the image uniformly (maintain the image's aspect ratio) so that both dimensions (width and height) of the image will be equal to or less than the corresponding dimension of the view (minus padding).
- `FastImage.resizeMode.cover` **(Default)** - Scale the image uniformly (maintain the image's aspect ratio) so that both dimensions (width and height) of the image will be equal to or larger than the corresponding dimension of the view (minus padding).
- `FastImage.resizeMode.stretch` - Scale width and height independently, This may change the aspect ratio of the src.
- `FastImage.resizeMode.center` - Do not scale the image, keep centered.

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

## Licenses

* FastImage [MIT]
* SDWebImage (included) [MIT]
* Glide (included via gradle) [Apache 2.0 License]
