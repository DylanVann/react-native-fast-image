package com.fastimage;

import static com.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.AnimatedImageDrawable;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewParent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.appcompat.widget.AppCompatImageView;
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat;

import com.bumptech.glide.GenericTransitionOptions;
import com.bumptech.glide.Priority;
import com.bumptech.glide.RequestBuilder;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.resource.bitmap.DownsampleStrategy;
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions;
import com.bumptech.glide.load.resource.gif.GifDrawable;
import com.bumptech.glide.request.Request;
import com.bumptech.glide.request.RequestOptions;
import com.bumptech.glide.request.target.CustomTarget;
import com.bumptech.glide.request.target.CustomViewTarget;
import com.bumptech.glide.request.target.DrawableImageViewTarget;
import com.bumptech.glide.request.target.SizeReadyCallback;
import com.bumptech.glide.request.transition.NoTransition;
import com.bumptech.glide.request.transition.Transition;
import com.bumptech.glide.request.transition.TransitionFactory;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.modules.i18nmanager.I18nUtil;
import com.facebook.react.touch.ReactHitSlopView;
import com.facebook.react.uimanager.StateWrapper;
import com.facebook.react.uimanager.BackgroundStyleApplicator;
import com.facebook.react.uimanager.PixelUtil;
import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.uimanager.ReactPointerEventsView;
import com.facebook.react.uimanager.style.LogicalEdge;

import java.util.Arrays;
import java.util.Objects;
import javax.annotation.Nonnull;

class FastImageViewWithUrl extends AppCompatImageView implements ReactPointerEventsView, ReactHitSlopView {
    private boolean mNeedsReload = false;
    private FastImageSourceProps mSource = null;
    // The `placeholder` prop.
    private Drawable mPlaceholder = null;

    // Null when the view was created in a destroyed Activity (nothing loads).
    @Nullable
    final RequestManager requestManager;

    public FastImageViewWithUrl(Context context, @Nullable RequestManager requestManager) {
        super(context);
        this.requestManager = requestManager;
        FastImageWork.init(context);
        // Borders inset the image: its padding is their widths (see
        // updateBorderPadding). An image larger than that (objectFit none) is
        // cropped to it, also when the view doesn't clip its content
        // (overflow visible).
        setCropToPadding(true);
    }

    // The image fills the view inside its borders, and padding doesn't inset
    // it, as on iOS: the view's padding is the border widths, resolved as
    // React Native draws the border (its BorderInsets, which isn't public).
    // React Native passes the layout's padding and borders together, so
    // FastImageViewManager.setPadding doesn't use them. Called when a border
    // width or the layout direction changes.
    void updateBorderPadding() {
        LogicalEdge left = LogicalEdge.START;
        LogicalEdge physicalLeft = LogicalEdge.LEFT;
        LogicalEdge right = LogicalEdge.END;
        LogicalEdge physicalRight = LogicalEdge.RIGHT;
        if (getLayoutDirection() == LAYOUT_DIRECTION_RTL) {
            left = LogicalEdge.END;
            right = LogicalEdge.START;
            if (I18nUtil.getInstance().doLeftAndRightSwapInRTL(getContext())) {
                physicalLeft = LogicalEdge.RIGHT;
                physicalRight = LogicalEdge.LEFT;
            }
        }
        int paddingLeft = borderWidth(left, physicalLeft, LogicalEdge.HORIZONTAL);
        int paddingTop = borderWidth(LogicalEdge.BLOCK_START, LogicalEdge.TOP, LogicalEdge.BLOCK, LogicalEdge.VERTICAL);
        int paddingRight = borderWidth(right, physicalRight, LogicalEdge.HORIZONTAL);
        int paddingBottom = borderWidth(LogicalEdge.BLOCK_END, LogicalEdge.BOTTOM, LogicalEdge.BLOCK, LogicalEdge.VERTICAL);
        // Compared with the padding last set here: getPaddingLeft() and the
        // others resolve the padding, which calls onRtlPropertiesChanged.
        if (paddingLeft == mBorderPaddingLeft && paddingTop == mBorderPaddingTop
                && paddingRight == mBorderPaddingRight && paddingBottom == mBorderPaddingBottom) {
            return;
        }
        mBorderPaddingLeft = paddingLeft;
        mBorderPaddingTop = paddingTop;
        mBorderPaddingRight = paddingRight;
        mBorderPaddingBottom = paddingBottom;
        setPadding(paddingLeft, paddingTop, paddingRight, paddingBottom);
        // The image was loaded for the box inside the borders: for the new
        // one, switch to the source that fits it (several sources) or load it
        // again, as when the view's size changes (the view's own size
        // doesn't).
        if (!switchSourceIfResized()) reloadIfResized();
    }

    // The padding updateBorderPadding last set. No initial values: it runs
    // during View's constructor, before field initializers would.
    private int mBorderPaddingLeft;
    private int mBorderPaddingTop;
    private int mBorderPaddingRight;
    private int mBorderPaddingBottom;

    // The first of these edges' border width that's set, else the one for
    // every edge, in pixels (rounded down, as React Native's layout does).
    private int borderWidth(LogicalEdge... edges) {
        Float width = null;
        for (LogicalEdge edge : edges) {
            width = BackgroundStyleApplicator.getBorderWidth(this, edge);
            if (width != null) break;
        }
        if (width == null) width = BackgroundStyleApplicator.getBorderWidth(this, LogicalEdge.ALL);
        return width == null ? 0 : (int) Math.floor(PixelUtil.toPixelFromDIP(width));
    }

    @Override
    public void onRtlPropertiesChanged(int layoutDirection) {
        super.onRtlPropertiesChanged(layoutDirection);
        updateBorderPadding();
    }

    // The View style props FastImage handles itself (FastImageViewManager):
    // it's a single native view, so they're the image's.
    private PointerEvents mPointerEvents = PointerEvents.AUTO;
    @Nullable
    private Rect mHitSlopRect;
    // overflow: hidden (FastImage's default) or scroll clip the image to the
    // padding box, with the border radius; visible only to the view.
    private boolean mOverflowVisible = false;
    // backfaceVisibility, as React Native's View does it: a view turned away
    // (rotateX or rotateY past 90°) is hidden with an opacity of 0.
    private boolean mBackfaceVisible = true;
    private float mBackfaceOpacity = 1f;

    @NonNull
    @Override
    public PointerEvents getPointerEvents() {
        return mPointerEvents;
    }

    void setPointerEvents(PointerEvents pointerEvents) {
        mPointerEvents = pointerEvents;
    }

    @Nullable
    @Override
    public Rect getHitSlopRect() {
        return mHitSlopRect;
    }

    void setHitSlopRect(@Nullable Rect hitSlopRect) {
        mHitSlopRect = hitSlopRect;
    }

    // `accessible` and `screenReaderFocusable`: TalkBack stops on the view
    // while either is true (as iOS's VoiceOver does for `accessible`). They
    // don't give it keyboard or D-pad focus, which an image with no action
    // would only be a dead stop for: that's `focusable`'s. Before API 28,
    // which has no screenReaderFocusable, the view's accessibility info says
    // it (as ViewCompat does), without an accessibility delegate: React
    // Native adds its own (for a role, state or testID) only to a view
    // without one.
    private boolean mAccessible = false;
    private boolean mScreenReaderFocusableProp = false;
    // Before API 28: whether either was true at the last change, to send an
    // event only when it changes.
    private boolean mScreenReaderFocusableBeforeP = false;

    void setAccessibleProp(boolean accessible) {
        mAccessible = accessible;
        updateScreenReaderFocusable();
    }

    void setScreenReaderFocusableProp(boolean screenReaderFocusable) {
        mScreenReaderFocusableProp = screenReaderFocusable;
        updateScreenReaderFocusable();
    }

