package com.dylanvann.fastimage;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;

class FastImageViewModule extends NativeFastImageViewSpec {

    private final FastImageViewModuleImplementation impl;

    FastImageViewModule(ReactApplicationContext reactContext) {
        super(reactContext);
        impl = new FastImageViewModuleImplementation(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return FastImageViewModuleImplementation.REACT_CLASS;
    }

    @Override
    public void preload(final ReadableArray sources) {
        impl.preload(sources);
    }

    @Override
    public void clearMemoryCache(final Promise promise) {
        impl.clearMemoryCache(promise);
    }

    @Override
    public void clearDiskCache(Promise promise) {
        impl.clearDiskCache(promise);
    }
}
