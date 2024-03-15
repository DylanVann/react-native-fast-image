package com.dylanvann.fastimage;

import android.graphics.drawable.Drawable;

import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.dylanvann.fastimage.events.FastImageErrorEvent;
import com.dylanvann.fastimage.events.FastImageLoadEndEvent;
import com.dylanvann.fastimage.events.FastImageLoadEvent;
import com.dylanvann.fastimage.events.FastImageProgressEvent;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.EventDispatcher;

public class FastImageRequestListener implements RequestListener<Drawable> {
    static final String REACT_ON_ERROR_EVENT = "onFastImageError";
    static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";
    static final String REACT_ON_LOAD_END_EVENT = "onFastImageLoadEnd";
    private final String key;

    FastImageRequestListener(String key) {
        this.key = key;
    }

    private static WritableMap mapFromResource(Drawable resource) {
        WritableMap resourceData = new WritableNativeMap();
        resourceData.putInt("width", resource.getIntrinsicWidth());
        resourceData.putInt("height", resource.getIntrinsicHeight());
        return resourceData;
    }

    @Override
    public boolean onLoadFailed(@androidx.annotation.Nullable GlideException e, Object model, Target<Drawable> target, boolean isFirstResource) {
        FastImageOkHttpProgressGlideModule.forget(key);
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        ThemedReactContext context = (ThemedReactContext) view.getContext();

        EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.getId());
        int surfaceId = UIManagerHelper.getSurfaceId(view);

        if (dispatcher != null) {
            dispatcher.dispatchEvent(new FastImageErrorEvent(surfaceId, view.getId(), null));
            dispatcher.dispatchEvent(new FastImageLoadEndEvent(surfaceId, view.getId()));
        }

        return false;
    }

    @Override
    public boolean onResourceReady(Drawable resource, Object model, Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        ThemedReactContext context = (ThemedReactContext) view.getContext();

        EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.getId());
        int surfaceId = UIManagerHelper.getSurfaceId(view);

        if (dispatcher != null) {
            dispatcher.dispatchEvent(new FastImageLoadEvent(surfaceId, view.getId()));
            dispatcher.dispatchEvent(new FastImageLoadEndEvent(surfaceId, view.getId()));
        }

        return false;
    }
}
