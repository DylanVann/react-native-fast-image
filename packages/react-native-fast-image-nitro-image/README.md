# react-native-fast-image-nitro-image

Shows [Nitro Images](https://github.com/mrousavy/react-native-nitro-image) (react-native-nitro-image's `Image`, which [VisionCamera](https://github.com/mrousavy/react-native-vision-camera)'s photos and snapshots also give) in [FastImage](https://github.com/DylanVann/react-native-fast-image).

Install it next to FastImage, then pass an `Image` as FastImage's `source`:

```sh
npm install react-native-fast-image-nitro-image react-native-nitro-image react-native-nitro-modules
cd ios && pod install
```

```jsx
<FastImage
    style={{ width: 200, height: 200 }}
    source={image}
    objectFit="cover"
/>
```

FastImage finds this package itself; there's nothing to import. See [Nitro Images and VisionCamera](https://github.com/DylanVann/react-native-fast-image#nitro-images-and-visioncamera) in FastImage's README.
