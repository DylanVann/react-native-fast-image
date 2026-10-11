# Android build settings

FastImage reads these from the `ext` block of your app's root `android/build.gradle`, where React Native's template already sets the SDK versions:

```groovy
buildscript {
    ext {
        // React Native's settings (minSdkVersion, compileSdkVersion, …), then
        // FastImage's, if you need them:
        glideVersion = "<your app's Glide version>"
        excludeAppGlideModule = true
    }
}
```

| Property                | Default   | Notes                                                                                                                                                                                                              |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `compileSdkVersion`     | `36`      | Set by React Native's template, so FastImage builds with your app's versions.                                                                                                                                      |
| `targetSdkVersion`      | `36`      |                                                                                                                                                                                                                    |
| `minSdkVersion`         | `24`      |                                                                                                                                                                                                                    |
| `glideVersion`          | `"5.0.7"` | The version of Glide (and its OkHttp integration) that FastImage uses. If your app uses Glide too, set it to your app's version. FastImage needs 4.15 or later. Glide 5.0.9 and later need `compileSdkVersion` 37. |
| `excludeAppGlideModule` | `false`   | Leaves out FastImage's `AppGlideModule`, for an app that has its own (below). `true` by default when the app has [expo-image](#with-expo-image).                                                                   |

## If your app has its own AppGlideModule

An app has one Glide `AppGlideModule`. FastImage has one (`FastImageGlideModule`), so if your app has its own, leave FastImage's out with `excludeAppGlideModule = true` (above). FastImage then adds its Glide components (for `onProgress`, `cache: 'web'`, `writeToCache`, SVG images and cookies) to your app's Glide setup itself, when it first loads an image.

Your module needs `@GlideModule` and Glide's annotation processor in your app (`annotationProcessor "com.github.bumptech.glide:compiler:<version>"` in `android/app/build.gradle`), as Glide requires for any `AppGlideModule` (see [Glide's docs](https://bumptech.github.io/glide/doc/generatedapi.html)).

FastImage sets Glide's disk cache size in its module, so with your own module, `maxDiskSize` (from the manifest, the Expo plugin or `FastImage.configureCache`) isn't applied or reported. Set the disk cache size in your module's `applyOptions`, as described in [Glide's configuration docs](https://bumptech.github.io/glide/doc/configuration.html):

```java
@GlideModule
public final class MyAppGlideModule extends AppGlideModule {
    @Override
    public void applyOptions(@NonNull Context context, @NonNull GlideBuilder builder) {
        builder.setDiskCache(new InternalCacheDiskCacheFactory(context, 200 * 1024 * 1024));
    }
}
```

FastImage's Expo config plugin doesn't set `excludeAppGlideModule`: an Expo app with its own `AppGlideModule` adds it with the config plugin that adds its module.

### With expo-image

expo-image has an `AppGlideModule` too, so when the app has expo-image, FastImage leaves its own out, as `excludeAppGlideModule = true` does. It looks for expo-image in the `node_modules` folders above the app's `android` folder, as Node does: in a monorepo where only another app has it, set `excludeAppGlideModule = false` to keep FastImage's. Images load with expo-image's Glide setup, including its disk cache, and FastImage adds its components to it. FastImage's network setup (its OkHttp client, with the app's cookies, and the HTTP cache of `cache: 'web'` images) and its decoders (animated WebP and AVIF, APNG, SVG) only apply to FastImage's images, so expo-image's images and prefetches keep expo-image's. As with an app's own module, `maxDiskSize` isn't applied or reported on Android.
