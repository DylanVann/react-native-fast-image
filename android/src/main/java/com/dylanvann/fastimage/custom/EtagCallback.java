package com.dylanvann.fastimage.custom;

public interface EtagCallback {
    void onEtag(String etag);
    void onError(String error);
}
