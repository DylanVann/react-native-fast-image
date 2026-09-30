package com.dylanvann.fastimage;

import android.content.Context;

import androidx.annotation.NonNull;

import com.bumptech.glide.GlideBuilder;
import com.bumptech.glide.annotation.GlideModule;
import com.bumptech.glide.load.engine.cache.InternalCacheDiskCacheFactory;
import com.bumptech.glide.module.AppGlideModule;

// We need an AppGlideModule to be present for progress events to work.
@GlideModule
public final class FastImageGlideModule extends AppGlideModule {
    // The app's disk cache size (saved by configureCache, or in its manifest;
    // FastImageCacheLimits), in Glide's default folder.
    @Override
    public void applyOptions(@NonNull Context context, @NonNull GlideBuilder builder) {
        long maxDiskSize = FastImageCacheLimits.maxDiskSize(context);
        builder.setDiskCache(new InternalCacheDiskCacheFactory(context, maxDiskSize == 0 ? Long.MAX_VALUE : maxDiskSize));
        FastImageCacheLimits.startedMaxDiskSize = maxDiskSize;
    }
}
