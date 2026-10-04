package com.dylanvann.fastimage;

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
    static final Option<Boolean> REQUEST = Option.memory("com.dylanvann.fastimage.Request", false);

    static boolean isRequest(@NonNull Options options) {
        return Boolean.TRUE.equals(options.get(REQUEST));
    }

    // The Glide instance FastImage's components (FastImageOkHttpProgressGlideModule)
    // were registered with.
    private static volatile Glide registered;

    static void registered(@NonNull Glide glide) {
        registered = glide;
    }

    // Glide, with FastImage's components. Glide registers them when it starts
    // if the app's generated Glide module lists FastImage's module, as it
    // does with FastImage's AppGlideModule. Another library's (e.g.
    // expo-image's, which ships one) only lists the modules it was built
    // with, so then they're registered here, before FastImage's first request.
    @NonNull
    static Glide get(@NonNull Context context) {
        Glide glide = Glide.get(context);
        // Glide 4.15+ registers the modules' components when the registry is
        // first used, so this registers them if the app's module lists
        // FastImage's.
        Registry registry = glide.getRegistry();
        if (registered != glide) {
            synchronized (FastImageGlide.class) {
                if (registered != glide) {
                    new FastImageOkHttpProgressGlideModule()
                            .registerComponents(context.getApplicationContext(), glide, registry);
                }
            }
        }
        return glide;
    }
}
