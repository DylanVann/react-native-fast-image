package com.dylanvann.fastimage;

import com.facebook.react.uimanager.LayoutShadowNode;
import com.facebook.react.uimanager.UIViewOperationQueue;

// Legacy architecture only. React Native only lays out a view when its frame
// changes, so a view that stays 0×0 at its parent's origin is never laid out,
// and Glide waits for its size forever (#865). When the computed size is zero,
// tell the view, so it can lay itself out and load as it does on the New
// Architecture. Remove with legacy architecture support.
public class FastImageShadowNode extends LayoutShadowNode {
    static final Object ZERO_LAYOUT = new Object();

    @Override
    public void onCollectExtraUpdates(UIViewOperationQueue uiViewOperationQueue) {
        super.onCollectExtraUpdates(uiViewOperationQueue);
        if (Math.round(getLayoutWidth()) == 0 && Math.round(getLayoutHeight()) == 0) {
            uiViewOperationQueue.enqueueUpdateExtraData(getReactTag(), ZERO_LAYOUT);
        }
    }
}
