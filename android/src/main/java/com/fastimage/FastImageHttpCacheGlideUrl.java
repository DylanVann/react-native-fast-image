package com.fastimage;

import com.bumptech.glide.load.model.Headers;

// A `cacheOnly` source's url, read from the HTTP cache of `web` images when
// it isn't in Glide's caches: its copy of any age, without the network
// (FastImageSharedDownloads.request). A `web` url, so it loads with that
// cache's client. Never equal to another url, so Glide doesn't share a load
// (or memory cache entry) between it and one that may use the network.
final class FastImageHttpCacheGlideUrl extends FastImageWebGlideUrl {
    FastImageHttpCacheGlideUrl(String url, Headers headers) {
        super(url, headers);
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof FastImageHttpCacheGlideUrl && super.equals(other);
    }

    @Override
    public int hashCode() {
        return 31 * super.hashCode() + 1;
    }
}
