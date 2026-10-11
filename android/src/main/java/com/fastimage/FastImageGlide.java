package com.fastimage;

import android.content.Context;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Registry;
import com.bumptech.glide.load.Option;
import com.bumptech.glide.load.Options;

// FastImage's use of Glide, which the app may share with other libraries.
final class FastImageGlide {
    private FastImageGlide() {}

    // Set on FastImage's requests, so its decoders (animated WebP and AVIF,
    // APNG, SVG) only take its own images: another library's images (e.g.
    // expo-image's) keep that library's decoders.
    static final Option<Boolean> REQUEST = Option.memory("com.fastimage.Request", false);

    static boolean isRequest(@NonNull Options options) {
        return Boolean.TRUE.equals(options.get(REQUEST));
    }

    // The Glide instance FastImage's components (FastImageOkHttpProgressGlideModule)
    // were registered with.
    private static volatile Glide registered;

    // Whether Glide started with FastImage's AppGlideModule (as the app's).
    private static volatile boolean appModule;

    static void appModuleStarted() {
        appModule = true;
    }

    static void registered(@NonNull Glide glide) {
        registered = glide;
    }

    // Whether Glide has started with FastImage's AppGlideModule or has
    // FastImage's components: until then, none of FastImage's images are in
    // its memory cache.
    static boolean used() {
        return appModule || registered != null;
    }

    // Glide, with FastImage's components. Glide registers them if the app's
    // generated Glide module lists FastImage's module, as FastImage's
    // AppGlideModule's does. Another library's (e.g. expo-image's, which ships
    // one) only lists the modules it was built with, so then they're
    // registered here, before FastImage's first request.
    @NonNull
    static Glide get(@NonNull Context context) {
        Glide glide = Glide.get(context);
        // Glide registers them itself, when its registry is first used (in
        // the background, by the first load: Glide 4.15+ builds it lazily).
        if (appModule) return glide;
        // Builds the registry, which registers them if the app's module lists
        // FastImage's.
        Registry registry = glide.getRegistry();
        if (registered != glide) {
            synchronized (FastImageGlide.class) {
                if (registered != glide) {
                    new FastImageOkHttpProgressGlideModule()
                            .register(context.getApplicationContext(), glide, registry, false);
                }
            }
        }
        return glide;
    }

    // Glide, with FastImage's components registered now, for callers in the
    // background that use them directly rather than through a load (the HTTP
    // cache of `cache: 'web'` images, which registering them sets up): with
    // FastImage's AppGlideModule, Glide registers them only when its registry
    // is first used, e.g. by FastImage's first load.
    @NonNull
    static Glide getRegistered(@NonNull Context context) {
        Glide glide = get(context);
        glide.getRegistry();
        return glide;
    }
}
