package com.dylanvann.fastimage;

import android.content.Context;
import android.widget.ImageView;

import com.bumptech.glide.load.model.GlideUrl;
import com.facebook.react.bridge.ReadableMap;

class FastImageViewWithUrl extends ImageView {
    public GlideUrl glideUrl;
    public ReadableMap source;
    public ReadableMap imageSizeOverride;

    public FastImageViewWithUrl(Context context) {
        super(context);
    }
}
