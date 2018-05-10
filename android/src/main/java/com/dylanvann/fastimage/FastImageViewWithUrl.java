package com.dylanvann.fastimage;

import android.content.Context;
import android.widget.ImageView;

import com.bumptech.glide.load.model.GlideUrl;

class FastImageViewWithUrl extends ImageView {
    public GlideUrl glideUrl;

    public FastImageViewWithUrl(Context context) {
        super(context);
    }
}
