package com.dylanvann.fastimage;

import android.graphics.drawable.Drawable;

import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.dylanvann.fastimage.events.OnErrorEvent;
import com.dylanvann.fastimage.events.OnLoadEndEvent;
import com.dylanvann.fastimage.events.OnLoadEvent;
import com.dylanvann.fastimage.events.OnLoadStartEvent;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.EventDispatcher;
import com.facebook.react.uimanager.events.RCTEventEmitter;

public class FastImageRequestListener implements RequestListener<Drawable> {
    static final String REACT_ON_ERROR_EVENT = "onFastImageError";
    static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";
    static final String REACT_ON_LOAD_END_EVENT = "onFastImageLoadEnd";
    private final String key;

    FastImageRequestListener(String key) {
        this.key = key;
    }

    @Override
    public boolean onLoadFailed(@androidx.annotation.Nullable GlideException e, Object model, Target<Drawable> target, boolean isFirstResource) {
        FastImageOkHttpProgressGlideModule.forget(key);
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        ThemedReactContext context = (ThemedReactContext) view.getContext();
        int viewId = view.getId();
        EventDispatcher eventDispatcher =
                UIManagerHelper.getEventDispatcherForReactTag(context, viewId);
        if (eventDispatcher == null) {
            return false;
        }
        eventDispatcher.dispatchEvent(new OnErrorEvent(viewId));
        eventDispatcher.dispatchEvent(new OnLoadEndEvent(viewId));
        return false;
    }

    @Override
    public boolean onResourceReady(Drawable resource, Object model, Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        ThemedReactContext context = (ThemedReactContext) view.getContext();
        int viewId = view.getId();
        EventDispatcher eventDispatcher =
                UIManagerHelper.getEventDispatcherForReactTag(context, viewId);
        if (eventDispatcher == null) {
            return false;
        }
        eventDispatcher.dispatchEvent(new OnLoadEvent(viewId, resource.getIntrinsicWidth(), resource.getIntrinsicHeight()));
        eventDispatcher.dispatchEvent(new OnLoadEndEvent(viewId));
        return false;
    }
}
