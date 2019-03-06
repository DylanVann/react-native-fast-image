package com.dylanvann.fastimage;

import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.Headers;

import java.net.URI;

public class FastImageGlideUrlWithoutQueryParams extends GlideUrl {
    private String staticURL;

    public FastImageGlideUrlWithoutQueryParams(String url, Headers headers) {
        super(url, headers);
        staticURL = url.substring(0, url.lastIndexOf('?'));
    }

    @Override
    public String getCacheKey() {
        return staticURL;
    }

    @Override
    public String toString() {
        return super.getCacheKey();
    }
}