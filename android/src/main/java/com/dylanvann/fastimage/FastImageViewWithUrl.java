package com.dylanvann.fastimage;

import android.content.Context;
import android.widget.ImageView;

import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.model.GlideUrl;
import com.facebook.react.bridge.ReadableMap;

class FastImageViewWithUrl extends ImageView {
    public GlideUrl glideUrl;
    private RequestManager mRequestManager;
    private ReadableMap mSource;

    public FastImageViewWithUrl(Context context) {
        super(context);
    }

    public void setRequestManager(RequestManager requestManager) {
        mRequestManager = requestManager;
    }

    public void setSource(ReadableMap source) {
        if (mSource != source) {
            mSource = source;
            tryLoadImage();
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        // This will cancel existing requests.
        if (mRequestManager != null) {
            mRequestManager.clear(this);
        }
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        tryLoadImage();
    }

    private void tryLoadImage() {
        if (mRequestManager != null && mSource != null && glideUrl != null) {
            String key = glideUrl.toStringUrl();
            final FastImageSource imageSource = FastImageViewConverter.getImageSource(getContext(), mSource);

            mRequestManager
                    // This will make this work for remote and local images. e.g.
                    //    - file:///
                    //    - content://
                    //    - res:/
                    //    - android.resource://
                    //    - data:image/png;base64
                    .load(imageSource.getSourceForLoad())
                    .apply(FastImageViewConverter.getOptions(getContext(), imageSource, mSource))
                    .listener(new FastImageRequestListener(key))
                    .into(this);
        }
    }
}
