package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.drawable.Drawable;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Registry;

// Built instead of src/glide-4.15's FastImageAnimated with a Glide before
// 4.15 (build.gradle), which has no decoder for animated WebP or AVIF: they
// show their first frame, so there's nothing to register, remember or copy.
final class FastImageAnimated {
    private FastImageAnimated() {}

    interface CopyCallback {
        void onCopy(@Nullable Drawable copy);
    }

    static void register(@NonNull Context context, @NonNull Glide glide, @NonNull Registry registry) {}

    @Nullable
    static Integer repeatCount(@NonNull Drawable drawable) {
        return null;
    }

    static boolean shownElsewhere(@NonNull Drawable drawable, @NonNull Drawable.Callback view) {
        return false;
    }

    static void copy(@NonNull Drawable drawable, @NonNull CopyCallback callback) {
        callback.onCopy(null);
    }
}
