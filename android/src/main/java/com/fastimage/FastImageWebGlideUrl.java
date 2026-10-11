package com.fastimage;

import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.Headers;

// A url loaded with `cache: 'web'`. Glide doesn't cache these, so they load
// through an OkHttp client with an HTTP cache (see
// FastImageOkHttpProgressGlideModule) to follow the server's caching headers.
// Loaded as a FastImageUrl, like FastImage's other urls.
class FastImageWebGlideUrl extends GlideUrl {
    FastImageWebGlideUrl(String url, Headers headers) {
        super(url, headers);
    }
}
