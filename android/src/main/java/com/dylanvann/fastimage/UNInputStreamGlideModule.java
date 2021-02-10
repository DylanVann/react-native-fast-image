package com.dylanvann.fastimage;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.Registry;
import com.bumptech.glide.annotation.GlideModule;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.data.DataFetcher;
import com.bumptech.glide.load.model.ModelLoader;
import com.bumptech.glide.load.model.ModelLoaderFactory;
import com.bumptech.glide.load.model.MultiModelLoaderFactory;
import com.bumptech.glide.module.LibraryGlideModule;
import com.bumptech.glide.signature.ObjectKey;


import java.io.InputStream;

@GlideModule
public class UNInputStreamGlideModule extends LibraryGlideModule {

    @Override
    public void registerComponents(Context context, Glide glide, Registry registry) {
        registry.prepend(UNImageInputStream.class, InputStream.class, new UNInputStreamGlideModuleLoaderFactory());
    }
}

class UNInputStreamFetcher implements DataFetcher<InputStream> {
    private final UNImageInputStream imageInputStream;

    UNInputStreamFetcher(UNImageInputStream imageInputStream) {
        this.imageInputStream = imageInputStream;
    }

    @Override
    public void loadData(Priority priority, DataCallback<? super InputStream> callback) {
        callback.onDataReady(this.imageInputStream.stream);
    }


    @Override
    public void cleanup() {
        // Intentionally empty only because we're not opening an InputStream or another I/O resource!
    }

    @Override
    public void cancel() {
        // Intentionally empty.
    }

    @NonNull
    @Override
    public Class<InputStream> getDataClass() {
        return InputStream.class;
    }

    @NonNull
    @Override
    public DataSource getDataSource() {
        return null;
    }


}

class UNInputStreamGlideModuleLoader implements ModelLoader<UNImageInputStream, InputStream> {

    @Override
    public boolean handles(@NonNull UNImageInputStream s) {
        return true;
    }

    @Override
    @Nullable
    public LoadData<InputStream> buildLoadData(
            @NonNull UNImageInputStream imageInputStream, int width, int height, @NonNull Options options) {
        return new LoadData<>(new ObjectKey(imageInputStream), new UNInputStreamFetcher(imageInputStream));
    }
}

class UNInputStreamGlideModuleLoaderFactory implements ModelLoaderFactory<UNImageInputStream, InputStream> {

    @Override
    public ModelLoader<UNImageInputStream, InputStream> build(MultiModelLoaderFactory unused) {
        return new UNInputStreamGlideModuleLoader();
    }

    @Override
    public void teardown() {
        // Do nothing.
    }
}

