package com.dylanvann.fastimage;

import android.content.Context;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Registry;

// Built instead of src/glide-4.15's FastImageAnimated with a Glide before
// 4.15 (build.gradle), which has no decoder for animated WebP or AVIF: they
// show their first frame, so there's nothing to register.
final class FastImageAnimated {
    private FastImageAnimated() {}

    static void register(@NonNull Context context, @NonNull Glide glide, @NonNull Registry registry) {}
}
