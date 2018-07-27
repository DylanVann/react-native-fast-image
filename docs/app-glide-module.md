# Removing MyAppGlideModule from react-native-fast-image

If you are using Glide within your application using an `AppGlideModule` then you will
need to prevent the inclusion of the `AppGlideModule` in this package.

To accomplish this you can add to `android/build.gradle`:

```gradle
project.ext {
    excludeAppGlideModule = true
}
```