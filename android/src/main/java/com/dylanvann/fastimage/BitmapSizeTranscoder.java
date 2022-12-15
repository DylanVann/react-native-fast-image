package com.dylanvann.fastimage;

import android.graphics.BitmapFactory;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.resource.SimpleResource;
import com.bumptech.glide.load.resource.transcode.ResourceTranscoder;

public class BitmapSizeTranscoder implements ResourceTranscoder<BitmapFactory.Options, Size> {
    @Nullable
    @Override
    public Resource<Size> transcode(@NonNull Resource<BitmapFactory.Options> toTranscode, @NonNull Options options) {
        BitmapFactory.Options bitmap = toTranscode.get();
        Size size = new Size();
        size.width = bitmap.outWidth;
        size.height = bitmap.outHeight;
        return new SimpleResource(size);
    }
}