    private void updateScreenReaderFocusable() {
        boolean screenReaderFocusable = mAccessible || mScreenReaderFocusableProp;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            setScreenReaderFocusable(screenReaderFocusable);
        } else if (screenReaderFocusable != mScreenReaderFocusableBeforeP) {
            mScreenReaderFocusableBeforeP = screenReaderFocusable;
            sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED);
        }
    }

    @Override
    public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
        super.onInitializeAccessibilityNodeInfo(info);
        // Only when true: false is the default, and writing it would add an
        // extras Bundle to every image's info.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P && (mAccessible || mScreenReaderFocusableProp)) {
            AccessibilityNodeInfoCompat.wrap(info).setScreenReaderFocusable(true);
        }
    }

    // `focusable` (null when not set): keyboard and D-pad focus while true
    // (which on Android makes it a TalkBack stop too), none while false (even
    // if clickable), and Android's default (focusable if clickable) without
    // it. (React Native's accessibility delegate, added for a role, state or
    // testID, replaces that default with whether the view was focusable
    // then, as it does for its View.)
    void setFocusableProp(@Nullable Boolean focusable) {
        if (focusable != null) {
            setFocusable(focusable);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            setFocusable(View.FOCUSABLE_AUTO);
        } else {
            setFocusable(false);
        }
    }

    void setOverflow(@Nullable String overflow) {
        mOverflowVisible = "visible".equals(overflow);
        invalidate();
    }

    void setOpacityIfPossible(float opacity) {
        mBackfaceOpacity = opacity;
        setBackfaceVisibilityDependantOpacity();
    }

    void setBackfaceVisibility(String backfaceVisibility) {
        mBackfaceVisible = "visible".equals(backfaceVisibility);
        setBackfaceVisibilityDependantOpacity();
    }

    void setBackfaceVisibilityDependantOpacity() {
        if (mBackfaceVisible) {
            setAlpha(mBackfaceOpacity);
            return;
        }
        float rotationX = getRotationX();
        float rotationY = getRotationY();
        boolean frontFaceVisible =
                rotationX >= -90f && rotationX < 90f && rotationY >= -90f && rotationY < 90f;
        setAlpha(frontFaceVisible ? mBackfaceOpacity : 0f);
    }

    // As React Native's Image: opacity applies to the view and its border and
    // background as one, without an offscreen layer.
    @Override
    public boolean hasOverlappingRendering() {
        return false;
    }

    // The `source` prop: one source, or several (sizes of one image), each
    // with its thumbhash or blurDataUri if it has one. Only a change besides
    // those loads again: a new thumbhash for the same image (e.g. one that
    // arrives later) shows at once (see updatePlaceholder).
    public void setSource(@Nullable FastImageSourceProps[] sources) {
        boolean same = mHasSource && Arrays.equals(sources, mAllSources);
        mAllSources = sources;
        if (!same) {
            mHasSource = true;
            mNeedsReload = true;
            mSourceIndex = -1;
            if (severalSources() == null) mSource = sources != null && sources.length == 1 ? sources[0] : null;
        }
        updatePlaceholder();
    }

    // The `source` prop's sources (with their latest placeholders), and
    // whether it has been set.
    @Nullable
    private FastImageSourceProps[] mAllSources = null;
    private boolean mHasSource = false;

    // Several sources (2 or more) of the same image at different sizes, or
    // null: the view loads the one whose size is closest to its own.
    @Nullable
    private FastImageSourceProps[] severalSources() {
        return mAllSources != null && mAllSources.length > 1 ? mAllSources : null;
    }

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

    // The box the image is drawn in: the view inside its padding, which is the
    // border widths (see updateBorderPadding).
    private int contentWidth() {
        return getWidth() - getPaddingLeft() - getPaddingRight();
    }

    private int contentHeight() {
        return getHeight() - getPaddingTop() - getPaddingBottom();
    }

    // The box inside the borders, where a side the style leaves open
    // (autoSize) is 0 until an image has loaded (the layout has no padding,
    // see FastImageViewComponentDescriptor). The view's size and its borders
    // are floored to whole pixels apart, so a side that's only borders can be
    // a pixel inside them: less than 2 counts as 0.
    private int layoutContentWidth() {
        int width = contentWidth();
        return width < 2 ? 0 : width;
    }

    private int layoutContentHeight() {
        int height = contentHeight();
        return height < 2 ? 0 : height;
    }

    // Whether the layout has only a width or a height so far, the other being
    // one the style leaves open (autoSize), and doesn't have an image's size
    // yet: that side follows the image, whose shape isn't known yet.
    private boolean laysOutOneSide() {
        if (imageLaidOut()) return false;
        int width = layoutContentWidth();
        int height = layoutContentHeight();
        if (width > 0 && height <= 0) return (mAutoSize & AUTO_HEIGHT) != 0;
        if (height > 0 && width <= 0) return (mAutoSize & AUTO_WIDTH) != 0;
        return false;
    }

    // Of several sources, the index of the one whose size in pixels (width ×
    // height × scale²) is closest to the box the image is drawn in (by pixel
    // count), or of the largest while it has no size (e.g. a view sized from
    // onLoad). With only a width or a height laid out (laysOutOneSide), the
    // box the view gets at each source's shape.
    private int sourceIndexForSize() {
        FastImageSourceProps[] sources = severalSources();
        if (sources == null) return -1;
        double width = Math.max(0, contentWidth());
        double height = Math.max(0, contentHeight());
        boolean oneSide = laysOutOneSide();
        boolean byWidth = layoutContentWidth() > 0;
        int best = -1;
        double bestFit = Double.MAX_VALUE;
        for (int i = 0; i < sources.length; i++) {
            FastImageSourceProps source = sources[i];
            if (source == null) continue;
            double pixels = source.width * source.height * source.scale * source.scale;
            double viewPixels = width * height;
            if (oneSide && source.width > 0 && source.height > 0) {
                viewPixels = byWidth
                        ? width * width * source.height / source.width
                        : height * height * source.width / source.height;
            }
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
        FastImageSourceProps[] sources = severalSources();
        mSource = mSourceIndex >= 0 && sources != null ? sources[mSourceIndex] : null;
    }

    // Several sources: another one fits the view's new size (or the box inside
    // its new borders) better. Loads it (after layout), keeping the image
    // showing until then, without a fade.
    private boolean switchSourceIfResized() {
        if (severalSources() == null || mNeedsReload || mWaitsForSize || contentWidth() <= 0 || contentHeight() <= 0
                || mManager == null || sourceIndexForSize() == mSourceIndex) {
            return false;
        }
        mSwitchesSource = true;
        mNeedsReload = true;
        post(new Runnable() {
            @Override
            public void run() {
                if (mNeedsReload && mManager != null) onAfterUpdate(mManager, requestManager);
            }
        });
        return true;
    }

    // Loads the image again, as a new source would, keeping the image showing
    // until then (the ref's reload()). Before the first props there's nothing
    // to load yet.
    void reload() {
        if (mManager == null) return;
        mNeedsReload = true;
        onAfterUpdate(mManager, requestManager);
    }

    // Shows at once, as a new source placeholder does (see updatePlaceholder),
    // without loading the image again.
    public void setPlaceholder(@Nullable Drawable placeholder) {
        mPlaceholder = placeholder;
        updatePlaceholder();
    }

    // `placeholder` as a thumbhash or blurDataUri: shows for the sources
    // without their own.
    @Nullable
    private String mPlaceholderHash = null;
    // What shows while the image loads and if it fails: the picked source's
    // ThumbHash or blurDataUri decoded (FastImageThumbHash), or the placeholder
    // prop. FastImage's own drawable either way, which Glide doesn't recycle.
    @Nullable
    private Drawable mShownPlaceholder = null;
    // The source placeholder mShownPlaceholder shows, or null for the
    // placeholder prop.
    @Nullable
    private String mPlaceholderKey = null;
    // The last source placeholder that failed to decode, so it isn't decoded
    // again on every update.
    @Nullable
    private String mInvalidPlaceholder = null;

    public void setPlaceholderHash(@Nullable String hash) {
        if (Objects.equals(hash, mPlaceholderHash)) return;
        mPlaceholderHash = hash;
        updatePlaceholder();
    }

    // `placeholder` as a url (a source): loaded apart from the image, at the
    // most urgent priority, as it only helps if it comes before the image (or
    // only from Glide's caches, with cache cacheOnly).
    // Once it has, a copy shows instead of the other placeholders: FastImage's
    // own drawable, which Glide doesn't recycle, so a fade can still draw it
    // after its request is cleared. A failure shows nothing more.
    @Nullable
    private FastImageSourceProps mPlaceholderSource = null;
    @Nullable
    private Drawable mUrlPlaceholder = null;
    @Nullable
    private CustomTarget<Drawable> mUrlPlaceholderTarget = null;

    // Its load waits for the view's size (see startUrlPlaceholderLoad).
    private boolean mUrlPlaceholderWaitsForSize = false;

    public void setPlaceholderSource(@Nullable FastImageSourceProps source) {
        if (source == null && mPlaceholderSource == null) return;
        mPlaceholderSource = source;
        clearUrlPlaceholderTarget();
        mUrlPlaceholderWaitsForSize = false;
        mUrlPlaceholder = null;
        updatePlaceholder();
        scheduleUrlPlaceholderLoad();
    }

    // Starts placeholderSource's load once the current callbacks have run: an
    // image from the memory cache has shown by then, and needs none.
    private void scheduleUrlPlaceholderLoad() {
        post(new Runnable() {
            @Override
            public void run() {
                startUrlPlaceholderLoad();
            }
        });
    }

    // Loads placeholderSource's image while the image loads (or after it
    // failed), at the view's size, once it has one: not if the image showed,
    // or it's already loaded or loading.
    private void startUrlPlaceholderLoad() {
        if (requestManager == null || mDropped || mUrlPlaceholder != null || mUrlPlaceholderTarget != null
                || mPlaceholderSource == null || !mPlaceholderSource.hasUri()) return;
        if (mLoadEnded && mShownRequest != null) return;
        if (getWidth() <= 0 || getHeight() <= 0) {
            mUrlPlaceholderWaitsForSize = true;
            return;
        }
        FastImageSource imageSource = FastImageViewConverter.getImageSource(getContext(), mPlaceholderSource);
        if (imageSource == null) return;
        int[] box = FastImageSourceSize.box(getWidth(), getHeight());
        CustomTarget<Drawable> target = new CustomTarget<Drawable>(box[0], box[1]) {
            @Override
            public void onResourceReady(@NonNull Drawable resource, @Nullable Transition<? super Drawable> transition) {
                if (this != mUrlPlaceholderTarget) return;
                mUrlPlaceholder = ownCopy(resource);
                updatePlaceholder();
                // With the copy, Glide's can go back to its pools (a load
                // can't be cleared from its own callback).
                final CustomTarget<Drawable> done = this;
                post(new Runnable() {
                    @Override
                    public void run() {
                        if (requestManager != null) requestManager.clear(done);
                    }
                });
            }

            @Override
            public void onLoadCleared(@Nullable Drawable placeholder) {
            }
        };
        mUrlPlaceholderTarget = target;
        if (FastImageWork.enabled()) FastImageWork.record("load", imageSource.getSourceForLoad(), "url-placeholder");
        requestManager
                .load(imageSource.getSourceForLoad())
                .apply(FastImageViewConverter.getOptions(getContext(), imageSource, mPlaceholderSource)
                        .priority(Priority.IMMEDIATE)
                        // Copied on a software canvas (see ownCopy).
                        .disallowHardwareConfig())
                .into(target);
    }

    private void clearUrlPlaceholderTarget() {
        if (mUrlPlaceholderTarget != null && requestManager != null) requestManager.clear(mUrlPlaceholderTarget);
        mUrlPlaceholderTarget = null;
    }

    // A bitmap of the drawable (an animated one's first frame), scaled up
    // smoothly as the other placeholders are, or null for one with no size.
    @Nullable
    private Drawable ownCopy(Drawable drawable) {
        int width = drawable.getIntrinsicWidth();
        int height = drawable.getIntrinsicHeight();
        if (width <= 0 || height <= 0) return null;
        try {
            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            Drawable copy = drawable.getConstantState() != null ? drawable.getConstantState().newDrawable().mutate() : drawable;
            copy.setBounds(0, 0, width, height);
            copy.draw(canvas);
            BitmapDrawable own = new BitmapDrawable(getResources(), bitmap);
            own.setFilterBitmap(true);
            return own;
        } catch (OutOfMemoryError | IllegalStateException e) {
            // As startFade: out of memory, or a hardware bitmap after all.
            return null;
        }
    }

    // The picked source's ThumbHash or blurDataUri, or `placeholder`'s, or
    // null.
    @Nullable
    private String pickedSourcePlaceholder() {
        int index = severalSources() == null ? 0 : mSourceIndex;
        // None until one is picked.
        if (index < 0) return null;
        FastImageSourceProps source = mAllSources != null && index < mAllSources.length ? mAllSources[index] : null;
        String key = source != null ? source.placeholder : null;
        return key != null ? key : mPlaceholderHash;
    }

    // Sets mShownPlaceholder for the picked source. A view showing the previous
    // placeholder shows the new one at once, without reloading the image.
    private void updatePlaceholder() {
        String key = pickedSourcePlaceholder();
        Drawable placeholder;
        if (key != null && key.equals(mPlaceholderKey)) {
            placeholder = mShownPlaceholder;
        } else if (key != null && key.equals(mInvalidPlaceholder)) {
            placeholder = mPlaceholder;
            mPlaceholderKey = null;
        } else {
            Bitmap bitmap = FastImageThumbHash.placeholder(key);
            if (bitmap != null) {
                BitmapDrawable drawable = new BitmapDrawable(getResources(), bitmap);
                // Scaled up smoothly, as a blurred preview (also with
                // imageRendering pixelated, which is for the image).
                drawable.setFilterBitmap(true);
                placeholder = drawable;
                mPlaceholderKey = key;
            } else {
                placeholder = mPlaceholder;
                mPlaceholderKey = null;
                mInvalidPlaceholder = key;
            }
        }
        // placeholderSource's image, once it has loaded, shows instead.
        if (mUrlPlaceholder != null) placeholder = mUrlPlaceholder;
        if (placeholder == mShownPlaceholder) return;
        boolean showing = mShowsPlaceholder;
        mShownPlaceholder = placeholder;
        // Also one that arrives while the view shows nothing (no placeholder
        // while the image loads, or after it failed): never over an image.
        Drawable shown = getDrawable();
        boolean showsNothing = shown == null || shown == FastImageViewConverter.TRANSPARENT_DRAWABLE;
        if (showing || (placeholder != null && showsNothing)) setImageDrawable(placeholder);
    }

    // The events JS has a handler for (the handledEvents prop): the view only
    // sends those (see FastImageEvents).
    int handledEvents;

    boolean handles(int events) {
        return (handledEvents & events) != 0;
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
    // Progress (see FastImageViewManager.onDownloadProgress): the url its
    // current load downloads (null for a local image, and once the load has
    // ended), the progress key the view gets progress for (the loading url's,
    // while it has an onProgress), the last step downloads reported before the
    // load started, and the fraction the load has had.
    @Nullable
    private GlideUrl mLoadingUrl;
    @Nullable
    private String mTrackedKey;
    private long mProgressSince;
    private double mProgressFraction;
    // Dropped by React (FastImageViewManager.onDropViewInstance): reloads it
    // posted to itself don't load anything, or track progress, any more.
    private boolean mDropped = false;

    void setHandledEvents(int events) {
        handledEvents = events;
        updateProgressTracking();
    }

    // The load ended (onLoad or onError), or the view no longer loads its
    // source: no more progress, and the progress map no longer keeps the view
    // (and its Activity) alive (#384).
    void endProgress() {
        mLoadingUrl = null;
        updateProgressTracking();
    }

    void drop() {
        mDropped = true;
        cancelSizeWait();
        // Its shadow node is gone: a load that still finishes doesn't set
        // its state.
        mStateWrapper = null;
        // A dropped view can still be drawn: react-native-screens keeps a
        // popped screen's views on screen for its exit animation
        // (startViewTransition), and React Native drops them as it starts.
        // Clearing the request puts the placeholder back (or nothing), so a
        // view still attached that shows an image clears it once it's
        // detached (onDetachedFromWindow, #1385). Its bitmap can't be kept
        // after a clear instead: Glide can reuse it. One that shows only its
        // placeholder clears now, which cancels its load.
        if (!isAttachedToWindow() || mShowsPlaceholder || getDrawable() == null) {
            clearView(requestManager);
        }
        clearUrlPlaceholderTarget();
        endProgress();
    }

    // Whether a step a download reported is for the current load, and doesn't
    // go back: one reported before it started is for an earlier load, e.g. of
    // the same url before objectFit changed, posted while that load still
    // ran, and one below what the load has had is from another download of
    // the key (e.g. one that started after the first had ended).
    boolean takesProgress(long step, long loaded, long total) {
        if (step <= mProgressSince) return false;
        double fraction = (double) loaded / total;
        if (fraction < mProgressFraction) return false;
        mProgressFraction = fraction;
        return true;
    }

    private void updateProgressTracking() {
        String key = handles(FastImageEvents.PROGRESS) && mLoadingUrl != null && !mDropped
                ? FastImageSharedDownloads.key(mLoadingUrl)
                : null;
        if (key == null ? mTrackedKey == null : key.equals(mTrackedKey)) return;
        if (mTrackedKey != null) FastImageViewManager.untrackProgress(mTrackedKey, this);
        mTrackedKey = key;
        if (key != null) FastImageViewManager.trackProgress(key, this);
    }

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
    // too with 'all'. Downloads, local files and bundled images fade. A `web`
    // image isn't kept in the memory cache, so one from its HTTP cache
    // without the network (a disk cache hit, see FastImageSharedDownloads)
    // counts as one from memory: shown again, e.g. in a list scrolled back
    // up, it shows at once.
    private final class FadeFactory implements TransitionFactory<Drawable> {
        private final int duration;
        private final String skipOnCacheHit;
        private final boolean webCache;

        FadeFactory(int duration, String skipOnCacheHit, boolean webCache) {
            this.duration = duration;
            this.skipOnCacheHit = skipOnCacheHit;
            this.webCache = webCache;
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
            if (webCache && dataSource == DataSource.DATA_DISK_CACHE) return true;
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
    // At most the size Android draws a bitmap at (see
    // FastImageSourceSize.box), stretched to the view.
    @Nullable
    private Bitmap mFadeFrom;
    private final Rect mFadeFromBounds = new Rect();
    // Or, instead of a copy, the placeholder prop the view showed, with the
    // matrix it drew it with: FastImage's own drawable, which Glide doesn't
    // recycle, so it's drawn again as it was, rather than copied into a
    // bitmap the size of the view for every image that fades in over it.
    @Nullable
    private Drawable mFadeFromDrawable;
    @Nullable
    private Matrix mFadeFromMatrix;
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
        Drawable fromDrawable = null;
        Matrix fromMatrix = null;
        Drawable shown = getDrawable();
        if (shown != null && mShowsPlaceholder && mFade == null) {
            // Its own state, so its alpha (see drawFadeFrom) is only its own.
            fromDrawable = shown.mutate();
            fromMatrix = new Matrix(getImageMatrix());
        } else if (shown != null) {
            try {
                int[] box = FastImageSourceSize.box(width, height);
                from = Bitmap.createBitmap(box[0], box[1], Bitmap.Config.ARGB_8888);
                if (FastImageWork.enabled()) FastImageWork.record("snapshot", mModel, box[0] + "x" + box[1]);
                Canvas canvas = new Canvas(from);
                canvas.scale((float) box[0] / width, (float) box[1] / height);
                onDraw(canvas);
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
        mFadeFromDrawable = fromDrawable;
        mFadeFromMatrix = fromMatrix;
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
        mFadeFromDrawable = null;
        mFadeFromMatrix = null;
        mFadeProgress = 1f;
        invalidate();
    }

    // Draws the placeholder prop the view showed when the fade started (with
    // `alpha`), as ImageView draws its drawable: inside the padding
    // (cropToPadding), with the matrix it had then.
    private void drawFadeFrom(Canvas canvas, Drawable drawable, int alpha) {
        int count = canvas.save();
        if (getCropToPadding()) {
            int scrollX = getScrollX();
            int scrollY = getScrollY();
            canvas.clipRect(scrollX + getPaddingLeft(), scrollY + getPaddingTop(),
                    scrollX + getWidth() - getPaddingRight(), scrollY + getHeight() - getPaddingBottom());
        }
        canvas.translate(getPaddingLeft(), getPaddingTop());
        if (mFadeFromMatrix != null) canvas.concat(mFadeFromMatrix);
        if (alpha == 255) {
            drawable.draw(canvas);
        } else if (drawable instanceof BitmapDrawable || drawable instanceof GradientDrawable) {
            // A bitmap or a shape applies its alpha as it's drawn.
            int previous = drawable.getAlpha();
            drawable.setAlpha(alpha);
            drawable.draw(canvas);
            drawable.setAlpha(previous);
        } else {
            // Others through a layer: a vector drawable, or an animated GIF or
            // WebP resource (an AnimatedImageDrawable on Android 9+), keeps
            // its alpha as a property the RenderThread reads when it syncs
            // the frame, after it's set back here.
            int layer = canvas.saveLayerAlpha(null, alpha);
            drawable.draw(canvas);
            canvas.restoreToCount(layer);
        }
        canvas.restoreToCount(count);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        // Nothing while a side the style leaves open is only borders (a pixel
        // inside them can be left): the image shows once the view has its
        // shape.
        if (laysOutOneSide()) return;
        // Clipped as React Native's Image (and the View it used to be in): to
        // the padding box, with the border radius, unless overflow is visible.
        int saved = canvas.save();
        if (mOverflowVisible) {
            Rect bounds = new Rect();
            getDrawingRect(bounds);
            canvas.clipRect(bounds);
        } else {
            BackgroundStyleApplicator.clipToPaddingBox(this, canvas);
        }
        try {
            drawImage(canvas);
        } finally {
            canvas.restoreToCount(saved);
        }
    }

    private void drawImage(Canvas canvas) {
        if (mFade == null) {
            super.onDraw(canvas);
            return;
        }
        int width = getWidth();
        int height = getHeight();
        int alpha = Math.round(255 * mFadeProgress);
        if (drawFadeWithoutLayers(canvas, alpha)) return;
        if (mFadeFrom == null && mFadeFromDrawable == null) {
            // Fading in over nothing: one layer.
            int count = canvas.saveLayerAlpha(0, 0, width, height, alpha);
            super.onDraw(canvas);
            canvas.restoreToCount(count);
            return;
        }
        // Two layers, which add up to the cross-dissolve whatever the image's
        // transparency.
        int count = canvas.saveLayer(0, 0, width, height, null);
        if (mFadeFromDrawable != null) {
            drawFadeFrom(canvas, mFadeFromDrawable, 255 - alpha);
        } else {
            mFadeFromPaint.setAlpha(255 - alpha);
            mFadeFromBounds.set(0, 0, getWidth(), getHeight());
            canvas.drawBitmap(mFadeFrom, null, mFadeFromBounds, mFadeFromPaint);
        }
        mFadeInPaint.setAlpha(alpha);
        canvas.saveLayer(0, 0, width, height, mFadeInPaint);
        super.onDraw(canvas);
        canvas.restoreToCount(count);
    }

    // Draws the fade without layers, each of which is a buffer drawn again
    // every frame, when the image takes an alpha in one drawing (a bitmap or
    // GIF): over nothing, the image with the fade's alpha; over
    // what the view showed, if the image is opaque and covers it, that and
    // the image over it with the alpha, which is the same cross-dissolve,
    // from * (1 - t) + image * t: photos without transparency, most images.
    // Over what the view showed, only when nothing draws the view with an
    // alpha (see drawnWithAlpha).
    // Not an animated WebP or AVIF (an AnimatedImageDrawable): its alpha is a
    // property the RenderThread reads when it syncs the frame, after it's set
    // back here, so it would show without the fade.
    // Returns false, having drawn nothing, otherwise.
    private boolean drawFadeWithoutLayers(Canvas canvas, int alpha) {
        Drawable image = getDrawable();
        boolean drawsOnce = image instanceof BitmapDrawable || image instanceof GifDrawable;
        if (!drawsOnce) return false;
        boolean over = mFadeFrom != null || mFadeFromDrawable != null;
        if (over && (!coversOpaquely(image) || drawnWithAlpha())) return false;
        if (mFadeFromDrawable != null) {
            drawFadeFrom(canvas, mFadeFromDrawable, 255);
        } else if (mFadeFrom != null) {
            mFadeFromPaint.setAlpha(255);
            mFadeFromBounds.set(0, 0, getWidth(), getHeight());
            canvas.drawBitmap(mFadeFrom, null, mFadeFromBounds, mFadeFromPaint);
        }
        // Without the drawable asking the view to draw again.
        Drawable.Callback callback = image.getCallback();
        image.setCallback(null);
        int previous = image.getAlpha();
        image.setAlpha(alpha);
        super.onDraw(canvas);
        image.setAlpha(previous);
        image.setCallback(callback);
        return true;
    }

    // Whether the view, or a view it's in, has an alpha (an opacity), or a
    // view animation (android.view.animation, e.g. an AlphaAnimation), which
    // can apply one without changing the view's.
    // React Native's View (unless it has needsOffscreenAlphaCompositing) and
    // an ImageView without a background have no layer of their own for it,
    // so it applies to each drawing in them: what the view showed, drawn at
    // full strength, would show through the image over it until the fade
    // ends. The layers are right with any alpha: it applies to the
    // cross-dissolve they add up to. Checked on every frame of the fade, as
    // an opacity can change during it.
    // Not the transition alpha, which only Android's Transition fades
    // (android.transition.Fade) set: getTransitionAlpha is public from API 29
    // only (hidden on Android 7 to 9). React Native's opacity, Animated,
    // LayoutAnimation and Reanimated set the view's alpha, and
    // react-native-screens' fragment animations run on a container with a
    // layer of its own.
    private boolean drawnWithAlpha() {
        View view = this;
        while (true) {
            if (view.getAlpha() < 1 || view.getAnimation() != null) {
                return true;
            }
            ViewParent parent = view.getParent();
            if (!(parent instanceof View)) return false;
            view = (View) parent;
        }
    }

    private final RectF mFadeImageRect = new RectF();

    // Whether the image, as the view draws it, is opaque and covers all of
    // what the view showed: inside the padding (cropToPadding), or the whole
    // view.
    private boolean coversOpaquely(Drawable image) {
        if (image.getOpacity() != PixelFormat.OPAQUE || getColorFilter() != null) return false;
        mFadeImageRect.set(image.getBounds());
        getImageMatrix().mapRect(mFadeImageRect);
        mFadeImageRect.offset(getPaddingLeft(), getPaddingTop());
        boolean crop = getCropToPadding();
        float left = crop ? getPaddingLeft() : 0;
        float top = crop ? getPaddingTop() : 0;
        float right = getWidth() - (crop ? getPaddingRight() : 0);
        float bottom = getHeight() - (crop ? getPaddingBottom() : 0);
        // Within float error only: an edge half a pixel in leaves a row or
        // column of pixels uncovered (which one depends on how it's
        // rasterized; e.g. contain, with the image a pixel shorter than the
        // view), where what the view showed would stay until the fade ends.
        float error = 0.01f;
        return mFadeImageRect.left <= left + error && mFadeImageRect.top <= top + error
                && mFadeImageRect.right >= right - error && mFadeImageRect.bottom >= bottom - error;
    }

    @Override
    protected void onDetachedFromWindow() {
        endFade();
        super.onDetachedFromWindow();
        // Dropped while it was still drawn (see drop).
        if (mDropped) clearView(requestManager);
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

    // Passes on a size capped by FastImageSourceSize.box. Equal to another
    // for the same callback, so the target can remove it.
    private final class CappedSize implements SizeReadyCallback {
        private final SizeReadyCallback cb;

        CappedSize(SizeReadyCallback cb) {
            this.cb = cb;
        }

        @Override
        public void onSizeReady(int width, int height) {
            // Only a width or a height laid out so far, or neither, with
            // borders (laysOutOneSide, laysOutNoSide): the image is loaded for
            // the sides laid out. With neither, each is the screen's length,
            // as Glide asks for a side that's 0. With one, the other is as
            // long as the box allows (FastImageSourceSize.MAX_PIXELS), so an
            // image taller than the screen at the view's width (or wider at
            // its height) is decoded for the size the view gets, not
            // narrower and then again.
            // The same while the view has the previous image's shape (e.g. a
            // recycled list cell; see laysOutPreviousImage): the open side
            // will follow the new image, so it's loaded for the one the style
            // sets, as on its first load, not for the previous image's box.
            int previous = laysOutPreviousImage() && followsImage() ? mAutoSize : 0;
            if (laysOutOneSide() || laysOutNoSide() || laidOutWithoutSize() || previous == AUTO_WIDTH
                    || previous == AUTO_HEIGHT) {
                DisplayMetrics metrics = getResources().getDisplayMetrics();
                int screen = Math.max(metrics.widthPixels, metrics.heightPixels);
                boolean byWidth = layoutContentWidth() > 0 && width > 0 && previous != AUTO_WIDTH;
                boolean byHeight = layoutContentHeight() > 0 && height > 0 && previous != AUTO_HEIGHT;
                if (!byWidth) width = byHeight ? (int) (FastImageSourceSize.MAX_PIXELS / height) : screen;
                if (!byHeight) height = byWidth ? (int) (FastImageSourceSize.MAX_PIXELS / width) : screen;
            }
            int[] box = FastImageSourceSize.box(width, height);
            cb.onSizeReady(box[0], box[1]);
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof CappedSize && ((CappedSize) o).cb.equals(cb);
        }

        @Override
        public int hashCode() {
            return cb.hashCode();
        }
    }

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

        // The view's size, capped (FastImageSourceSize.box).
        @Override
        public void getSize(@NonNull SizeReadyCallback cb) {
            super.getSize(new CappedSize(cb));
        }

        @Override
        public void removeCallback(@NonNull SizeReadyCallback cb) {
            super.removeCallback(new CappedSize(cb));
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
                        getContext(), (GifDrawable) resource, mLoadingWidth, mLoadingHeight, !mDownsample);
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

    // The scale type for objectFit, which Glide decodes the image for and the
    // blur scales with. For scale-down (CENTER_INSIDE) and none (CENTER), and
    // contain and cover with an objectPosition other than the center, the
    // view is MATRIX: it lays the image out itself (see updateImageMatrix).
    // Starts as ImageView's.
    private ScaleType mFitScaleType = ScaleType.FIT_CENTER;

    // The scale type the image on screen is laid out for, and whether it was
    // downsampled or pixelated (see applyObjectFit).
    private ScaleType mLayoutScaleType = ScaleType.FIT_CENTER;
    private boolean mLayoutDownsampled = true;
    private boolean mLayoutPixelated = false;

    // Glide crops or fits the bitmap for the scale type when it loads, so a
    // new objectFit needs a reload to take effect (#762): the image that's
    // showing, loaded again quietly (see reblur), as for a new blurRadius,
    // without the load events, as on iOS.
    public void setObjectFit(ScaleType scaleType) {
        if (scaleType == mFitScaleType) return;
        mFitScaleType = scaleType;
        mFitChanged = true;
        // A loaded image on screen was cropped or fitted for the old scale
        // type: it keeps its layout until the image for the new one is ready
        // (onImageLoaded), or the load fails. Laid out for the new one, a
        // cover crop would be stretched to the image's own size.
        if (mShownRequest == null) applyObjectFit();
    }

    // Lays the view out for objectFit.
    private void applyObjectFit() {
        mLayoutScaleType = mFitScaleType;
        mLayoutDownsampled = mDownsample;
        mLayoutPixelated = mPixelated;
        updateScaleType();
    }

    // objectPosition: on each axis the image's left or top edge is at
    // (view - image) * fraction + offset (offsets in pixels).
    private float mPositionX = 0.5f;
    private float mPositionXOffset = 0;
    private float mPositionY = 0.5f;
    private float mPositionYOffset = 0;

    public void setObjectPositionX(float x) {
        if (x == mPositionX) return;
        mPositionX = x;
        onPositionChanged();
    }

    public void setObjectPositionXOffset(float xOffset) {
        if (xOffset == mPositionXOffset) return;
        mPositionXOffset = xOffset;
        onPositionChanged();
    }

    public void setObjectPositionY(float y) {
        if (y == mPositionY) return;
        mPositionY = y;
        onPositionChanged();
    }

    public void setObjectPositionYOffset(float yOffset) {
        if (yOffset == mPositionYOffset) return;
        mPositionYOffset = yOffset;
        onPositionChanged();
    }

    // Glide crops a cover image at the position (FastImageCrop): the image on
    // screen is loaded again for it, quietly (see reblur), and until that's
    // ready it stays as it was cropped (see shownCropped). Others, and cover
    // images Glide doesn't crop, are only laid out at it, right away.
    private void onPositionChanged() {
        if (mFitScaleType == ScaleType.CENTER_CROP && !mPixelated && mDownsample) {
            mCropChanged = true;
        }
        updateScaleType();
    }

    private boolean isCentered() {
        return mPositionX == 0.5f && mPositionY == 0.5f && mPositionXOffset == 0 && mPositionYOffset == 0;
    }

    // Where Glide crops a cover image: CenterCrop at the center (as without
    // objectPosition), FastImageCrop elsewhere.
    @Nullable
    private FastImageCrop positionedCrop() {
        return mFitScaleType == ScaleType.CENTER_CROP && !isCentered() && !mPixelated && mDownsample
                ? new FastImageCrop(mPositionX, mPositionXOffset, mPositionY, mPositionYOffset)
                : null;
    }

    // Whether the image on screen is a cover one Glide cropped to what the view
    // shows (CenterCrop or FastImageCrop, at the position it was loaded for).
    // Glide can't crop animated WebPs and AVIFs, APNGs and the placeholder
    // prop, and doesn't crop pixelated images or ones decoded at full size
    // (downsample false).
    private boolean shownCropped(Drawable drawable) {
        return mLayoutScaleType == ScaleType.CENTER_CROP && !mLayoutPixelated && mLayoutDownsampled
                && !mShownUnsized && !mShownUncropped
                && drawable != mShownPlaceholder
                && (drawable instanceof BitmapDrawable || drawable instanceof GifDrawable);
    }

    // ImageView's own scale type for the layout, or MATRIX where the view lays
    // the image out itself (updateImageMatrix): scale-down and none at their
    // size in dp, and contain and cover at a position other than the center.
    private void updateScaleType() {
        ScaleType type = mLayoutScaleType;
        boolean ownSize = type == ScaleType.CENTER_INSIDE || type == ScaleType.CENTER;
        boolean positioned = !isCentered()
                && (ownSize || type == ScaleType.FIT_CENTER || type == ScaleType.CENTER_CROP);
        boolean laidOut = ownSize || positioned;
        setScaleType(laidOut ? ScaleType.MATRIX : type);
        updateImageMatrix();
    }

    // Whether the view shows its placeholder (the placeholder prop, or a
    // source's): FastImage's own drawable, which Glide doesn't recycle (see
    // startFade).
    private boolean mShowsPlaceholder = false;

    @Override
    public void setImageDrawable(@Nullable Drawable drawable) {
        mShowsPlaceholder = drawable != null && drawable == mShownPlaceholder;
        super.setImageDrawable(drawable);
        updateImageMatrix();
    }

    @Override
    protected boolean setFrame(int l, int t, int r, int b) {
        boolean changed = super.setFrame(l, t, r, b);
        updateImageMatrix();
        return changed;
    }

    // The loaded image's own size in pixels (as onLoad has it), and its scale
    // (a bundled image's, so it's its size in points; 1 for others, as on
    // iOS), for scale-down and none. 0 until it's known.
    private int mImageWidth = 0;
    private int mImageHeight = 0;
    // Whether that's the image's own size (not the decoded image's), and
    // whether a local image's is being read.
    private boolean mImageSizeOwn = false;
    private boolean mReadingImageSize = false;
    private double mImageScale = 1;
    // The loading source's scale.
    private double mLoadingScale = 1;
    // And with several sources, the picked one's (see onImageSize).
    private double mLoadingLayoutScale = 1;
    @Nullable
    private Matrix mImageMatrix;

    // The loading image's own size, from FastImageRequestListener as it's
    // ready (null until a local image's has been read).
    // own: whether it's the image's own size, rather than the decoded
    // image's (which a decode for another box doesn't give: see
    // givesShownBitmap).
    void onImageSize(@Nullable int[] size, boolean own) {
        mReadingImageSize = false;
        mImageSizeOwn = size != null && own;
        mImageWidth = size != null ? size[0] : 0;
        mImageHeight = size != null ? size[1] : 0;
        mImageScale = mLoadingScale;
        updateImageMatrix();
        if (size != null) {
            mSizedModel = mModel;
            double scale = mImageScale * mLoadingLayoutScale;
            setLayoutSize((float) (size[0] / scale), (float) (size[1] / scale));
        }
        // Whether the image loaded at a size the view doesn't have now, with
        // the size isResized compares with (also once a local image's is read),
        // and a blur or objectFit change that waited for it.
        if (size == null) return;
        reloadIfResized();
        if ((mBlurChanged || mFitChanged || mCropChanged) && mManager != null) onAfterUpdate(mManager, requestManager);
    }

    // The loaded image's own size won't be known (not read for a local
    // image): whether it loaded at a size the view doesn't have now, without
    // it.
    void onImageSizeUnknown() {
        reloadIfResized();
    }

    // A local image's own size is being read (FastImageRequestListener): no
    // load of the shown image again until then (for a new size, blur or
    // objectFit), which would drop the read, and onLoad with it.
    void onImageSizeReading() {
        mReadingImageSize = true;
    }

    // The shadow node's state (see FastImageViewShadowNode): the loaded
    // image's size in dp, which the view's layout follows where its style
    // leaves it open (the autoSize prop), or 0 after an image failed or
    // without a source, as before one loads. Only set then: a state update
    // lays out the whole screen again. The last size set, so the same one
    // isn't set again.
    @Nullable
    private StateWrapper mStateWrapper;
    // The autoSize prop's bits: the sides the style leaves open.
    static final int AUTO_WIDTH = 1;
    static final int AUTO_HEIGHT = 2;
    private int mAutoSize = 0;
    private float mLayoutWidth = 0;
    private float mLayoutHeight = 0;
    private float mStateWidth = 0;
    private float mStateHeight = 0;

    // The image size the layout has (the state's), which it gets after the
    // view sets it.
    private float mLaidOutWidth = 0;
    private float mLaidOutHeight = 0;
    // The model whose image's size the view last set for the layout.
    @Nullable
    private Object mSizedModel;

    void setStateWrapper(@Nullable StateWrapper stateWrapper) {
        mStateWrapper = stateWrapper;
        ReadableMap data = stateWrapper != null ? stateWrapper.getStateData() : null;
        boolean wasHidden = laysOutOneSide();
        mLaidOutWidth = data != null && data.hasKey("width") ? (float) data.getDouble("width") : 0;
        mLaidOutHeight = data != null && data.hasKey("height") ? (float) data.getDouble("height") : 0;
        if (laysOutOneSide() != wasHidden) invalidate();
        updateSizeState();
        // The layout for the shown image: a fitted cover image is cropped if
        // the view didn't take its shape, and one that waited for it is
        // loaded for the view's size if that didn't change (see isResized).
        reloadIfResized();
    }

    // Whether the style leaves a side open and the layout has neither side
    // yet (inside the borders), nor an image's size (e.g. no width or height:
    // both follow the image).
    private boolean laysOutNoSide() {
        return mAutoSize != 0 && !imageLaidOut() && layoutContentWidth() <= 0 && layoutContentHeight() <= 0;
    }

    // Whether a view whose size doesn't follow the image (no autoSize) has
    // been laid out with nothing inside its borders on a side: e.g. under a
    // display: none parent, which lays it out at 0x0, or sized from onLoad.
    // Glide loads the image for a square the screen's length then (its size
    // for a view that has none), scaling a small one up to it. It's loaded no
    // larger than its own size instead, as iOS decodes it at full size (see
    // renderingOptions), and for the view's size once it has one.
    private boolean laidOutWithoutSize() {
        return mAutoSize == 0 && isLaidOut() && (contentWidth() <= 0 || contentHeight() <= 0);
    }

    // Whether the layout has a loaded image's size.
    private boolean imageLaidOut() {
        return mLaidOutWidth > 0 && mLaidOutHeight > 0;
    }

    // Whether the style leaves a side open and the layout has the size of an
    // image other than the loading one: the previous source's while a new one
    // loads (e.g. in a recycled list cell), or until the state has the size
    // just set for it.
    private boolean laysOutPreviousImage() {
        return mAutoSize != 0 && imageLaidOut() && (!shownImageLaidOut() || !Objects.equals(mSizedModel, mModel));
    }

    // Whether the layout has the shown image's size.
    private boolean shownImageLaidOut() {
        return imageLaidOut() && Math.abs(mLaidOutWidth - mLayoutWidth) < 0.01f
                && Math.abs(mLaidOutHeight - mLayoutHeight) < 0.01f;
    }

    boolean getAutoSize() {
        return mAutoSize != 0;
    }

    void setAutoSize(int autoSize) {
        boolean wasHidden = laysOutOneSide();
        mAutoSize = autoSize;
        if (laysOutOneSide() != wasHidden) invalidate();
        updateSizeState();
    }

    // Whether the style leaves a side open and the view has the shown image's
    // shape (within a pixel), so it follows the image: the next image (e.g. in
    // a recycled list cell) will change the view's shape. With both open, the
    // view may only have that shape by chance (e.g. flex: 1, sized by its
    // parent): then the next image is cropped once its layout arrives (see
    // isResized).
    private boolean followsImage() {
        if (mAutoSize == 0 || mLayoutWidth <= 0 || mLayoutHeight <= 0) return false;
        float width = contentWidth();
        float height = contentHeight();
        // The layout rounds each side to the pixel grid (with the view's
        // position, so by up to a pixel), and the other side's rounding is
        // multiplied by the image's ratio: a tall image's height can be a few
        // pixels off its width times the ratio.
        float tall = mLayoutHeight / mLayoutWidth;
        // (At most 9 pixels: a view clamped that close to a very tall image's
        // shape, e.g. by maxHeight, still counts as following it.)
        boolean byWidth = width > 0 && Math.abs(height - width * tall) <= 1 + Math.min(tall, 8);
        boolean byHeight = height > 0 && Math.abs(width - height / tall) <= 1 + Math.min(1 / tall, 8);
        if (mAutoSize == AUTO_HEIGHT) return byWidth;
        if (mAutoSize == AUTO_WIDTH) return byHeight;
        return byWidth || byHeight;
    }

    private void setLayoutSize(float width, float height) {
        mLayoutWidth = width;
        mLayoutHeight = height;
        updateSizeState();
    }

    private void updateSizeState() {
        if (mAutoSize == 0 || mStateWrapper == null) return;
        if (mLayoutWidth == mStateWidth && mLayoutHeight == mStateHeight) return;
        mStateWidth = mLayoutWidth;
        mStateHeight = mLayoutHeight;
        WritableMap state = new WritableNativeMap();
        state.putDouble("width", mLayoutWidth);
        state.putDouble("height", mLayoutHeight);
        // A layout of the whole screen (debug builds: FastImageWork).
        if (FastImageWork.enabled()) FastImageWork.record("layout-state", mModel, mLayoutWidth + "x" + mLayoutHeight);
        mStateWrapper.updateState(state);
    }

    // Pixels on screen per pixel of the loaded image at its own size: an image
    // is its size in pixels in dp (a bundled one in points, its pixels divided
    // by its scale), as on iOS.
    private float imageDensity() {
        return (float) (getResources().getDisplayMetrics().density / mImageScale);
    }

    // The same for the loading image.
    private float loadingDensity() {
        return (float) (getResources().getDisplayMetrics().density / mLoadingScale);
    }

    // The image laid out as CSS's object-fit and object-position do: its size
    // for the fit (cover and contain from its shape; none at its own size,
    // cropped by the view; scale-down at its own size, or scaled down
    // uniformly to fit if that's larger than the view), with its left and top
    // edges at (view - image) * fraction + offset. Glide decodes a scale-down
    // image no larger than that (CenterInside), a none one at its size, and
    // crops a cover one to what the view shows (FastImageCrop), so it's drawn
    // at this size. The placeholder prop (a resource) is already at its size on
    // screen, and so is a center image (its size in pixels, as ImageView's
    // CENTER_INSIDE draws it).
    private void updateImageMatrix() {
        if (getScaleType() != ScaleType.MATRIX) return;
        Drawable drawable = getDrawable();
        if (drawable == null) return;
        int drawableWidth = drawable.getIntrinsicWidth();
        int drawableHeight = drawable.getIntrinsicHeight();
        float viewWidth = getWidth() - getPaddingLeft() - getPaddingRight();
        float viewHeight = getHeight() - getPaddingTop() - getPaddingBottom();
        if (mImageMatrix == null) mImageMatrix = new Matrix();
        Matrix matrix = mImageMatrix;
        if (drawableWidth <= 0 || drawableHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) {
            matrix.reset();
            setImageMatrix(matrix);
            return;
        }
        float width;
        float height;
        if (shownCropped(drawable)) {
            // Glide cropped it to what the view shows (FastImageCrop), or for
            // the previous position or size until the image has loaded again
            // for this one: it covers the view, scaled uniformly (a crop for
            // another size isn't stretched), at the position's fractions (its
            // offsets are already in the crop).
            float cover = Math.max(viewWidth / drawableWidth, viewHeight / drawableHeight);
            matrix.setScale(cover, cover);
            matrix.postTranslate(
                    Math.round((viewWidth - drawableWidth * cover) * mPositionX),
                    Math.round((viewHeight - drawableHeight * cover) * mPositionY));
            setImageMatrix(matrix);
            return;
        }
        // A source's placeholder (a ThumbHash or a blurDataUri), or
        // placeholderSource's image, stands for an image whose size isn't
        // known yet: with scale-down and none (which show an image at its own
        // size), it's shown as with contain.
        boolean hashFits = drawable == mShownPlaceholder && (mPlaceholderKey != null || drawable == mUrlPlaceholder);
        if (mLayoutScaleType == ScaleType.CENTER_CROP || mLayoutScaleType == ScaleType.FIT_CENTER || hashFits) {
            float x = viewWidth / drawableWidth;
            float y = viewHeight / drawableHeight;
            float scale = mLayoutScaleType == ScaleType.CENTER_CROP ? Math.max(x, y) : Math.min(x, y);
            width = drawableWidth * scale;
            height = drawableHeight * scale;
        } else if (drawable == mShownPlaceholder) {
            width = drawableWidth;
            height = drawableHeight;
        } else if (mImageWidth > 0 && mImageHeight > 0) {
            width = mImageWidth * imageDensity();
            height = mImageHeight * imageDensity();
        } else {
            // Its size isn't known yet (a local image's is read after it
            // loads): Glide decoded it at its size unless it's larger than
            // the view, which shows it scaled down to fit either way.
            width = drawableWidth * imageDensity();
            height = drawableHeight * imageDensity();
        }
        float fit = mLayoutScaleType == ScaleType.CENTER_INSIDE
                ? Math.min(1, Math.min(viewWidth / width, viewHeight / height))
                : 1;
        width *= fit;
        height *= fit;
        matrix.setScale(width / drawableWidth, height / drawableHeight);
        matrix.postTranslate(
                Math.round((viewWidth - width) * mPositionX + mPositionXOffset),
                Math.round((viewHeight - height) * mPositionY + mPositionYOffset));
        setImageMatrix(matrix);
    }

    // imageRendering="pixelated": no resampling by Glide, and drawn without
    // filtering (sharp pixels). "smooth" is iOS only; here it's the same as
    // "auto": Glide decodes a large image at about the view's size (unless
    // downsample is false), and averaging it properly would need mipmaps or
    // a full-size decode. Part of the request, so a change reloads.
    private boolean mPixelated = false;

    public void setImageRendering(@Nullable String imageRendering) {
        boolean pixelated = "pixelated".equals(imageRendering);
        if (pixelated == mPixelated) return;
        mPixelated = pixelated;
        mNeedsReload = true;
    }

    // downsample false: images are decoded at their own size (capped, see
    // FastImageSourceSize.FULL_SIZE), not cropped or fitted to the view's
    // size, so a view zoomed in on with a transform shows the image's detail.
    // Part of the request, so a change reloads.
    private boolean mDownsample = true;

    public void setDownsample(boolean downsample) {
        if (downsample == mDownsample) return;
        mDownsample = downsample;
        mNeedsReload = true;
        // As for a new objectFit: an image on screen keeps the layout it was
        // loaded for until the new one is ready.
        if (mShownRequest == null) applyObjectFit();
    }

    // blurRadius, in pixels (0 is no blur). Part of the request (see
    // reblur for a change).
    private float mBlurRadius = 0;
    private boolean mBlurChanged = false;
    // objectFit changed (setObjectFit).
    private boolean mFitChanged = false;
    // objectPosition changed for an image Glide crops (onPositionChanged).
    private boolean mCropChanged = false;

    public void setBlurRadius(float blurRadius) {
        if (blurRadius == mBlurRadius) return;
        mBlurRadius = blurRadius;
        mBlurChanged = true;
    }

    // The scale type's options (what into() would apply), or none when
    // pixelated, and the blur. A blurred animated image shows its first frame,
    // as on iOS.
    private RequestOptions renderingOptions(Object model) {
        FastImageBlur blur = mBlurRadius > 0
                ? new FastImageBlur(mBlurRadius, mFitScaleType, loadingDensity())
                : null;
        RequestOptions options;
        if (mPixelated) {
            // Decoded as it is, then scaled by the view without filtering (see
            // OwnGifTarget).
            mLoadingUncropped = false;
            mLoadingUnsized = false;
            options = new RequestOptions()
                    .downsample(new FastImageSourceSize.Capture(DownsampleStrategy.NONE, String.valueOf(model)))
                    .dontTransform();
            if (blur != null) options = options.optionalTransform(blur);
        } else {
            // Cover, before an open side is laid out (it follows the image,
            // see setAutoSize; it can have borders meanwhile), or while the
            // view has the previous image's shape on it (followsImage): Glide
            // would crop the image to a size the view won't have. It's fitted
            // instead, which looks the same once the view has the image's
            // shape (see reloadForSize).
            boolean uncropped = mAutoSize != 0 && mFitScaleType == ScaleType.CENTER_CROP
                    && (!imageLaidOut() && (layoutContentWidth() <= 0 || layoutContentHeight() <= 0)
                            || followsImage());
            // Before the view has any size (neither side laid out, e.g. no
            // width or height: both follow the image), or laid out without one
            // (laidOutWithoutSize; with cover or contain, downsampled, the
            // fits that scale it up), Glide asks for the screen's length both
            // ways, and would scale the image up to it. It's loaded no larger
            // than its own size instead (an SVG at its own size in dp), which
            // a view at that size, or larger, doesn't load again (see
            // isResized).
            boolean scalesUp = mDownsample
                    && (mFitScaleType == ScaleType.CENTER_CROP || mFitScaleType == ScaleType.FIT_CENTER);
            boolean unsized = (laysOutNoSide() || laidOutWithoutSize() && scalesUp) && mFitScaleType != ScaleType.CENTER;
            ScaleType fit = unsized ? ScaleType.CENTER_INSIDE : uncropped ? ScaleType.FIT_CENTER : mFitScaleType;
            mLoadingUncropped = uncropped;
            mLoadingUnsized = unsized;
            if ((uncropped || unsized) && blur != null) blur = new FastImageBlur(mBlurRadius, fit, loadingDensity());
            options = FastImageSourceSize.scaleTypeOptions(fit,
                    FastImageSourceSize.capture(fit, model, mDownsample),
                    uncropped || unsized ? null : positionedCrop(), blur, mDownsample);
            boolean ownSize = fit == ScaleType.CENTER_INSIDE || fit == ScaleType.CENTER;
            // scale-down and none show it at its own size in dp: an SVG is
            // drawn at that size, so it's sharp (not with a blur, which hides
            // the difference).
            if (ownSize && blur == null) {
                options = options.set(FastImageSvg.DENSITY, loadingDensity())
                        .set(FastImageSvg.FITS, fit == ScaleType.CENTER_INSIDE);
            }
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
    // Whether the loading request is the image that's showing loaded again
    // (reloadForSize's or reblur's), which sends no events.
    private boolean mLoadingQuietly = false;
    // Set by reblur: the next load is the same one again, so it doesn't send
    // onLoadStart (it sends its other events, as the load it replaces would
    // have).
    private boolean mRestarting = false;

    // The request for the image the view shows (from when it has loaded until
    // another image or the placeholder prop replaces it), and the one loading.
    // A new source starts with the shown one as a thumbnail, from the cache
    // only, so the image stays until the new one has loaded instead of flashing
    // blank (#747), also if the source changes again meanwhile. This is Glide's
    // safe way to do that: the previous bitmap can't be kept in the view
    // itself, since Glide reuses it once its request is cleared.
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
    // Whether the shown and the loading image are cover ones fitted instead
    // of cropped (see renderingOptions).
    private boolean mShownUncropped = false;
    private boolean mLoadingUncropped = false;
    // Whether the shown and the loading image were loaded before the view
    // had any size, no larger than their own size (see renderingOptions).
    private boolean mShownUnsized = false;
    private boolean mLoadingUnsized = false;
    // Whether the shown image was drawn as a vector (an SVG), for the box or
    // at its own size in dp (see givesShownBitmap).
    private boolean mShownVector = false;
    // The shown image's size as decoded (a bitmap's, or an animation's): a
    // view that size doesn't load it again (e.g. one fitted to the view's
    // width, once the view has the image's shape).
    private int mShownBitmapWidth = 0;
    private int mShownBitmapHeight = 0;
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
            // the placeholder prop (or nothing) while the next one loads, nor a
            // fade from it. Reload even if the source is the same.
            mShownRequest = null;
            endFade();
            mNeedsReload = true;
        }
    }

    // The loading image loaded (FastImageRequestListener).
    void onImageLoaded(Drawable resource) {
        mLoadEnded = true;
        // The image came first: its placeholder isn't needed (not from
        // within Glide's callback).
        if (mUrlPlaceholder == null) {
            mUrlPlaceholderWaitsForSize = false;
            post(new Runnable() {
                @Override
                public void run() {
                    if (mUrlPlaceholder == null && mLoadEnded && mShownRequest != null) clearUrlPlaceholderTarget();
                }
            });
        }
        endProgress();
        // Before the view shows it (the target does once this returns).
        applyObjectFit();
        mShownRequest = mLoadingRequest;
        mShownWidth = mLoadingWidth;
        mShownHeight = mLoadingHeight;
        mShownUncropped = mLoadingUncropped;
        mShownUnsized = mLoadingUnsized;
        mShownVector = FastImageSourceSize.isVector(mModel);
        // A bitmap's size, or an animation's (a GIF or animated WebP, decoded
        // at that size).
        Bitmap bitmap = resource instanceof BitmapDrawable ? ((BitmapDrawable) resource).getBitmap() : null;
        mShownBitmapWidth = bitmap != null ? bitmap.getWidth() : resource.getIntrinsicWidth();
        mShownBitmapHeight = bitmap != null ? bitmap.getHeight() : resource.getIntrinsicHeight();
        // The same image loaded again has the same own size. Another one's
        // comes after this (FastImageRequestListener calls onImageSize, which
        // checks then), and isResized compares with it.
        if (mLoadingQuietly) reloadIfResized();
    }

    // Glide crops or scales the image to the view's size when it loads, so if
    // the view's size changes after that, load it again at the new size.
    // Otherwise a view that gets taller shows a zoomed-in slice of it (#983).
    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        // During a fade, what the view showed was drawn at the old size: the
        // image fades in over nothing instead.
        if (mFadeFrom != null) {
            mFadeFrom.recycle();
            mFadeFrom = null;
            invalidate();
        }
        if (mFadeFromDrawable != null) {
            mFadeFromDrawable = null;
            mFadeFromMatrix = null;
            invalidate();
        }
        if (!switchSourceIfResized()) reloadIfResized();
        if (mUrlPlaceholderWaitsForSize && w > 0 && h > 0) {
            mUrlPlaceholderWaitsForSize = false;
            scheduleUrlPlaceholderLoad();
        }
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

    // Whether the image loaded, at a size the view doesn't have now: loading
    // it for the view's box would give another bitmap.
    private boolean isResized() {
        int[] box = FastImageSourceSize.box(contentWidth(), contentHeight());
        int width = box[0];
        int height = box[1];
        return requestManager != null && !mDropped && !mNeedsReload
                && mShownRequest != null && mShownRequest == mLoadingRequest
                && mShownWidth > 0 && mShownHeight > 0 && width > 0 && height > 0
                // Not while the view is only its borders on a side that follows
                // the image, or has another image's size there: it gets its
                // shape from the image.
                && !laysOutOneSide() && !laysOutNoSide() && !laysOutPreviousImage()
                && !mReadingImageSize
                && !givesShownBitmap(width, height);
    }

    // Whether loading the shown image for a box (in pixels) would give the
    // bitmap the view shows, so there's nothing to load again.
    private boolean givesShownBitmap(int width, int height) {
        boolean sameBox = width == mShownWidth && height == mShownHeight;
        // A cover image fitted while the view had the previous image's shape
        // or no size (see renderingOptions), in a view that didn't take its
        // shape: it's cropped now that its layout has arrived.
        if (mShownUncropped && shownImageLaidOut() && !followsImage()) return false;
        // Whether the image's own size is known (not only the decoded image's).
        boolean known = mImageSizeOwn && mImageWidth > 0 && mImageHeight > 0;
        // A blurred image: its blur is for how much the view scales the bitmap
        // in the box it was loaded for (see FastImageBlur), so only that box
        // gives it, unless that's the same for both.
        if (mBlurRadius > 0 && !(mFitScaleType == ScaleType.CENTER || known && blurredForBoth(width, height))) {
            return sameBox;
        }
        if (sameBox) return true;
        boolean fitted = mDownsample && !mPixelated;
        // Cropped to the box (cover, downsampled, also once one loaded before
        // the view had a size is loaded for it): the box's size, within a pixel
        // (e.g. one decoded for the view's width before it had a height, at
        // the shape it then gets). A box at least the whole image's size, which
        // the view scales, also gives the same (see below).
        if (fitted && mFitScaleType == ScaleType.CENTER_CROP && !mShownUncropped
                && Math.abs(width - mShownBitmapWidth) <= 1 && Math.abs(height - mShownBitmapHeight) <= 1) {
            return true;
        }
        // Without the image's own size, only those are known to give the same
        // bitmap.
        if (!known) return false;
        boolean whole = shownWholeImage();
        // The whole image (at its own size, or at most
        // FastImageSourceSize.MAX_PIXELS), with a fit or decode that doesn't
        // scale it up (none, fill, scale-down, pixelated, a bitmap's full-size
        // decode, or one loaded before the view had a size), in a view at
        // least that large, which scales it as it draws it: a decode for the
        // box gives the same. (Not a GIF sampled for a smaller box, nor an SVG
        // with downsample false, drawn for the box.)
        boolean ownSizeAtMost = !fitted && !mShownVector || mShownUnsized && !mShownVector
                || mFitScaleType == ScaleType.CENTER
                || mFitScaleType == ScaleType.FIT_XY || mFitScaleType == ScaleType.CENTER_INSIDE;
        if (whole && ownSizeAtMost && width >= mShownBitmapWidth && height >= mShownBitmapHeight) return true;
        // The whole image, loaded before the view had a size, in a view at its
        // own size in dp (smaller than its pixels for a bundled image of a
        // higher scale than the screen's): it gets nothing more.
        if (mShownUnsized && whole && atImageSize(width, height, false)) return true;
        // Otherwise only a downsampled fitted decode can give the same bitmap
        // for another box: not one at its own size (none), one the box doesn't
        // scale (pixelated, full size), or one cropped to it (cover, above).
        if (!fitted || mFitScaleType == ScaleType.CENTER
                || mFitScaleType == ScaleType.CENTER_CROP && !mShownUncropped) {
            return false;
        }
        // Fitted (contain, fill, scale-down, or a fitted cover image): the
        // image scaled to fit the box, as a decode for it would be, no larger
        // than its own size for fill and scale-down (an SVG's in dp for
        // scale-down without blur, where its renderer draws it at that size).
        // Within a pixel of the shown one: the layout and the decode round a
        // side differently, by more than a pixel for a tall or wide image (e.g.
        // 63.5 pixels wide, so 508 high, and a 1:8 image decoded 63 wide, 504
        // high).
        float scale = Math.min(width / (float) mImageWidth, height / (float) mImageHeight);
        if (mFitScaleType == ScaleType.FIT_XY || mFitScaleType == ScaleType.CENTER_INSIDE) {
            boolean inDp = mShownVector && mBlurRadius <= 0 && mFitScaleType == ScaleType.CENTER_INSIDE;
            scale = Math.min(scale, inDp ? imageDensity() : 1);
        }
        return Math.abs(Math.round(mImageWidth * scale) - mShownBitmapWidth) <= 1
                && Math.abs(Math.round(mImageHeight * scale) - mShownBitmapHeight) <= 1;
    }

    // Whether a blurred image's blur is the same for the box it was loaded
    // for and this one (see FastImageBlur's scale; objectFit none's always
    // is): a fitted one (contain, or a fitted cover image,
    // downsampled), shown a pixel per pixel in both once fitted; scale-down in
    // boxes at least its own size in dp, shown at that size in both; and one
    // loaded before the view had a size (blurred for its own size) in a box
    // that size (e.g. both sides 'auto').
    private boolean blurredForBoth(int width, int height) {
        if (mShownUnsized) return shownWholeImage() && atImageSize(width, height, false);
        if ((mShownUncropped || mFitScaleType == ScaleType.FIT_CENTER) && mDownsample && !mPixelated) return true;
        return mFitScaleType == ScaleType.CENTER_INSIDE && atImageSize(mShownWidth, mShownHeight, true)
                && atImageSize(width, height, true);
    }

    // Whether the view shows the whole image: at its own size (an SVG's in
    // dp, as its renderer draws it at its own size), or at most
    // FastImageSourceSize.MAX_PIXELS (not one decoded for a smaller box, nor
    // a GIF sampled for one).
    private boolean shownWholeImage() {
        if (mImageWidth <= 0 || mImageHeight <= 0) return false;
        float scale = mShownVector ? imageDensity() : 1;
        float width = mImageWidth * scale;
        float height = mImageHeight * scale;
        float cap = FastImageSourceSize.capScale(width * height);
        return Math.abs(mShownBitmapWidth - Math.round(width * cap)) <= 1
                && Math.abs(mShownBitmapHeight - Math.round(height * cap)) <= 1;
    }

    // Whether a box is the image's own size in dp, within a pixel (or, with
    // atLeast, at least that size).
    private boolean atImageSize(int width, int height, boolean atLeast) {
        float density = imageDensity();
        float imageWidth = mImageWidth * density;
        float imageHeight = mImageHeight * density;
        if (mImageWidth <= 0 || mImageHeight <= 0) return false;
        if (atLeast) return width >= imageWidth - 1 && height >= imageHeight - 1;
        return Math.abs(width - imageWidth) <= 1 && Math.abs(height - imageHeight) <= 1;
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
        // A cover image fitted before the view had its size is cropped now,
        // and one loaded before it had any size is loaded for it.
        RequestBuilder<Drawable> request = shown;
        if ((mShownUncropped || mShownUnsized) && mBaseRequest != null) {
            request = mBaseRequest.clone().apply(renderingOptions(mModel));
        } else {
            mLoadingUncropped = mShownUncropped;
            mLoadingUnsized = mShownUnsized;
        }
        RequestBuilder<Drawable> builder = request.clone()
                .error(current.clone())
                .listener(new FastImageRequestListener(null, true, false));
        if (meanwhile == null) builder = builder.thumbnail(current);
        into(request, builder, meanwhile, true, "size");
    }

    // blurRadius or objectFit changed, and nothing else that needs a reload:
    // the image that's showing, blurred or fitted again, with no events, as
    // reloadForSize does: it's decoded again from the cache and blurred or
    // fitted on Glide's threads, and the view keeps the current image (and its
    // layout, see onImageLoaded) until then. If that fails, it shows the image
    // from Glide's caches; cache: 'web' skips them, so the view shows the
    // placeholder prop (or nothing) then. Also while it's loading again that
    // way (e.g. the blur changes every frame): that load is replaced. A load
    // that hasn't finished starts again with the new blur, without a second
    // onLoadStart. Nothing loaded (the placeholder prop, which isn't blurred,
    // or nothing): the next load has the new blur.
    @SuppressLint("CheckResult")
    private void reblur() {
        if (requestManager == null || mBaseRequest == null) return;
        RequestBuilder<Drawable> shown = mShownRequest;
        if (shown != null && (shown == mLoadingRequest || mLoadingQuietly)) {
            RequestBuilder<Drawable> request = mBaseRequest.clone().apply(renderingOptions(mModel));
            RequestBuilder<Drawable> current = fromCache(shown);
            Drawable meanwhile = shownCopy(shown);
            mLoadCount++;
            clearView(requestManager);
            RequestBuilder<Drawable> builder = request.clone()
                    .error(current.clone())
                    .listener(new FastImageRequestListener(null, true, false));
            if (meanwhile == null) builder = builder.thumbnail(current);
            into(request, builder, meanwhile, true, "rendering");
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
    // the time the image loads, even from the memory cache. Quiet: the image
    // that's showing, loaded again (no events).
    // why: what it's for, logged in debug builds (FastImageWork).
    private void into(RequestBuilder<Drawable> request, RequestBuilder<Drawable> builder, @Nullable Drawable meanwhile,
            boolean quiet, String why) {
        FastImageWork.record(quiet ? "reload" : "load", mModel, why);
        final int load = mLoadCount;
        mLoadingRequest = request;
        mLoadingQuietly = quiet;
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
        if (!quiet) scheduleUrlPlaceholderLoad();
    }

    // Loading the image that's showing again (at a new size, or with another
    // blur) failed: the view keeps showing it (FastImageRequestListener).
    void onQuietLoadFailed() {
        mLoadEnded = true;
    }

    // The loading image failed (FastImageRequestListener). Glide shows the
    // placeholder prop then, but not over a thumbnail: show it here, as iOS
    // does.
    void onImageFailed(boolean hadThumbnail) {
        mLoadEnded = true;
        setLayoutSize(0, 0);
        endProgress();
        applyObjectFit();
        mShownRequest = null;
        // Shows instead of the other placeholders once it loads.
        scheduleUrlPlaceholderLoad();
        final int load = mLoadCount;
        // Not from within Glide's callback. Without a thumbnail Glide shows the
        // placeholder the request started with: a source placeholder that changed since
        // shows the new one.
        post(new Runnable() {
            @Override
            public void run() {
                if (load == mLoadCount && (hadThumbnail || getDrawable() != mShownPlaceholder)) {
                    setImageDrawable(mShownPlaceholder);
                }
            }
        });
    }

    @SuppressLint("CheckResult")
    public void onAfterUpdate(
            @Nonnull FastImageViewManager manager,
            @Nullable RequestManager requestManager) {
        if (mDropped) return;
        mManager = manager;
        if ((mBlurChanged || mFitChanged || mCropChanged) && !mNeedsReload && !mReadingImageSize) {
            mBlurChanged = false;
            mFitChanged = false;
            mCropChanged = false;
            reblur();
        }
        if (!mNeedsReload)
            return;
        // Several sources: one is picked for the view's size, so a view that
        // hasn't been laid out yet loads after layout (props and layout are
        // applied in the same batch). A view that still has no size then
        // (e.g. one sized from onLoad) loads the largest source. Also with
        // autoSize, whose image is loaded for the sides laid out (see
        // renderingOptions): a view that gets both from its layout (e.g. flex)
        // loads as usual.
        boolean several = severalSources() != null;
        if (several || mAutoSize != 0) {
            if (mWaitsForSize) return;
            if ((getWidth() <= 0 || getHeight() <= 0) && !mWaitedForSize) {
                // A load still waiting for the size (a previous source's) isn't
                // wanted.
                cancelSizeWait();
                mWaitsForSize = true;
                post(new Runnable() {
                    @Override
                    public void run() {
                        if (!mWaitsForSize) return;
                        mWaitsForSize = false;
                        mWaitedForSize = true;
                        onAfterUpdate(manager, requestManager);
                    }
                });
                return;
            }
            mWaitedForSize = false;
            if (several) pickSource();
        }
        updatePlaceholder();
        // Only reload for changes that affect the request (source,
        // the placeholder prop, objectFit), not for every prop update.
        mNeedsReload = false;
        mBlurChanged = false;
        mFitChanged = false;
        mCropChanged = false;
        boolean switching = mSwitchesSource;
        mSwitchesSource = false;
        boolean restarting = mRestarting;
        mRestarting = false;
        mLoadCount++;
        cancelSizeWait();
        mReadingImageSize = false;
        // A fade in progress carries on, as on iOS: into the next image if it
        // shows at once, and a next image that fades starts from it. The
        // image on screen stays the shown one while the next loads (as its
        // thumbnail, or a copy), so a change before then keeps it too.
        RequestBuilder<Drawable> shownRequest = mShownRequest;
        mLoadingRequest = null;
        mBaseRequest = null;
        mModel = null;

        if (mSource == null) setLayoutSize(0, 0);
        // Nothing to show.
        if (mSource == null && mShownPlaceholder == null) {
            mShownRequest = null;
            // Cancel existing requests.
            clearView(requestManager);

            endProgress();

            // Clear the image.
            setImageDrawable(null);
            scheduleUrlPlaceholderLoad();
            return;
        }

        mLoadingScale = mSource != null && mSource.packagerAsset ? Math.max(mSource.scale, 0.01) : 1;
        // The picked one of several sources' scale (their sizes are in pixels
        // times it): an open side follows the image's pixels over it, as on
        // iOS and the web. (A bundled one's is mLoadingScale already.)
        mLoadingLayoutScale = mSource != null && !mSource.packagerAsset && severalSources() != null
                ? Math.max(mSource.scale, 0.01) : 1;
        final FastImageSource imageSource = FastImageViewConverter.getImageSource(getContext(), mSource);

        // A source without a uri (empty, missing or null), or one that can't be
        // resolved: fire onError and onLoadEnd and show the placeholder prop,
        // as on iOS (#1028, #945).
        if (mSource != null && (imageSource == null || imageSource.getUri().toString().length() == 0)) {
            // Without its thumbhash or blurDataUri (a data uri can be long).
            String error = "Invalid source: " + mSource.describe();
            WritableMap event = new WritableNativeMap();
            event.putString("error", error);
            FastImageEvents.send(this, REACT_ON_ERROR_EVENT, event);
            FastImageEvents.sendLoadEnd(this, error);

            setLayoutSize(0, 0);
            mShownRequest = null;
            // Cancel existing requests.
            clearView(requestManager);

            endProgress();
            setImageDrawable(mShownPlaceholder);
            scheduleUrlPlaceholderLoad();
            return;
        }

        // `imageSource` may be null and we still continue, if the placeholder
        // prop is not null. What Glide loads: a FastImageUrl for a remote
        // image.
        Object model = imageSource == null ? null : imageSource.getSourceForLoad();

        // Before the view clears (see shownCopy).
        Drawable meanwhile = shownRequest != null && imageSource != null ? shownCopy(shownRequest) : null;

        // Cancel existing request.
        clearView(requestManager);

        // The url this load downloads, for its progress: a remote image's
        // (without Glide, in a destroyed Activity, nothing loads).
        mLoadingUrl = requestManager != null && model instanceof FastImageUrl
                ? ((FastImageUrl) model).url
                : null;
        // A restart (reblur) is the same load: its progress doesn't go back,
        // and steps already on their way to it still count.
        if (!restarting) {
            mProgressSince = FastImageViewManager.progressStep();
            mProgressFraction = 0;
        }
        updateProgressTracking();

        if (imageSource != null && !restarting) {
            // This is an orphan even without a load/loadend when only loading a placeholder
            FastImageEvents.send(this, FastImageViewManager.REACT_ON_LOAD_START_EVENT);
        }

        if (requestManager != null) {
            // Records the image's own size when Glide decodes it, for onLoad.
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
                                    .placeholder(mShownPlaceholder) // show until loaded
                                    .fallback(mShownPlaceholder)); // null will not be treated as error
            mBaseRequest = model == null ? null : base;
            mModel = model;
            // Made once the view's size is known, so its options are for that
            // size (renderingOptions, e.g. for a view laid out without one):
            // Glide's size for the view, which it has at once for a view that
            // has one (or is laid out without one), and otherwise after
            // layout, as Glide would ask for it.
            // Meanwhile it's no load, quiet or ended (see reblur).
            mLoadingQuietly = false;
            mLoadEnded = false;
            // A view that has a size has it now (as Glide would).
            if (contentWidth() > 0 && contentHeight() > 0) {
                startLoad(base, model, imageSource, shownRequest, meanwhile, switching);
                return;
            }
            final int load = mLoadCount;
            final SizeWait sizeWait = new SizeWait();
            mSizeWait = sizeWait;
            sizeWait.getSize(new SizeReadyCallback() {
                @Override
                public void onSizeReady(int width, int height) {
                    if (mSizeWait == sizeWait) mSizeWait = null;
                    if (load != mLoadCount || mDropped) return;
                    startLoad(base, model, imageSource, shownRequest, meanwhile, switching);
                }
            });
        }
    }

    // The target a load waits on for the view's size (see onAfterUpdate),
    // held by the view since Glide's layout listener only holds it weakly.
    @Nullable
    private SizeWait mSizeWait;

    // Stops waiting for the view's size for a load that's no longer wanted
    // (and lets go of what it was to start with, e.g. a copy of the image).
    private void cancelSizeWait() {
        if (mSizeWait == null) return;
        mSizeWait.onLoadCleared(null);
        mSizeWait = null;
    }

    // Glide's size for the view, as a request's target gets it, without
    // loading anything. onLoadCleared stops waiting.
    private final class SizeWait extends CustomViewTarget<FastImageViewWithUrl, Object> {
        SizeWait() {
            super(FastImageViewWithUrl.this);
        }

        @Override
        public void onResourceReady(@NonNull Object resource, @Nullable Transition<? super Object> transition) {
        }

        @Override
        public void onLoadFailed(@Nullable Drawable errorDrawable) {
        }

        @Override
        protected void onResourceCleared(@Nullable Drawable placeholder) {
        }
    }

    // Starts the load onAfterUpdate made the base request for, once the view's
    // size is known.
    private void startLoad(RequestBuilder<Drawable> base, @Nullable Object model,
            @Nullable FastImageSource imageSource, @Nullable RequestBuilder<Drawable> shownRequest,
            @Nullable Drawable meanwhile, boolean switching) {
        // What into() would apply for the scale type, with the size capture,
        // for imageRendering, and the blur.
        RequestBuilder<Drawable> builder = base.clone().apply(renderingOptions(model));
        RequestBuilder<Drawable> request = builder.clone();

        // Only the placeholder prop: it replaces the image.
        if (model == null) {
            meanwhile = null;
            mShownRequest = null;
        }
        boolean thumbnail = shownRequest != null && model != null && meanwhile == null;
        // After the clone: loading the image that's showing again (at a new
        // size, or with another blur) doesn't fade it in again. Over a loaded
        // image (a new source) only with betweenImages: otherwise it replaces
        // it at once, as Glide, Coil and Fresco fade an image in from nothing
        // and never between images.
        boolean replacing = shownRequest != null && model != null;
        if (mTransitionDuration > 0 && !switching && (!replacing || mTransitionBetweenImages)) {
            builder = builder.transition(DrawableTransitionOptions.with(
                    new FadeFactory(
                            mTransitionDuration,
                            mTransitionSkipOnCacheHit,
                            imageSource != null && imageSource.isWebCache())));
        }
        if (thumbnail) {
            builder = builder.thumbnail(fromCache(shownRequest));
        }

        if (imageSource != null)
            builder.listener(new FastImageRequestListener(imageSource, thumbnail, true));

        into(request, builder, meanwhile, false, switching ? "source-for-size" : "source");
    }

    public void clearView(@Nullable RequestManager requestManager) {
        // Glide keeps the view's request under its own tag id, not getTag().
        // Without a request this does nothing.
        if (requestManager != null) {
            requestManager.clear(this);
        }
    }
}
