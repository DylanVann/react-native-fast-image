package com.dylanvann.fastimage;

import android.content.Context;

import androidx.appcompat.widget.AppCompatImageView;

import com.bumptech.glide.load.model.GlideUrl;
import com.facebook.react.bridge.ReadableMap;

class FastImageViewWithUrl extends AppCompatImageView {
    public GlideUrl glideUrl;
    public ReadableMap source;

    public FastImageViewWithUrl(Context context) {
        super(context);
    }
}
