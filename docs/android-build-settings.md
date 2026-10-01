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

| Property                | Default    | Notes                                                                                                                            |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `compileSdkVersion`     | `28`       | Set by React Native's template, so FastImage builds with your app's versions.                                                    |
| `targetSdkVersion`      | `28`       |                                                                                                                                  |
| `minSdkVersion`         | `16`       |                                                                                                                                  |
| `buildToolsVersion`     | `"28.0.3"` |                                                                                                                                  |
| `glideVersion`          | `"4.12.0"` | The version of Glide (and its OkHttp integration) that FastImage uses. If your app uses Glide too, set it to your app's version. |
| `excludeAppGlideModule` | `false`    | Leaves out FastImage's `AppGlideModule`, for an app that has its own (below).                                                    |

## If your app has its own AppGlideModule

An app has one Glide `AppGlideModule`. FastImage has one (`FastImageGlideModule`), so if your app has its own, leave FastImage's out with `excludeAppGlideModule = true` (above).

Your module needs `@GlideModule` and Glide's annotation processor in your app (`annotationProcessor "com.github.bumptech.glide:compiler:<version>"` in `android/app/build.gradle`), as Glide requires for any `AppGlideModule` (see [Glide's docs](https://bumptech.github.io/glide/doc/generatedapi.html)). The annotation processor also registers FastImage's other Glide module: without it, images load, but `onProgress`, `cache: 'web'`, `writeToCache`, SVG images and cookies don't work.

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
