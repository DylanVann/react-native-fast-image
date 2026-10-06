package com.dylanvann.fastimage;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Shader;
import android.graphics.drawable.AnimatedImageDrawable;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.appcompat.widget.AppCompatImageView;
import androidx.core.view.ViewCompat;

import com.bumptech.glide.GenericTransitionOptions;
import com.bumptech.glide.RequestBuilder;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.resource.bitmap.DownsampleStrategy;
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions;
import com.bumptech.glide.load.resource.gif.GifDrawable;
import com.bumptech.glide.request.Request;
import com.bumptech.glide.request.RequestOptions;
import com.bumptech.glide.request.target.DrawableImageViewTarget;
import com.bumptech.glide.request.target.SizeReadyCallback;
import com.bumptech.glide.request.transition.NoTransition;
import com.bumptech.glide.request.transition.Transition;
import com.bumptech.glide.request.transition.TransitionFactory;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.uimanager.ReactPointerEventsView;

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

    // FastImage sends "none" when it has pointerEvents="box-none" (the image
    // is part of the box, which doesn't take touches). React Native's touch
    // handling only reads pointerEvents from a ReactPointerEventsView.
    private PointerEvents mPointerEvents = PointerEvents.AUTO;

    @Override
    public PointerEvents getPointerEvents() {
        return mPointerEvents;
    }

    void setPointerEvents(PointerEvents pointerEvents) {
        mPointerEvents = pointerEvents;
    }

    public void setSource(@Nullable ReadableMap source) {
        mNeedsReload = true;
        mPropSource = source;
        if (mSources == null) mSource = source;
    }

    // The `source` prop. With several `sources`, mSource is the one picked for
    // the view's size instead.
    @Nullable
    private ReadableMap mPropSource = null;
    // Several sources (2 or more) of the same image at different sizes, or
    // null: the view loads the one whose size is closest to its own.
    @Nullable
    private ReadableArray mSources = null;
    // Several sources: the index of the one picked (-1 before one is), and
    // whether the load waits for the view's size (after layout), or has
    // waited (then it loads the largest if the view still has no size).
    private int mSourceIndex = -1;
    private boolean mWaitsForSize = false;
    private boolean mWaitedForSize = false;
    // Several sources: the next load switches to another one for a new view
    // size. It's the same picture at another size, so it doesn't fade in.
    private boolean mSwitchesSource = false;
    // What the last update was called with, to load once the view has a size.
    @Nullable
    private FastImageViewManager mManager;
    @Nullable
    private Map<String, List<FastImageViewWithUrl>> mViewsForUrlsMap;

    public void setSources(@Nullable ReadableArray sources) {
        mNeedsReload = true;
        mSources = sources != null && sources.size() > 1 ? sources : null;
        mSourceIndex = -1;
        if (mSources == null) mSource = mPropSource;
    }

    // Of several sources, the index of the one whose size in pixels (width ×
    // height × scale²) is closest to the view's (by pixel count), or of the
    // largest while the view has no size (e.g. one sized from onLoad).
    private int sourceIndexForSize() {
        ReadableArray sources = mSources;
        if (sources == null) return -1;
        double viewPixels = (double) getWidth() * getHeight();
        int best = -1;
        double bestFit = Double.MAX_VALUE;
        for (int i = 0; i < sources.size(); i++) {
            ReadableMap source = sources.getMap(i);
            if (source == null) continue;
            double scale = number(source, "scale", 1);
            double pixels = number(source, "width", 0) * number(source, "height", 0) * scale * scale;
            double fit = viewPixels > 0 ? Math.abs(1 - pixels / viewPixels) : -pixels;
            if (best < 0 || fit < bestFit) {
                best = i;
                bestFit = fit;
            }
        }
        return best;
    }

    // Picks the source for the view's size (several sources).
    private void pickSource() {
        mSourceIndex = sourceIndexForSize();
        mSource = mSourceIndex >= 0 && mSources != null ? mSources.getMap(mSourceIndex) : null;
    }

    private static double number(ReadableMap map, String key, double fallback) {
        return map.hasKey(key) && !map.isNull(key) ? map.getDouble(key) : fallback;
    }

    // Several sources: another one fits the view's new size better. Loads it
    // (after layout), keeping the image showing until then, without a fade.
    private boolean switchSourceIfResized() {
        if (mSources == null || mNeedsReload || mWaitsForSize || getWidth() <= 0 || getHeight() <= 0
                || mManager == null || sourceIndexForSize() == mSourceIndex) {
            return false;
        }
        mSwitchesSource = true;
        mNeedsReload = true;
        post(new Runnable() {
            @Override
            public void run() {
                if (mNeedsReload && mManager != null) onAfterUpdate(mManager, requestManager, mViewsForUrlsMap);
            }
        });
        return true;
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
        if (getDrawable() instanceof FastImageAnimatable) {
            ((FastImageAnimatable) getDrawable()).setLoopCount(mLoopCount, !mPaused);
        }
        if (mAnimated != null && getDrawable() == mAnimated && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            AnimatedImageDrawable animated = (AnimatedImageDrawable) mAnimated;
            applyRepeatCount(animated);
            if (!mPaused) {
                animated.stop();
                animated.start();
            }
        }
    }

    // Pauses GIFs on the frame they're showing (the view's own animation).
    private boolean mPaused = false;
    // Whether to send progress events (the image has an onProgress). Read on
    // the download's thread.
    volatile boolean trackProgress = false;

    // The `transition` prop (from the next load): how long a loaded image
    // takes to fade in, in milliseconds (0 for no fade), whether it also fades
    // over a loaded image (a new source), and which cache hits show at once
    // (none, memory or all).
    private int mTransitionDuration = 0;
    private boolean mTransitionBetweenImages = false;
    private String mTransitionSkipOnCacheHit = "memory";

    public void setTransitionDuration(int transitionDuration) {
        mTransitionDuration = Math.max(0, transitionDuration);
    }

    public void setTransitionBetweenImages(boolean betweenImages) {
        mTransitionBetweenImages = betweenImages;
    }

    public void setTransitionSkipOnCacheHit(@Nullable String skipOnCacheHit) {
        mTransitionSkipOnCacheHit = skipOnCacheHit == null ? "memory" : skipOnCacheHit;
    }

    // Fades a loaded image in, unless it's from a cache that skipOnCacheHit
    // skips, as Glide's and Coil's cross-fades and Fresco decide: from the
    // memory cache it shows at once (by default), and from the disk cache
    // too with 'all'. Downloads, local files and bundled images fade.
    private final class FadeFactory implements TransitionFactory<Drawable> {
        private final int duration;
        private final String skipOnCacheHit;

        FadeFactory(int duration, String skipOnCacheHit) {
            this.duration = duration;
            this.skipOnCacheHit = skipOnCacheHit;
        }

        @Override
        public Transition<Drawable> build(DataSource dataSource, boolean isFirstResource) {
            if (skips(dataSource)) return NoTransition.get();
            return new Transition<Drawable>() {
                @Override
                public boolean transition(Drawable current, ViewAdapter adapter) {
                    startFade(duration);
                    // The target shows the image as usual.
                    return false;
                }
            };
        }

        private boolean skips(DataSource dataSource) {
            if (skipOnCacheHit.equals("none")) return false;
            if (dataSource == DataSource.MEMORY_CACHE) return true;
            // Glide also keeps a local file's or bundled image's decoded
            // image in its disk cache (at the size it was decoded at, and not
            // for GIFs), so with 'all' they usually only fade the first time.
            boolean disk = dataSource == DataSource.DATA_DISK_CACHE || dataSource == DataSource.RESOURCE_DISK_CACHE;
            return disk && skipOnCacheHit.equals("all");
        }
    }

    // A fade in progress: what the view showed (null if nothing), drawn
    // fading out while the view's image fades in, as a cross-dissolve on iOS.
    // Drawn here rather than with Glide's DrawableCrossFadeTransition, whose
    // TransitionDrawable stretches both images to one size and stays in the
    // view after the fade, still drawing (and animating) the previous image.
    @Nullable
    private ValueAnimator mFade;
    @Nullable
    private Bitmap mFadeFrom;
    private float mFadeProgress = 1f;
    private final Paint mFadeFromPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint mFadeInPaint = new Paint();

    {
        // The two add up to a cross-dissolve: from * (1 - t) + image * t.
        mFadeInPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.ADD));
    }

    private void startFade(int duration) {
        int width = getWidth();
        int height = getHeight();
        if (width <= 0 || height <= 0) return;
        // What the view shows now, including a fade in progress.
        Bitmap from = null;
        if (getDrawable() != null) {
            try {
                from = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                onDraw(new Canvas(from));
            } catch (OutOfMemoryError | RuntimeException e) {
                // Out of memory, or a hardware bitmap (Android 8+; an app's
                // Glide module can enable them), which a software canvas
                // can't draw: fade in over nothing instead.
                if (from != null) from.recycle();
                from = null;
            }
        }
        endFade();
        mFadeFrom = from;
        mFadeProgress = 0f;
        final ValueAnimator fade = ValueAnimator.ofFloat(0f, 1f);
        fade.setDuration(duration);
        fade.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator animation) {
                mFadeProgress = (float) animation.getAnimatedValue();
                invalidate();
            }
        });
        fade.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                if (mFade == fade) endFade();
            }
        });
        mFade = fade;
        fade.start();
    }

    // Shows the image on its own (the fade ends, another starts, or the view
    // is detached).
    private void endFade() {
        ValueAnimator fade = mFade;
        mFade = null;
        if (fade != null) fade.cancel();
        if (mFadeFrom != null) {
            mFadeFrom.recycle();
            mFadeFrom = null;
        }
        mFadeProgress = 1f;
        invalidate();
    }

    @SuppressWarnings("deprecation")
    @Override
    protected void onDraw(Canvas canvas) {
        if (mFade == null) {
            super.onDraw(canvas);
            return;
        }
        int width = getWidth();
        int height = getHeight();
        int alpha = Math.round(255 * mFadeProgress);
        if (mFadeFrom == null) {
            // Fading in over nothing: one layer.
            int count = canvas.saveLayerAlpha(0, 0, width, height, alpha, Canvas.ALL_SAVE_FLAG);
            super.onDraw(canvas);
            canvas.restoreToCount(count);
            return;
        }
        // Canvas.ALL_SAVE_FLAG: the saveLayer without flags is API 21+.
        int count = canvas.saveLayer(0, 0, width, height, null, Canvas.ALL_SAVE_FLAG);
        mFadeFromPaint.setAlpha(255 - alpha);
        canvas.drawBitmap(mFadeFrom, 0, 0, mFadeFromPaint);
        mFadeInPaint.setAlpha(alpha);
        canvas.saveLayer(0, 0, width, height, mFadeInPaint, Canvas.ALL_SAVE_FLAG);
        super.onDraw(canvas);
        canvas.restoreToCount(count);
    }

    @Override
    protected void onDetachedFromWindow() {
        endFade();
        super.onDetachedFromWindow();
    }

    public void setPaused(boolean paused) {
        if (paused == mPaused) return;
        mPaused = paused;
        if (mOwnGif != null && getDrawable() == mOwnGif) {
            if (paused) {
                mOwnGif.stop();
            } else {
                // Continues the loop count, as on iOS.
                FastImageGif.resume(mOwnGif);
            }
        }
        if (getDrawable() instanceof FastImageAnimatable) {
            ((FastImageAnimatable) getDrawable()).setPaused(paused);
        }
        if (mAnimated != null && getDrawable() == mAnimated && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (paused) {
                ((AnimatedImageDrawable) mAnimated).stop();
            } else {
                // Plays from its first frame: an AnimatedImageDrawable has no
                // way to resume.
                ((AnimatedImageDrawable) mAnimated).start();
            }
        }
    }

    // The GIF this view shows as its own animation (FastImageGif), recycled
    // when the view stops showing it.
    @Nullable
    private GifDrawable mOwnGif;

    // An animated WebP or AVIF this view shows: an AnimatedImageDrawable, which
    // Glide 4.15+ decodes with Android's ImageDecoder (API 28+; AVIF 31+).
    @Nullable
    private Drawable mAnimated;

    // Shows each GIF as this view's own animation. Glide's target also starts
    // and stops it with the Activity, as it does Glide's own GifDrawable.
    private final class OwnGifTarget extends DrawableImageViewTarget {
        // Shown instead of the placeholder while loading (see shownCopy).
        @Nullable
        private Drawable mMeanwhile;
        // Counts images ready (a thumbnail, then the image), so a copy
        // decoded for one isn't shown over a later one.
        private int mReady = 0;

        OwnGifTarget(@Nullable Drawable meanwhile) {
            super(FastImageViewWithUrl.this);
            mMeanwhile = meanwhile;
        }

        @Override
        public void onLoadStarted(@Nullable Drawable placeholder) {
            Drawable meanwhile = mMeanwhile;
            mMeanwhile = null;
            super.onLoadStarted(meanwhile != null ? meanwhile : placeholder);
        }

        @Override
        public void onResourceReady(@NonNull Drawable resource, @Nullable Transition<? super Drawable> transition) {
            int ready = ++mReady;
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
            if (resource instanceof FastImageAnimatable) {
                // An APNG: each view's is its own (FastImageApng).
                FastImageAnimatable animatable = (FastImageAnimatable) resource;
                animatable.setLoopCount(mLoopCount, false);
                // The target starts it; paused, it stays on its first frame.
                super.onResourceReady(resource, transition);
                if (mPaused) animatable.setPaused(true);
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && resource instanceof AnimatedImageDrawable) {
                if (!FastImageAnimated.shownElsewhere(resource, FastImageViewWithUrl.this)) {
                    showAnimated((AnimatedImageDrawable) resource, transition);
                    return;
                }
                // Another view shows it: this one shows its own, once it's
                // decoded (meanwhile, what it showed), if it's still this
                // view's latest image. Failing that, it shares that view's.
                Drawable shared = resource;
                FastImageAnimated.copy(resource, copy -> {
                    Request request = getRequest();
                    if (ready != mReady || request == null || !request.isComplete()) return;
                    showAnimated((AnimatedImageDrawable) (copy != null ? copy : shared), transition);
                });
                return;
            }
            super.onResourceReady(resource, transition);
        }

        @RequiresApi(Build.VERSION_CODES.P)
        private void showAnimated(AnimatedImageDrawable animated, @Nullable Transition<? super Drawable> transition) {
            applyRepeatCount(animated);
            // From its first frame, with this view's repeat count: the target
            // starts it, but a drawable another view showed can still be
            // playing (start() does nothing then), and a repeat count set
            // during a play doesn't always apply to that play. Paused, it
            // waits on its first frame.
            animated.stop();
            super.onResourceReady(animated, transition);
            mAnimated = animated;
            if (mPaused) animated.stop();
        }

        // The target starts animations again when the Activity does: not a
        // paused one, and the view's own GIF continues its loop count (start()
        // would count again).
        @Override
        public void onStart() {
            if (mPaused) return;
            if (mOwnGif != null && getDrawable() == mOwnGif) {
                FastImageGif.resume(mOwnGif);
            } else {
                super.onStart();
            }
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
            if (mAnimated != null && mAnimated != resource) {
                mAnimated = null;
            }
        }
    }

    void applyLoopCount(GifDrawable gif) {
        gif.setLoopCount(mLoopCount == -1 ? GifDrawable.LOOP_INTRINSIC
                : mLoopCount == 0 ? GifDrawable.LOOP_FOREVER
                : mLoopCount);
    }

    // The loop prop for an animated WebP or AVIF: its repeat count is the
    // plays after the first. Not set, it plays as many times as the file says:
    // the repeat count it was decoded with, which an earlier loop (this
    // view's, or another view's that showed the same drawable) may have
    // changed.
    @RequiresApi(Build.VERSION_CODES.P)
    private void applyRepeatCount(AnimatedImageDrawable animated) {
        if (mLoopCount == -1) {
            Integer own = FastImageAnimated.repeatCount(animated);
            if (own != null) animated.setRepeatCount(own);
            return;
        }
        animated.setRepeatCount(mLoopCount == 0 ? AnimatedImageDrawable.REPEAT_INFINITE : mLoopCount - 1);
    }

    // resizeMode repeat: the image (a GIF's first frame) repeated from the
    // top-left at its own size, scaled down to fit the view if it's larger,
    // as React Native's Image does. The view fills with it (FIT_XY).
    private boolean mRepeat = false;

    // Glide crops or fits the bitmap for the scale type when it loads, so a
    // new resizeMode needs a reload to take effect (#762).
    public void setResizeMode(ScaleType scaleType, boolean repeat) {
        if (scaleType == getScaleType() && repeat == mRepeat) return;
        setScaleType(scaleType);
        mRepeat = repeat;
        mNeedsReload = true;
    }

    // Repeats what the view shows (the loaded image, and defaultSource).
    @Override
    public void setImageDrawable(@Nullable Drawable drawable) {
        super.setImageDrawable(mRepeat ? tiled(drawable) : drawable);
    }

    @Nullable
    private Drawable tiled(@Nullable Drawable drawable) {
        if (!(drawable instanceof BitmapDrawable)) return drawable;
        BitmapDrawable bitmapDrawable = (BitmapDrawable) drawable;
        if (bitmapDrawable.getTileModeX() == Shader.TileMode.REPEAT) return drawable;
        Bitmap bitmap = bitmapDrawable.getBitmap();
        if (bitmap == null) return drawable;
        // A copy of the drawable (not of the bitmap): Glide's may be shown by
        // other views too.
        BitmapDrawable tiled = new BitmapDrawable(getResources(), bitmap);
        tiled.setTileModeXY(Shader.TileMode.REPEAT, Shader.TileMode.REPEAT);
        if (mPixelated) tiled.setFilterBitmap(false);
        return tiled;
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

    // blurRadius, in pixels (0 is no blur). Part of the request (see
    // reblur for a change).
    private float mBlurRadius = 0;
    private boolean mBlurChanged = false;

    public void setBlurRadius(float blurRadius) {
        if (blurRadius == mBlurRadius) return;
        mBlurRadius = blurRadius;
        mBlurChanged = true;
    }

    // The scale type's options (what into() would apply), or none when
    // pixelated, and the blur. A blurred animated image shows its first frame,
    // as on iOS.
    private RequestOptions renderingOptions(Object model) {
        FastImageBlur blur = mBlurRadius > 0 ? new FastImageBlur(mBlurRadius, mRepeat ? null : getScaleType()) : null;
        RequestOptions options;
        if (mRepeat) {
            // Decoded at its own size, or scaled down to fit the view if it's
            // larger (not cropped or fitted for the scale type), and a GIF as
            // its first frame (tiled by setImageDrawable).
            options = new RequestOptions()
                    .downsample(new FastImageSourceSize.Capture(
                            mPixelated ? DownsampleStrategy.NONE : DownsampleStrategy.CENTER_INSIDE,
                            String.valueOf(model)))
                    .dontTransform()
                    .dontAnimate();
            if (blur != null) options = options.optionalTransform(blur);
        } else if (mPixelated) {
            // Decoded as it is, then scaled by the view without filtering (see
            // OwnGifTarget).
            options = new RequestOptions()
                    .downsample(new FastImageSourceSize.Capture(DownsampleStrategy.NONE, String.valueOf(model)))
                    .dontTransform();
            if (blur != null) options = options.optionalTransform(blur);
        } else {
            options = FastImageSourceSize.scaleTypeOptions(
                    getScaleType(), FastImageSourceSize.capture(getScaleType(), model), blur);
        }
        return blur != null ? options.dontAnimate() : options;
    }

    // The request the loading one was made from, before renderingOptions, and
    // its model, to make it again with another blur (see reblur).
    @Nullable
    private RequestBuilder<Drawable> mBaseRequest;
    @Nullable
    private Object mModel;
    // Whether the loading image has loaded or failed.
    private boolean mLoadEnded = false;
    // Set by reblur: the next load is the same one again, so it doesn't send
    // onLoadStart (it sends its other events, as the load it replaces would
    // have).
    private boolean mRestarting = false;

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
            // defaultSource (or nothing) while the next one loads, nor a fade
            // from it. Reload even if the source is the same.
            mShownRequest = null;
            endFade();
            mNeedsReload = true;
        }
    }

    // The loading image loaded (FastImageRequestListener).
    void onImageLoaded() {
        mLoadEnded = true;
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
        // During a fade, what the view showed was drawn at the old size: the
        // image fades in over nothing instead.
        if (mFadeFrom != null && (w != mFadeFrom.getWidth() || h != mFadeFrom.getHeight())) {
            mFadeFrom.recycle();
            mFadeFrom = null;
            invalidate();
        }
        if (!switchSourceIfResized()) reloadIfResized();
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
        Drawable meanwhile = shownCopy(shown);
        mLoadCount++;
        clearView(requestManager);
        RequestBuilder<Drawable> builder = shown.clone()
                .error(current.clone())
                .listener(new FastImageRequestListener(null, null, true, false));
        if (meanwhile == null) builder = builder.thumbnail(current);
        into(shown, builder, meanwhile);
    }

    // blurRadius changed, and nothing else that needs a reload: the image
    // that's showing, blurred again, with no events, as reloadForSize does: it's
    // decoded again from the cache and blurred on Glide's threads, and the view
    // keeps the current image until then (or if that fails). A load that
    // hasn't finished starts again with the new blur, without a second
    // onLoadStart. Nothing loaded (defaultSource, which isn't blurred, or
    // nothing): the next load has the new blur.
    @SuppressLint("CheckResult")
    private void reblur() {
        if (requestManager == null || mBaseRequest == null) return;
        RequestBuilder<Drawable> shown = mShownRequest;
        if (shown != null && shown == mLoadingRequest) {
            RequestBuilder<Drawable> request = mBaseRequest.clone().apply(renderingOptions(mModel));
            RequestBuilder<Drawable> current = fromCache(shown);
            Drawable meanwhile = shownCopy(shown);
            mLoadCount++;
            clearView(requestManager);
            RequestBuilder<Drawable> builder = request.clone()
                    .error(current.clone())
                    .listener(new FastImageRequestListener(null, null, true, false));
            if (meanwhile == null) builder = builder.thumbnail(current);
            into(request, builder, meanwhile);
        } else if (mLoadingRequest != null && !mLoadEnded) {
            mRestarting = true;
            mNeedsReload = true;
        }
    }

    // A copy of the image showing, for the view to show while the next one
    // loads, when it isn't in Glide's memory cache (source.memoryCache false):
    // a thumbnail of it would come from the disk, after the view has cleared,
    // and its own bitmap is reused once its request is cleared. Only the view
    // keeps the copy, until the next image replaces it. Null when the image
    // is in the memory cache, or isn't a bitmap (a GIF).
    @Nullable
    private Drawable shownCopy(RequestBuilder<Drawable> shown) {
        if (shown.isMemoryCacheable()) return null;
        Drawable drawable = getDrawable();
        if (!(drawable instanceof BitmapDrawable)) return null;
        Bitmap bitmap = ((BitmapDrawable) drawable).getBitmap();
        if (bitmap == null || bitmap.isRecycled()) return null;
        Bitmap.Config config = bitmap.getConfig();
        Bitmap copy = bitmap.copy(config != null ? config : Bitmap.Config.ARGB_8888, false);
        if (copy == null) return null;
        BitmapDrawable result = new BitmapDrawable(getResources(), copy);
        if (mPixelated) result.setFilterBitmap(false);
        return result;
    }

    // The shown image, from the cache only (never loaded again), at the size
    // it was loaded at: the key it's in Glide's memory cache under.
    @SuppressLint("CheckResult")
    private RequestBuilder<Drawable> fromCache(RequestBuilder<Drawable> shown) {
        // Never fades: it's the image the view showed.
        RequestBuilder<Drawable> request = shown.clone().onlyRetrieveFromCache(true)
                .transition(GenericTransitionOptions.<Drawable>withNoTransition());
        if (mShownWidth > 0 && mShownHeight > 0) request = request.override(mShownWidth, mShownHeight);
        return request;
    }

    // Starts loading the request (built by builder), showing meanwhile (if
    // not null) until it loads, and recording the size Glide loads it at. The size callback is added first, so it has the size by
    // the time the image loads, even from the memory cache.
    private void into(RequestBuilder<Drawable> request, RequestBuilder<Drawable> builder, @Nullable Drawable meanwhile) {
        final int load = mLoadCount;
        mLoadingRequest = request;
        mLoadEnded = false;
        mLoadingWidth = 0;
        mLoadingHeight = 0;
        OwnGifTarget target = new OwnGifTarget(meanwhile);
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

    // Loading the image that's showing again (at a new size, or with another
    // blur) failed: the view keeps showing it (FastImageRequestListener).
    void onQuietLoadFailed() {
        mLoadEnded = true;
    }

    // The loading image failed (FastImageRequestListener). Glide shows
    // defaultSource then, but not over a thumbnail: show it here, as iOS does.
    void onImageFailed(boolean hadThumbnail) {
        mLoadEnded = true;
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
        mManager = manager;
        mViewsForUrlsMap = viewsForUrlsMap;
        if (mBlurChanged && !mNeedsReload) {
            mBlurChanged = false;
            reblur();
        }
        if (!mNeedsReload)
            return;
        // Several sources: one is picked for the view's size, so a view that
        // hasn't been laid out yet loads after layout (props and layout are
        // applied in the same batch). A view that still has no size then
        // (e.g. one sized from onLoad) loads the largest source.
        if (mSources != null) {
            if (mWaitsForSize) return;
            if ((getWidth() <= 0 || getHeight() <= 0) && !mWaitedForSize) {
                mWaitsForSize = true;
                post(new Runnable() {
                    @Override
                    public void run() {
                        if (!mWaitsForSize) return;
                        mWaitsForSize = false;
                        mWaitedForSize = true;
                        onAfterUpdate(manager, requestManager, viewsForUrlsMap);
                    }
                });
                return;
            }
            mWaitedForSize = false;
            pickSource();
        }
        // Only reload for changes that affect the request (source,
        // defaultSource, resizeMode), not for every prop update.
        mNeedsReload = false;
        mBlurChanged = false;
        boolean switching = mSwitchesSource;
        mSwitchesSource = false;
        boolean restarting = mRestarting;
        mRestarting = false;
        mLoadCount++;
        // A fade in progress carries on, as on iOS: into the next image if it
        // shows at once, and a next image that fades starts from it.
        RequestBuilder<Drawable> shownRequest = mShownRequest;
        mShownRequest = null;
        mLoadingRequest = null;
        mBaseRequest = null;
        mModel = null;

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
            String error = "Invalid source: " + mSource;
            WritableMap event = new WritableNativeMap();
            event.putString("error", error);
            FastImageEvents.send(this, REACT_ON_ERROR_EVENT, event);
            FastImageEvents.sendLoadEnd(this, error);

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

        // Before the view clears (see shownCopy).
        Drawable meanwhile = shownRequest != null && imageSource != null ? shownCopy(shownRequest) : null;

        // Cancel existing request.
        this.glideUrl = glideUrl;
        clearView(requestManager);

        if (glideUrl != null) {
            FastImageOkHttpProgressGlideModule.expect(key, manager);
            // Locked: downloads read it from their own threads (see the
            // manager's onProgress).
            synchronized (viewsForUrlsMap) {
                List<FastImageViewWithUrl> viewsForKey = viewsForUrlsMap.get(key);
                if (viewsForKey != null && !viewsForKey.contains(this)) {
                    viewsForKey.add(this);
                } else if (viewsForKey == null) {
                    List<FastImageViewWithUrl> newViewsForKeys = new ArrayList<>(Collections.singletonList(this));
                    viewsForUrlsMap.put(key, newViewsForKeys);
                }
            }
        }

        if (imageSource != null && !restarting) {
            // This is an orphan even without a load/loadend when only loading a placeholder
            FastImageEvents.send(this, FastImageViewManager.REACT_ON_LOAD_START_EVENT);
        }

        if (requestManager != null) {
            // Records the image's own size when Glide decodes it, for onLoad.
            Object model = imageSource == null ? null : imageSource.getSourceForLoad();
            RequestBuilder<Drawable> base =
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
                                    .fallback(mDefaultSource)); // null will not be treated as error
            mBaseRequest = model == null ? null : base;
            mModel = model;
            // What into() would apply for the scale type, with the size
            // capture, for imageRendering, and the blur.
            RequestBuilder<Drawable> builder = base.clone().apply(renderingOptions(model));
            RequestBuilder<Drawable> request = builder.clone();

            if (model == null) meanwhile = null;
            boolean thumbnail = shownRequest != null && model != null && meanwhile == null;
            // After the clone: loading the image that's showing again (at a
            // new size, or with another blur) doesn't fade it in again. Over a
            // loaded image (a new source) only with betweenImages: otherwise it
            // replaces it at once, as Glide, Coil and Fresco fade an image in
            // from nothing and never between images.
            boolean replacing = shownRequest != null && model != null;
            if (mTransitionDuration > 0 && !switching && (!replacing || mTransitionBetweenImages)) {
                builder = builder.transition(DrawableTransitionOptions.with(
                        new FadeFactory(mTransitionDuration, mTransitionSkipOnCacheHit)));
            }
            if (thumbnail) {
                builder = builder.thumbnail(fromCache(shownRequest));
            }

            if (key != null)
                builder.listener(new FastImageRequestListener(key, imageSource, thumbnail, true));

            into(request, builder, meanwhile);
        }
    }

    // Removes this view from the list of views for its current url (used to send
    // progress events), which otherwise kept it, and its Activity, alive after
    // its source changed (#384). The url's progress listener is only forgotten
    // when no other view uses it.
    void untrackUrl(@Nonnull Map<String, List<FastImageViewWithUrl>> viewsForUrlsMap) {
        if (glideUrl == null) return;
        String key = glideUrl.toStringUrl();
        boolean unused;
        synchronized (viewsForUrlsMap) {
            List<FastImageViewWithUrl> viewsForKey = viewsForUrlsMap.get(key);
            if (viewsForKey != null) {
                viewsForKey.remove(this);
                if (viewsForKey.isEmpty()) viewsForUrlsMap.remove(key);
            }
            unused = viewsForKey == null || viewsForKey.isEmpty();
        }
        if (unused) {
            FastImageOkHttpProgressGlideModule.forget(key);
        }
        glideUrl = null;
    }

    public void clearView(@Nullable RequestManager requestManager) {
        // Glide keeps the view's request under its own tag id, not getTag().
        // Without a request this does nothing.
        if (requestManager != null) {
            requestManager.clear(this);
        }
    }
}
