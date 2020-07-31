package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.drawable.Drawable;
import android.widget.ImageView;

import androidx.vectordrawable.graphics.drawable.Animatable2Compat.AnimationCallback;

import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.resource.gif.GifDrawable;

class FastImageViewWithUrl extends ImageView {
    public GlideUrl glideUrl;
    public int loopCount = GifDrawable.LOOP_INTRINSIC;
    private AnimationCallback _onAnimationComplete;

    // Lifecycle Methods
    public FastImageViewWithUrl(Context context) {
        super(context);
    }

    public void registerAnimationCallback(AnimationCallback animationCallback) {
        _onAnimationComplete = animationCallback;
    }

    public void clearAnimationCallbacks() {
        Drawable resource = this.getDrawable();

        if (resource != null && resource instanceof GifDrawable) {
            GifDrawable drawable = (GifDrawable)resource;
            drawable.clearAnimationCallbacks();
        }
    }

    // Public API
    public void setLoopCount(int loop) {
        loopCount = loop;
    }

    // Callback when our resource is set in FastImageViewTarget.
    public void onSetResource(GifDrawable drawable) {
        drawable.clearAnimationCallbacks();
        drawable.registerAnimationCallback(_onAnimationComplete);
        drawable.setLoopCount(loopCount);
    }
}
