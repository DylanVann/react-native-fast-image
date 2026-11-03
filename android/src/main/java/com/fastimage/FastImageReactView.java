package com.fastimage;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Rect;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.RequestManager;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.modules.i18nmanager.I18nUtil;
import com.facebook.react.touch.ReactHitSlopView;
import com.facebook.react.uimanager.BackgroundStyleApplicator;
import com.facebook.react.uimanager.PixelUtil;
import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.uimanager.ReactPointerEventsView;
import com.facebook.react.uimanager.StateWrapper;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.EventDispatcher;
import com.facebook.react.uimanager.style.LogicalEdge;

import java.util.Map;

// FastImageViewWithUrl in React Native: events go to JS, the style's borders
// and border radius (which React Native draws) inset and clip the image, the
// shadow node's state follows the image's size, and touches go through React
// Native's pointerEvents and hitSlop.
class FastImageReactView extends FastImageViewWithUrl implements ReactPointerEventsView, ReactHitSlopView {
    FastImageReactView(Context context, @Nullable RequestManager requestManager) {
        super(context, requestManager);
    }

    @Override
    void dispatchEvent(String name, Map<String, Object> data) {
        ReactContext context = FastImageViewManager.getReactContext(getContext());
        if (context == null) return;
        // The view's event dispatcher (Fabric, bridgeless). Deprecated from React
        // Native 0.85; its replacement, getEventDispatcher(context), isn't in 0.83.
        @SuppressWarnings("deprecation")
        EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, getId());
        if (dispatcher != null) {
            dispatcher.dispatchEvent(new FastImageEvent(
                    UIManagerHelper.getSurfaceId(this), getId(), name, writableMap(data)));
        }
    }

    private static WritableMap writableMap(Map<String, Object> data) {
        WritableMap map = Arguments.createMap();
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            Object value = entry.getValue();
            if (value instanceof Boolean) map.putBoolean(entry.getKey(), (Boolean) value);
            else if (value instanceof Integer) map.putInt(entry.getKey(), (Integer) value);
            else if (value instanceof Double) map.putDouble(entry.getKey(), (Double) value);
            else if (value instanceof String) map.putString(entry.getKey(), (String) value);
            else throw new IllegalArgumentException("Unexpected event value: " + value);
        }
        return map;
    }

    // The image fills the view inside its borders, and padding doesn't inset
    // it, as on iOS: the view's padding is the border widths, resolved as
    // React Native draws the border (its BorderInsets, which isn't public).
    // React Native passes the layout's padding and borders together, so
    // FastImageViewManager.setPadding doesn't use them. Called when a border
    // width or the layout direction changes.
    @Override
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
        setBorderPadding(
                borderWidth(left, physicalLeft, LogicalEdge.HORIZONTAL),
                borderWidth(LogicalEdge.BLOCK_START, LogicalEdge.TOP, LogicalEdge.BLOCK, LogicalEdge.VERTICAL),
                borderWidth(right, physicalRight, LogicalEdge.HORIZONTAL),
                borderWidth(LogicalEdge.BLOCK_END, LogicalEdge.BOTTOM, LogicalEdge.BLOCK, LogicalEdge.VERTICAL));
    }

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

    // To the padding box, with the border radius.
    @Override
    void clipToBorders(Canvas canvas) {
        BackgroundStyleApplicator.clipToPaddingBox(this, canvas);
    }

    // The View style props FastImage handles itself (FastImageViewManager):
    // it's a single native view, so they're the image's.
    private PointerEvents mPointerEvents = PointerEvents.AUTO;
    @Nullable
    private Rect mHitSlopRect;

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

    // The shadow node's state (see FastImageAutoViewShadowNode; none for a
    // FastImageView): the loaded image's size in dp, which the view's layout
    // follows where its style leaves it open (the autoSize prop).
    @Nullable
    private StateWrapper mStateWrapper;

    void setStateWrapper(@Nullable StateWrapper stateWrapper) {
        mStateWrapper = stateWrapper;
        ReadableMap data = stateWrapper != null ? stateWrapper.getStateData() : null;
        setLaidOutImageSize(
                data != null && data.hasKey("width") ? (float) data.getDouble("width") : 0,
                data != null && data.hasKey("height") ? (float) data.getDouble("height") : 0);
    }

    @Override
    boolean hasLayoutState() {
        return mStateWrapper != null;
    }

    @Override
    void clearLayoutState() {
        mStateWrapper = null;
    }

    @Override
    void setLayoutState(float width, float height) {
        WritableMap state = new WritableNativeMap();
        state.putDouble("width", width);
        state.putDouble("height", height);
        mStateWrapper.updateState(state);
    }
}
