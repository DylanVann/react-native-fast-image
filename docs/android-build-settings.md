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

| Property                | Default    | Notes                                                                                                                                                                               |
| ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compileSdkVersion`     | `28`       | Set by React Native's template, so FastImage builds with your app's versions.                                                                                                       |
| `targetSdkVersion`      | `28`       |                                                                                                                                                                                     |
| `minSdkVersion`         | `16`       |                                                                                                                                                                                     |
| `buildToolsVersion`     | `"28.0.3"` |                                                                                                                                                                                     |
| `glideVersion`          | `"4.16.0"` | The version of Glide (and its OkHttp integration) that FastImage uses. If your app uses Glide too, set it to your app's version. See [older Glide versions](#older-glide-versions). |
| `excludeAppGlideModule` | `false`    | Leaves out FastImage's `AppGlideModule`, for an app that has its own (below). `true` by default when the app has [expo-image](#with-expo-image).                                    |

## Older Glide versions

With a `glideVersion` before 4.15, animated WebP and AVIF images show their first frame: 4.15 added Glide's decoder for them, which uses Android's `ImageDecoder`. FastImage's default was 4.12.0 before it was raised to 4.16.0.

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

expo-image has an `AppGlideModule` too, so when the app has expo-image, FastImage leaves its own out, as `excludeAppGlideModule = true` does. It looks for expo-image in the `node_modules` folders above the app's `android` folder, as Node does: in a monorepo where only another app has it, set `excludeAppGlideModule = false` to keep FastImage's. Images load with expo-image's Glide setup, including its disk cache, and FastImage adds its components to it. FastImage's decoders (animated WebP and AVIF, APNG, SVG) only take FastImage's images, so expo-image's images keep expo-image's. As with an app's own module, `maxDiskSize` isn't applied or reported on Android.
