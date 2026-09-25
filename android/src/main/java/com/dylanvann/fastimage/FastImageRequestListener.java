package com.dylanvann.fastimage;

import android.graphics.drawable.Drawable;

import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.request.Request;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.uimanager.events.RCTEventEmitter;

public class FastImageRequestListener implements RequestListener<Drawable> {
    static final String REACT_ON_ERROR_EVENT = "onFastImageError";
    static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";
    static final String REACT_ON_LOAD_END_EVENT = "onFastImageLoadEnd";
    private final String key;
    private final FastImageSource source;

    FastImageRequestListener(String key, FastImageSource source) {
        this.key = key;
        this.source = source;
    }

    @Override
    public boolean onLoadFailed(@androidx.annotation.Nullable GlideException e, Object model, Target<Drawable> target, boolean isFirstResource) {
        FastImageOkHttpProgressGlideModule.forget(key);
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        ReactContext context = FastImageViewManager.getReactContext(view.getContext());
        if (context == null) {
            return false;
        }
        RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
        int viewId = view.getId();
        eventEmitter.receiveEvent(viewId, REACT_ON_ERROR_EVENT, new WritableNativeMap());
        eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, new WritableNativeMap());
        return false;
    }

    @Override
    public boolean onResourceReady(Drawable resource, Object model, final Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        final FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
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
        ReactContext context = FastImageViewManager.getReactContext(view.getContext());
        if (context == null) {
            return;
        }
        RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
        int viewId = view.getId();
        WritableMap event = new WritableNativeMap();
        event.putInt("width", size[0]);
        event.putInt("height", size[1]);
        eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_EVENT, event);
        eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, new WritableNativeMap());
    }
}
