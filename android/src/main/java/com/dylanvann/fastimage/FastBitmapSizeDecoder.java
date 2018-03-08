package com.dylanvann.fastimage;

import android.graphics.BitmapFactory;
import android.graphics.BitmapFactory.Options;

import com.bumptech.glide.load.ResourceDecoder;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.resource.SimpleResource;

import java.io.File;
import java.io.IOException;

class FastBitmapSizeDecoder implements ResourceDecoder<File, Options> {
    @Override public Resource<Options> decode(File source, int width, int height) throws IOException {
        Options options = new Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(source.getAbsolutePath(), options);
        return new SimpleResource<>(options);
    }
    @Override public String getId() {
        return getClass().getName();
    }
}
