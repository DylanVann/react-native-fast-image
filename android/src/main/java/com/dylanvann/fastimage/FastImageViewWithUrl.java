package com.dylanvann.fastimage;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.drawable.Drawable;

import androidx.annotation.Nullable;
import androidx.appcompat.widget.AppCompatImageView;

import com.bumptech.glide.RequestBuilder;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.request.Request;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import javax.annotation.Nonnull;

class FastImageViewWithUrl extends AppCompatImageView {
    private boolean mNeedsReload = false;
    private ReadableMap mSource = null;
    private Drawable mDefaultSource = null;

    public GlideUrl glideUrl;

    public FastImageViewWithUrl(Context context) {
        super(context);
    }

    public void setSource(@Nullable ReadableMap source) {
        mNeedsReload = true;
        mSource = source;
    }

    public void setDefaultSource(@Nullable Drawable source) {
        mNeedsReload = true;
        mDefaultSource = source;
    }

    // Glide crops or fits the bitmap for the scale type when it loads, so a
    // new resizeMode needs a reload to take effect (#762).
    public void setResizeMode(ScaleType scaleType) {
        if (scaleType == getScaleType()) return;
        setScaleType(scaleType);
        mNeedsReload = true;
    }

    @SuppressLint("CheckResult")
    public void onAfterUpdate(
            @Nonnull FastImageViewManager manager,
            @Nullable RequestManager requestManager,
            @Nonnull Map<String, List<FastImageViewWithUrl>> viewsForUrlsMap) {
        if (!mNeedsReload)
            return;
        // Only reload for changes that affect the request (source,
        // defaultSource, resizeMode), not for every prop update.
        mNeedsReload = false;

        // Nothing to show.
        if (mSource == null && mDefaultSource == null) {
            // Cancel existing requests.
            clearView(requestManager);

            untrackUrl(viewsForUrlsMap);

            // Clear the image.
            setImageDrawable(null);
            return;
        }

        //final GlideUrl glideUrl = FastImageViewConverter.getGlideUrl(view.getContext(), mSource);
        final FastImageSource imageSource = FastImageViewConverter.hasUri(mSource)
                ? FastImageViewConverter.getImageSource(getContext(), mSource)
                : null;

        // A source without a uri (empty, missing or null), or one that can't be
        // resolved: fire onError and onLoadEnd and show defaultSource, as on iOS
        // (#1028, #945).
        if (mSource != null && (imageSource == null || imageSource.getUri().toString().length() == 0)) {
            ReactContext context = FastImageViewManager.getReactContext(getContext());
            if (context != null) {
                RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
                int viewId = getId();
                WritableMap event = new WritableNativeMap();
                event.putString("message", "Invalid source prop:" + mSource);
                eventEmitter.receiveEvent(viewId, REACT_ON_ERROR_EVENT, event);
                eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, new WritableNativeMap());
            }

            // Cancel existing requests.
            clearView(requestManager);

            untrackUrl(viewsForUrlsMap);
            setImageDrawable(mDefaultSource);
            return;
        }

        // `imageSource` may be null and we still continue, if `defaultSource` is not null
        final GlideUrl glideUrl = imageSource == null ? null : imageSource.getGlideUrl();

        String key = glideUrl == null ? null : glideUrl.toStringUrl();

        // Loading a different url: stop tracking the old one.
        if (this.glideUrl != null && !this.glideUrl.toStringUrl().equals(key)) {
            untrackUrl(viewsForUrlsMap);
        }

        // Cancel existing request.
        this.glideUrl = glideUrl;
        clearView(requestManager);

        if (glideUrl != null) {
            FastImageOkHttpProgressGlideModule.expect(key, manager);
            List<FastImageViewWithUrl> viewsForKey = viewsForUrlsMap.get(key);
            if (viewsForKey != null && !viewsForKey.contains(this)) {
                viewsForKey.add(this);
            } else if (viewsForKey == null) {
                List<FastImageViewWithUrl> newViewsForKeys = new ArrayList<>(Collections.singletonList(this));
                viewsForUrlsMap.put(key, newViewsForKeys);
            }
        }

        ReactContext reactContext = FastImageViewManager.getReactContext(getContext());
        if (imageSource != null && reactContext != null) {
            // This is an orphan even without a load/loadend when only loading a placeholder
            RCTEventEmitter eventEmitter = reactContext.getJSModule(RCTEventEmitter.class);
            int viewId = this.getId();

            eventEmitter.receiveEvent(viewId,
                    FastImageViewManager.REACT_ON_LOAD_START_EVENT,
                    new WritableNativeMap());
        }

        if (requestManager != null) {
            RequestBuilder<Drawable> builder =
                    requestManager
                            // This will make this work for remote and local images. e.g.
                            //    - file:///
                            //    - content://
                            //    - res:/
                            //    - android.resource://
                            //    - data:image/png;base64
                            .load(imageSource == null ? null : imageSource.getSourceForLoad())
                            .apply(FastImageViewConverter
                                    .getOptions(getContext(), imageSource, mSource)
                                    .placeholder(mDefaultSource) // show until loaded
                                    .fallback(mDefaultSource)); // null will not be treated as error

            if (key != null)
                builder.listener(new FastImageRequestListener(key));

            builder.into(this);
        }
    }

    // Removes this view from the list of views for its current url (used to send
    // progress events), which otherwise kept it, and its Activity, alive after
    // its source changed (#384). The url's progress listener is only forgotten
    // when no other view uses it.
    void untrackUrl(@Nonnull Map<String, List<FastImageViewWithUrl>> viewsForUrlsMap) {
        if (glideUrl == null) return;
        String key = glideUrl.toStringUrl();
        List<FastImageViewWithUrl> viewsForKey = viewsForUrlsMap.get(key);
        if (viewsForKey != null) {
            viewsForKey.remove(this);
            if (viewsForKey.isEmpty()) viewsForUrlsMap.remove(key);
        }
        if (viewsForKey == null || viewsForKey.isEmpty()) {
            FastImageOkHttpProgressGlideModule.forget(key);
        }
        glideUrl = null;
    }

    public void clearView(@Nullable RequestManager requestManager) {
        if (requestManager != null && getTag() != null && getTag() instanceof Request) {
            requestManager.clear(this);
        }
    }
}
