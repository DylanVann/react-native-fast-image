package com.dylanvann.fastimage;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;

import androidx.annotation.Nullable;
import androidx.appcompat.widget.AppCompatImageView;

import com.bumptech.glide.RequestBuilder;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.resource.gif.GifDrawable;
import com.bumptech.glide.request.Request;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.uimanager.BackgroundStyleApplicator;
import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.uimanager.ReactPointerEventsView;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import javax.annotation.Nonnull;

class FastImageViewWithUrl extends AppCompatImageView implements ReactPointerEventsView {
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

    // For React Native's touch handling (pointerEvents="none" lets touches
    // through to views below).
    private PointerEvents mPointerEvents = PointerEvents.AUTO;

    void setPointerEvents(PointerEvents pointerEvents) {
        mPointerEvents = pointerEvents;
    }

    @Override
    public PointerEvents getPointerEvents() {
        return mPointerEvents;
    }

    // Whether onProgress has a handler: progress is only tracked then.
    private boolean mProgressEnabled = false;

    void setProgressEnabled(boolean progressEnabled) {
        mProgressEnabled = progressEnabled;
    }

    // Background and borders are drawn by React Native's background drawable,
    // as for its own Image, which also clips the image to the rounded corners.
    @Override
    public void setBackgroundColor(int color) {
        BackgroundStyleApplicator.setBackgroundColor(this, color);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        int saveCount = canvas.save();
        BackgroundStyleApplicator.clipToPaddingBox(this, canvas);
        super.onDraw(canvas);
        canvas.restoreToCount(saveCount);
    }

    // How many times GIFs play: -1 for the file's own loop count (the `loop`
    // prop not set), 0 for forever, or a number of times.
    private int mLoopCount = -1;

    public void setLoopCount(int loopCount) {
        if (loopCount == mLoopCount) return;
        mLoopCount = loopCount;
        // Apply it to the GIF that's showing, and play it again.
        Drawable drawable = getDrawable();
        if (drawable instanceof GifDrawable) {
            applyLoopCount((GifDrawable) drawable);
            ((GifDrawable) drawable).startFromFirstFrame();
        }
    }

    void applyLoopCount(GifDrawable gif) {
        gif.setLoopCount(mLoopCount == -1 ? GifDrawable.LOOP_INTRINSIC
                : mLoopCount == 0 ? GifDrawable.LOOP_FOREVER
                : mLoopCount);
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
            WritableMap event = new WritableNativeMap();
            event.putString("error", "Invalid source: " + mSource);
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

        if (glideUrl != null && mProgressEnabled) {
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

            if (key != null)
                builder.listener(new FastImageRequestListener(key, imageSource));

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
