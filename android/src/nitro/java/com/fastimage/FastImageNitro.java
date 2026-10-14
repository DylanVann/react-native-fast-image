package com.fastimage;

import com.margelo.nitro.fastimage.FastImageOnLoad;

// Built when the app has react-native-nitro-image (see build.gradle): loads
// the native library, which registers the HybridObject (src/nitro).
final class FastImageNitro {
    private FastImageNitro() {
    }

    static void load() {
        FastImageOnLoad.initializeNative();
    }
}
