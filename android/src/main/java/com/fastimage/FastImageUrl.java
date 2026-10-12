package com.fastimage;

import androidx.annotation.NonNull;

import com.bumptech.glide.load.model.GlideUrl;

// What FastImage loads a remote image with: its GlideUrl (url, headers, and
// cache key: the disk cache key stays the GlideUrl's), loaded by FastImage's
// own loader (FastImageOkHttpProgressGlideModule). Not a GlideUrl itself: the
// app's Glide may have other GlideUrl loaders (Glide's, another library's,
// e.g. expo-image's), which Glide would also try after a failed load, and
// FastImage leaves them as they are for the app's other loads.
final class FastImageUrl {
    final GlideUrl url;

    FastImageUrl(@NonNull GlideUrl url) {
        this.url = url;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof FastImageUrl && url.equals(((FastImageUrl) other).url);
    }

    @Override
    public int hashCode() {
        return url.hashCode();
    }

    // The GlideUrl's (its cache key), which FastImageSourceSize keys sizes by.
    @NonNull
    @Override
    public String toString() {
        return url.toString();
    }
}
