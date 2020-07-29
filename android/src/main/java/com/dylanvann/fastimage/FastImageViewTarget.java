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

    public FastImageViewTarget(FastImageViewWithUrl view, boolean waitForLayout) {
        super(view, waitForLayout);
    }

    @Override
    protected void setResource(@Nullable Drawable resource) {
        int loopCount = GifDrawable.LOOP_INTRINSIC;

        if (view instanceof FastImageViewWithUrl) {
            loopCount = ((FastImageViewWithUrl)view).loopCount;
        }

        if (resource instanceof GifDrawable) {
            ((GifDrawable) resource).setLoopCount(loopCount);
        }

        view.setImageDrawable(resource);
    }
}
