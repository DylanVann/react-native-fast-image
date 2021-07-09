package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.drawable.Drawable;
import android.widget.ImageView;

import com.bumptech.glide.load.model.GlideUrl;

class FastImageViewWithUrl extends ImageView {
    private Drawable placeholderDrawable;
    public GlideUrl glideUrl;

    public Drawable getPlaceholderDrawable() {
        return placeholderDrawable;
    }

    public void setPlaceholderDrawable(Drawable placeholderDrawable) {
        this.placeholderDrawable = placeholderDrawable;
    }

    public FastImageViewWithUrl(Context context) {
        super(context);
    }
}
