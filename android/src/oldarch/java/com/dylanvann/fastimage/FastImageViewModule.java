package com.dylanvann.fastimage;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;

class FastImageViewModule extends ReactContextBaseJavaModule {

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

    @ReactMethod
    public void preload(final ReadableArray sources) {
        impl.preload(sources);
    }

    @ReactMethod
    public void clearMemoryCache(final Promise promise) {
        impl.clearMemoryCache(promise);
    }

    @ReactMethod
    public void clearDiskCache(Promise promise) {
        impl.clearDiskCache(promise);
    }
}
