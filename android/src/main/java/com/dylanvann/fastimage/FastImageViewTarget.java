package com.dylanvann.fastimage;

import android.graphics.drawable.Drawable;
import android.widget.ImageView;

import androidx.annotation.Nullable;

import com.bumptech.glide.load.resource.gif.GifDrawable;
import com.bumptech.glide.request.target.ImageViewTarget;

/**
 * A target for display {@link GifDrawable} or {@link Drawable} objects in {@link ImageView}s.
 */
public class FastImageViewTarget extends ImageViewTarget<Drawable> {
    public FastImageViewTarget(FastImageViewWithUrl view) {
        super(view);
    }

    @Override
    protected void setResource(@Nullable Drawable resource) {
        FastImageViewWithUrl fastImage = (FastImageViewWithUrl)view;

        if (resource instanceof GifDrawable) {
            GifDrawable drawable = (GifDrawable)resource;
            fastImage.onSetResource(drawable);
        }

        view.setImageDrawable(resource);
    }
}
