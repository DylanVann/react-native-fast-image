package com.dylanvann.fastimage;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.widget.AppCompatImageView;
import androidx.core.view.ViewCompat;

import com.bumptech.glide.RequestBuilder;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.resource.bitmap.DownsampleStrategy;
import com.bumptech.glide.load.resource.gif.GifDrawable;
import com.bumptech.glide.request.Request;
import com.bumptech.glide.request.RequestOptions;
import com.bumptech.glide.request.target.DrawableImageViewTarget;
import com.bumptech.glide.request.target.SizeReadyCallback;
import com.bumptech.glide.request.transition.Transition;
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

    // How many times GIFs play: -1 for the file's own loop count (the `loop`
    // prop not set), 0 for forever, or a number of times.
    private int mLoopCount = -1;

    public void setLoopCount(int loopCount) {
        if (loopCount == mLoopCount) return;
        mLoopCount = loopCount;
        // Apply it to the GIF that's showing, and play it again. Only this
        // view's own animation: restarting one Glide shares throws while
        // another view plays it.
        if (mOwnGif != null && getDrawable() == mOwnGif) {
            applyLoopCount(mOwnGif);
            if (!mPaused) {
                mOwnGif.stop();
                mOwnGif.startFromFirstFrame();
            }
        }
    }

    // Pauses GIFs on the frame they're showing (the view's own animation).
    private boolean mPaused = false;

    public void setPaused(boolean paused) {
        if (paused == mPaused) return;
        mPaused = paused;
        if (mOwnGif != null && getDrawable() == mOwnGif) {
            if (paused) {
                mOwnGif.stop();
            } else {
                // Also starts counting plays again (GifDrawable resets its
                // loop count on start).
                mOwnGif.start();
            }
        }
    }

    // The GIF this view shows as its own animation (FastImageGif), recycled
    // when the view stops showing it.
    @Nullable
    private GifDrawable mOwnGif;

    // Shows each GIF as this view's own animation. Glide's target also starts
    // and stops it with the Activity, as it does Glide's own GifDrawable.
    private final class OwnGifTarget extends DrawableImageViewTarget {
        OwnGifTarget() {
            super(FastImageViewWithUrl.this);
        }

        @Override
        public void onResourceReady(@NonNull Drawable resource, @Nullable Transition<? super Drawable> transition) {
            if (resource instanceof BitmapDrawable) {
                if (mPixelated) {
                    // Scaled by the view without filtering: sharp pixels.
                    resource = resource.mutate();
                    resource.setFilterBitmap(false);
                }
            }
            if (resource instanceof GifDrawable) {
                GifDrawable own = FastImageGif.copy(
                        getContext(), (GifDrawable) resource, mLoadingWidth, mLoadingHeight);
                if (own != null) {
                    applyLoopCount(own);
                    super.onResourceReady(own, transition);
                    mOwnGif = own;
                    // The target starts it; paused, it waits on its first frame.
                    if (mPaused) own.stop();
                    return;
                }
            }
            super.onResourceReady(resource, transition);
        }

        // The target starts animations again when the Activity does; not a
        // paused one.
        @Override
        public void onStart() {
            if (!mPaused) super.onStart();
        }

        @Override
        protected void setResource(@Nullable Drawable resource) {
            super.setResource(resource);
            // Not shown anymore (replaced, cleared or failed): free its frames.
            if (mOwnGif != null && mOwnGif != resource) {
                mOwnGif.stop();
                mOwnGif.recycle();
                mOwnGif = null;
            }
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

    // imageRendering="pixelated": no resampling by Glide, and drawn without
    // filtering (sharp pixels). "smooth" is iOS only; here it's the same as
    // "auto": Glide already decodes a large image at about the view's size, and
    // averaging it properly would need a full-size decode. Part of the
    // request, so a change reloads.
    private boolean mPixelated = false;

    public void setImageRendering(@Nullable String imageRendering) {
        boolean pixelated = "pixelated".equals(imageRendering);
        if (pixelated == mPixelated) return;
        mPixelated = pixelated;
        mNeedsReload = true;
    }

    // The scale type's options (what into() would apply), or none when
    // pixelated.
    private RequestOptions renderingOptions(Object model) {
        if (mPixelated) {
            // Decoded as it is, then scaled by the view without filtering (see
            // OwnGifTarget).
            return new RequestOptions()
                    .downsample(new FastImageSourceSize.Capture(DownsampleStrategy.NONE, String.valueOf(model)))
                    .dontTransform();
        }
        return FastImageSourceSize.scaleTypeOptions(getScaleType(), FastImageSourceSize.capture(getScaleType(), model));
    }

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
    // The size Glide loaded the shown image at, and is loading the loading
    // one at (0 until it has one).
    private int mShownWidth = 0;
    private int mShownHeight = 0;
    private int mLoadingWidth = 0;
    private int mLoadingHeight = 0;
    private boolean mResizeReloadPosted = false;

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
        mShownWidth = mLoadingWidth;
        mShownHeight = mLoadingHeight;
        reloadIfResized();
    }

    // Glide crops or scales the image to the view's size when it loads, so if
    // the view's size changes after that, load it again at the new size.
    // Otherwise a view that gets taller shows a zoomed-in slice of it (#983).
    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        reloadIfResized();
    }

    private void reloadIfResized() {
        if (mResizeReloadPosted || !isResized()) return;
        mResizeReloadPosted = true;
        // After layout (once per frame), and not from within Glide's callback.
        post(new Runnable() {
            @Override
            public void run() {
                mResizeReloadPosted = false;
                if (isResized()) reloadForSize();
            }
        });
    }

    // Whether the image loaded, at a size the view doesn't have now.
    private boolean isResized() {
        int width = getWidth() - getPaddingLeft() - getPaddingRight();
        int height = getHeight() - getPaddingTop() - getPaddingBottom();
        return requestManager != null && !mNeedsReload
                && mShownRequest != null && mShownRequest == mLoadingRequest
                && mShownWidth > 0 && mShownHeight > 0 && width > 0 && height > 0
                && (width != mShownWidth || height != mShownHeight);
    }

    // The same image at the view's new size. Meanwhile, and if that fails, the
    // view shows the image at its old size, from the cache. It's the image
    // that's already showing, so this sends no events.
    @SuppressLint("CheckResult")
    private void reloadForSize() {
        RequestBuilder<Drawable> shown = mShownRequest;
        RequestBuilder<Drawable> current = fromCache(shown);
        mLoadCount++;
        clearView(requestManager);
        into(shown, shown.clone()
                .thumbnail(current)
                .error(current.clone())
                .listener(new FastImageRequestListener(null, null, true, false)));
    }

    // The shown image, from the cache only (never loaded again), at the size
    // it was loaded at: the key it's in Glide's memory cache under.
    @SuppressLint("CheckResult")
    private RequestBuilder<Drawable> fromCache(RequestBuilder<Drawable> shown) {
        RequestBuilder<Drawable> request = shown.clone().onlyRetrieveFromCache(true);
        if (mShownWidth > 0 && mShownHeight > 0) request = request.override(mShownWidth, mShownHeight);
        return request;
    }

    // Starts loading the request (built by builder), recording the size Glide
    // loads it at. The size callback is added first, so it has the size by
    // the time the image loads, even from the memory cache.
    private void into(RequestBuilder<Drawable> request, RequestBuilder<Drawable> builder) {
        final int load = mLoadCount;
        mLoadingRequest = request;
        mLoadingWidth = 0;
        mLoadingHeight = 0;
        OwnGifTarget target = new OwnGifTarget();
        target.getSize(new SizeReadyCallback() {
            @Override
            public void onSizeReady(int width, int height) {
                if (load != mLoadCount) return;
                mLoadingWidth = width;
                mLoadingHeight = height;
            }
        });
        builder.into(target);
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
                            // the size capture, for imageRendering.
                            .apply(renderingOptions(model));
            RequestBuilder<Drawable> request = builder.clone();

            boolean thumbnail = shownRequest != null && model != null;
            if (thumbnail) {
                builder = builder.thumbnail(fromCache(shownRequest));
            }

            if (key != null)
                builder.listener(new FastImageRequestListener(key, imageSource, thumbnail, true));

            into(request, builder);
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
