# Removing MyAppGlideModule from react-native-fast-image

If you are using Glide within your application using an `AppGlideModule` then you will
need to prevent the inclusion of the `AppGlideModule` in this package.

To accomplish this you can add to `android/build.gradle`:

```gradle
project.ext {
    excludeAppGlideModule = true
}
```

Your `AppGlideModule` then sets Glide's cache sizes too: FastImage's `maxDiskSize` (from the manifest, the Expo plugin or `FastImage.configureCache`) isn't applied on Android, since FastImage applies it in its own module. Set the disk cache size in your module's `applyOptions`, as described in [Glide's configuration docs](https://bumptech.github.io/glide/doc/configuration.html):

```java
@Override
public void applyOptions(@NonNull Context context, @NonNull GlideBuilder builder) {
    builder.setDiskCache(new InternalCacheDiskCacheFactory(context, 200 * 1024 * 1024));
}
```
