package com.fastimage;

import androidx.annotation.NonNull;

// The FastImageAutoView component: FastImageView for an image whose style
// leaves a side to the image (see src/index.tsx). Its shadow node has the
// state the view sets the loaded image's size in (see updateState);
// FastImageView's has none.
class FastImageAutoViewManager extends FastImageViewManager {
    @NonNull
    @Override
    public String getName() {
        return "FastImageAutoView";
    }
}
