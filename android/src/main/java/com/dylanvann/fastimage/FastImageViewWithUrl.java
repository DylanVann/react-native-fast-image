package com.dylanvann.fastimage;

import android.content.Context;
import androidx.appcompat.widget.AppCompatImageView;

import com.bumptech.glide.integration.webp.decoder.WebpDrawable;
import com.bumptech.glide.load.model.GlideUrl;

class FastImageViewWithUrl extends AppCompatImageView {
    public GlideUrl glideUrl;

    public void playAnimation() {
        if (this.getDrawable() instanceof WebpDrawable) {
            WebpDrawable drawable = (WebpDrawable) this.getDrawable();
            if (!drawable.isRunning()) {
                drawable.stop();
                drawable.startFromFirstFrame();
            }
        }
    }

    public FastImageViewWithUrl(Context context) {
        super(context);
    }
}
