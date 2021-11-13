package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.drawable.Drawable;

import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;

public class FastImageRequestListener implements RequestListener<Drawable> {
    static final String REACT_ON_ERROR_EVENT = "onFastImageError";
    static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";
    static final String REACT_ON_LOAD_END_EVENT = "onFastImageLoadEnd";

    private String key;

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
        int viewId = view.getId();
        Context context = view.getContext();
        ReactContext reactContext = FastImageViewManager.getReactContext(context);
        if (reactContext != null) {
            RCTEventEmitter eventEmitter = reactContext.getJSModule(RCTEventEmitter.class);
            eventEmitter.receiveEvent(viewId, REACT_ON_ERROR_EVENT, new WritableNativeMap());
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, new WritableNativeMap());
        }
        return false;
    }

    @Override
    public boolean onResourceReady(Drawable resource, Object model, Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        int viewId = view.getId();
        Context context = view.getContext();
        ReactContext reactContext = FastImageViewManager.getReactContext(context);
        if (reactContext != null) {
            RCTEventEmitter eventEmitter = reactContext.getJSModule(RCTEventEmitter.class);
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_EVENT, mapFromResource(resource));
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, new WritableNativeMap());
        }
        return false;
    }
}
