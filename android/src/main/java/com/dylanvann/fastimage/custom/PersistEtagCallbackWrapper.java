package com.dylanvann.fastimage.custom;

import com.dylanvann.fastimage.custom.persistence.ObjectBox;

/**
 * When an etag is returned this implementation will persist the received etag
 * if it has changed.
 */
public class PersistEtagCallbackWrapper implements EtagCallback {
    private final String url;
    private final EtagCallback callback;

    public PersistEtagCallbackWrapper(String url, EtagCallback callback) {
        this.url = url;
        this.callback = callback;
    }

    @Override
    public void onEtag(String etag) {
        String prevEtag = ObjectBox.getEtagByUrl(this.url);
        if (!etag.equals(prevEtag)) {
            ObjectBox.putOrUpdateEtag(this.url, etag);
        }
        callback.onEtag(etag);
    }
}
