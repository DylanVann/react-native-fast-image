package com.dylanvann.fastimage;

import android.graphics.drawable.Drawable;

import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.resource.gif.GifDrawable;
import com.bumptech.glide.request.Request;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

public class FastImageRequestListener implements RequestListener<Drawable> {
    static final String REACT_ON_ERROR_EVENT = "onFastImageError";
    static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";
    static final String REACT_ON_LOAD_END_EVENT = "onFastImageLoadEnd";
    private final String key;
    private final FastImageSource source;
    // Whether the request shows the previous image as a thumbnail meanwhile.
    private final boolean thumbnail;
    // False when loading the image that's showing again at a new size: the
    // view shows it at its old size if that fails.
    private final boolean events;

    FastImageRequestListener(String key, FastImageSource source, boolean thumbnail, boolean events) {
        this.key = key;
        this.source = source;
        this.thumbnail = thumbnail;
        this.events = events;
    }

    @Override
    public boolean onLoadFailed(@androidx.annotation.Nullable GlideException e, Object model, Target<Drawable> target, boolean isFirstResource) {
        if (!events) return false;
        FastImageOkHttpProgressGlideModule.forget(key);
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        view.onImageFailed(thumbnail);
        FastImageEvents.send(view, REACT_ON_ERROR_EVENT);
        FastImageEvents.send(view, REACT_ON_LOAD_END_EVENT);
        return false;
    }

    @Override
    public boolean onResourceReady(Drawable resource, Object model, final Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        final FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        view.onImageLoaded();
        if (resource instanceof GifDrawable) {
            // Play the GIF as many times as the file says, as iOS does. Glide
            // loops every GIF forever by default (#651).
            ((GifDrawable) resource).setLoopCount(GifDrawable.LOOP_INTRINSIC);
        }
        if (!events) return false;
        boolean local = !(model instanceof GlideUrl);
        int[] size = FastImageSourceSize.get(resource, model, local,
                dataSource == DataSource.RESOURCE_DISK_CACHE);
        if (size != null) {
            sendLoad(view, size);
            return false;
        }
        // A local image whose size isn't known: read it from the image first,
        // unless the view starts another load meanwhile.
        final Request request = target.getRequest();
        FastImageSourceSize.readLocal(view.getContext(), source, resource, model, new FastImageSourceSize.Callback() {
            @Override
            public void onSize(int[] size) {
                if (target.getRequest() == request) sendLoad(view, size);
            }
        });
        return false;
    }

    private static void sendLoad(FastImageViewWithUrl view, int[] size) {
        WritableMap event = new WritableNativeMap();
        event.putInt("width", size[0]);
        event.putInt("height", size[1]);
        FastImageEvents.send(view, REACT_ON_LOAD_EVENT, event);
        FastImageEvents.send(view, REACT_ON_LOAD_END_EVENT);
    }
}
