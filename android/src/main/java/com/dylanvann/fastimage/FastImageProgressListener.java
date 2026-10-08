package com.dylanvann.fastimage;

// No longer used: FastImage sends progress through FastImageViewManager's
// onDownloadProgress. Kept, as a public type, so code that refers to it still
// compiles.
@Deprecated
public interface FastImageProgressListener {

    void onProgress(String key, long bytesRead, long expectedLength);

    /**
     * Control how often the listener needs an update. 0% and 100% will always be dispatched.
     *
     * @return in percentage (0.2 = call {@link #onProgress} around every 0.2 percent of progress)
     */
    float getGranularityPercentage();

}
