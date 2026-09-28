package com.dylanvann.fastimage;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.Headers;

// A url cached under the source's `cacheKey` instead of the url. Glide keys
// its disk cache by getCacheKey(), and its memory cache by equals() and
// hashCode(), which also compare the headers: here they only use the key, so
// a url whose token or headers change still hits both caches. The request
// still uses the url and headers.
class FastImageKeyedGlideUrl extends GlideUrl {
    private final String mCacheKey;

    FastImageKeyedGlideUrl(String url, Headers headers, @NonNull String cacheKey) {
        super(url, headers);
        mCacheKey = cacheKey;
    }

    @Override
    public String getCacheKey() {
        return mCacheKey;
    }

    @Override
    public boolean equals(@Nullable Object other) {
        return other instanceof FastImageKeyedGlideUrl
                && mCacheKey.equals(((FastImageKeyedGlideUrl) other).mCacheKey);
    }

    @Override
    public int hashCode() {
        return mCacheKey.hashCode();
    }
}
