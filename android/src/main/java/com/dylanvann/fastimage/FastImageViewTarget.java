package com.dylanvann.fastimage;

import android.graphics.drawable.Drawable;

import androidx.annotation.Nullable;

import com.bumptech.glide.load.resource.gif.GifDrawable;
import com.bumptech.glide.request.target.ImageViewTarget;

class FastImageViewTarget extends ImageViewTarget<Drawable> {
    public FastImageViewTarget(FastImageViewWithUrl view) {
        super(view);
    }

    @Override
    protected void setResource(@Nullable Drawable resource) {
        FastImageViewWithUrl fastImageViewWithUrl = (FastImageViewWithUrl) view;

        if (resource instanceof GifDrawable) {
            GifDrawable gifDrawable = (GifDrawable) resource;
            fastImageViewWithUrl.onSetResource(gifDrawable);
        }

        view.setImageDrawable(resource);
    }
}
