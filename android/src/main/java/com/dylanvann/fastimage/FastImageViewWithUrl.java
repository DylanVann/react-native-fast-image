package com.dylanvann.fastimage;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.drawable.Drawable;

import androidx.annotation.Nullable;
import androidx.appcompat.widget.AppCompatImageView;
import androidx.core.view.ViewCompat;

import com.bumptech.glide.RequestBuilder;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.request.Request;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

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
    // Null when the view was created in a destroyed Activity (nothing loads).
    @Nullable
    final RequestManager requestManager;

    public FastImageViewWithUrl(Context context, @Nullable RequestManager requestManager) {
        super(context);
        this.requestManager = requestManager;
    }

    public void setSource(@Nullable ReadableMap source) {
        mNeedsReload = true;
        mSource = source;
    }

    public void setDefaultSource(@Nullable Drawable source) {
        mNeedsReload = true;
        mDefaultSource = source;
    }

    // Legacy architecture only (see FastImageShadowNode): the view's layout is
    // 0×0 at its parent's origin, which React Native never applies. Lay it out
    // at that size, as the New Architecture does, so Glide stops waiting for a
    // size and loads it (#865).
    void onZeroLayout() {
        if (!ViewCompat.isLaidOut(this)) layout(0, 0, 0, 0);
    }

    // Glide crops or fits the bitmap for the scale type when it loads, so a
    // new resizeMode needs a reload to take effect (#762).
    public void setResizeMode(ScaleType scaleType) {
        if (scaleType == getScaleType()) return;
        setScaleType(scaleType);
        mNeedsReload = true;
    }

    @SuppressLint("CheckResult")
    // The request for the image the view shows once it has loaded, and the one
    // loading. A new source starts with the shown one as a thumbnail, from the
    // cache only, so the image stays until the new one has loaded instead of
    // flashing blank (#747). This is Glide's safe way to do that: the previous
    // bitmap can't be kept in the view itself, since Glide reuses it once its
    // request is cleared.
    @Nullable
    private RequestBuilder<Drawable> mShownRequest;
    @Nullable
    private RequestBuilder<Drawable> mLoadingRequest;
    // Counts loads, to tell whether a posted update is for the current one.
    private int mLoadCount = 0;

    @Nullable
    private String mRecyclingKey;

    // When it changes, the next image doesn't replace the current one: the
    // view clears first (for views reused for other content, like list rows).
    void setRecyclingKey(@Nullable String recyclingKey) {
        if (recyclingKey == null ? mRecyclingKey == null : recyclingKey.equals(mRecyclingKey)) return;
        boolean changed = mRecyclingKey != null;
        mRecyclingKey = recyclingKey;
        if (changed) {
            // No thumbnail of the current image, so Glide clears the view to
            // defaultSource (or nothing) while the next one loads. Reload even
            // if the source is the same.
            mShownRequest = null;
            mNeedsReload = true;
        }
    }

    // The loading image loaded (FastImageRequestListener).
    void onImageLoaded() {
        mShownRequest = mLoadingRequest;
    }

    // The loading image failed (FastImageRequestListener). Glide shows
    // defaultSource then, but not over a thumbnail: show it here, as iOS does.
    void onImageFailed(boolean hadThumbnail) {
        mShownRequest = null;
        if (!hadThumbnail) return;
        final int load = mLoadCount;
        // Not from within Glide's callback.
        post(new Runnable() {
            @Override
            public void run() {
                if (load == mLoadCount) setImageDrawable(mDefaultSource);
            }
        });
    }

    public void onAfterUpdate(
            @Nonnull FastImageViewManager manager,
            @Nullable RequestManager requestManager,
            @Nonnull Map<String, List<FastImageViewWithUrl>> viewsForUrlsMap) {
        if (!mNeedsReload)
            return;
        // Only reload for changes that affect the request (source,
        // defaultSource, resizeMode), not for every prop update.
        mNeedsReload = false;
        mLoadCount++;
        RequestBuilder<Drawable> shownRequest = mShownRequest;
        mShownRequest = null;
        mLoadingRequest = null;

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
            WritableMap event = new WritableNativeMap();
            event.putString("message", "Invalid source prop:" + mSource);
            FastImageEvents.send(this, REACT_ON_ERROR_EVENT, event);
            FastImageEvents.send(this, REACT_ON_LOAD_END_EVENT);

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

        if (imageSource != null) {
            // This is an orphan even without a load/loadend when only loading a placeholder
            FastImageEvents.send(this, FastImageViewManager.REACT_ON_LOAD_START_EVENT);
        }

        if (requestManager != null) {
            // Records the image's own size when Glide decodes it, for onLoad.
            Object model = imageSource == null ? null : imageSource.getSourceForLoad();
            FastImageSourceSize.Capture capture = FastImageSourceSize.capture(getScaleType(), model);
            RequestBuilder<Drawable> builder =
                    requestManager
                            // This will make this work for remote and local images. e.g.
                            //    - file:///
                            //    - content://
                            //    - res:/
                            //    - android.resource://
                            //    - data:image/png;base64
                            .load(model)
                            .apply(FastImageViewConverter
                                    .getOptions(getContext(), imageSource, mSource)
                                    .placeholder(mDefaultSource) // show until loaded
                                    .fallback(mDefaultSource)) // null will not be treated as error
                            // What into() would apply for the scale type, with
                            // the size capture.
                            .apply(FastImageSourceSize.scaleTypeOptions(getScaleType(), capture));
            mLoadingRequest = builder.clone();

            boolean thumbnail = shownRequest != null && model != null;
            if (thumbnail) {
                // Only from the cache: never load the old image again.
                builder = builder.thumbnail(shownRequest.clone().onlyRetrieveFromCache(true));
            }

            if (key != null)
                builder.listener(new FastImageRequestListener(key, imageSource, thumbnail));

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
