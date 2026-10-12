package com.fastimage;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.uimanager.ViewManager;

import java.util.Collections;
import java.util.List;
import java.util.Map;

// The FastImageView component and the FastImageModule TurboModule.
public class FastImageViewPackage extends BaseReactPackage {
    @Nullable
    @Override
    public NativeModule getModule(@NonNull String name, @NonNull ReactApplicationContext reactContext) {
        if (!NativeFastImageModuleSpec.NAME.equals(name)) {
            return null;
        }
        FastImageCacheLimits.loadInBackground(reactContext);
        return new FastImageViewModule(reactContext);
    }

    @NonNull
    @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        Map<String, ReactModuleInfo> modules = Collections.singletonMap(
                NativeFastImageModuleSpec.NAME,
                new ReactModuleInfo(
                        NativeFastImageModuleSpec.NAME,
                        FastImageViewModule.class.getName(),
                        false, // canOverrideExistingModule
                        false, // needsEagerInit
                        false, // isCxxModule
                        true // isTurboModule
                ));
        return () -> modules;
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        FastImageCacheLimits.loadInBackground(reactContext);
        return Collections.<ViewManager>singletonList(new FastImageViewManager());
    }
}
