package com.dylanvann.fastimage;

import android.content.Context;

import androidx.appcompat.widget.AppCompatImageView;

import com.bumptech.glide.load.model.GlideUrl;

class FastImageViewWithUrl extends AppCompatImageView {
    public GlideUrl glideUrl;

    public FastImageViewWithUrl(Context context) {
        super(context);
    }
}
