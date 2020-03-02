package com.dylanvann.fastimage;

import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.Headers;
import java.net.URISyntaxException;

import java.net.URI;

public class FastImageGlideUrlWithoutQueryParams extends GlideUrl {
    private String staticURL;

    private String getUrlWithoutParameters(String url) throws URISyntaxException {
        URI uri = new URI(url);
        return new URI(uri.getScheme(),
            uri.getAuthority(),
            uri.getPath(),
            null,
            uri.getFragment()).toString();
    }

    public FastImageGlideUrlWithoutQueryParams(String url, Headers headers) {
        super(url, headers);
        try {
            staticURL = this.getUrlWithoutParameters(url);
        } catch (Exception e) {
            staticURL = url.toString();
        }
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
