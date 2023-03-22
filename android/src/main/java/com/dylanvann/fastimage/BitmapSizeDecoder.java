package com.dylanvann.fastimage;

import android.graphics.BitmapFactory;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.exifinterface.media.ExifInterface;

import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.ResourceDecoder;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.resource.SimpleResource;

import java.io.IOException;
import java.io.InputStream;

public class BitmapSizeDecoder implements ResourceDecoder<InputStream, BitmapFactory.Options> {

    @Override
    public boolean handles(@NonNull InputStream source, @NonNull Options options) throws IOException {
        return true;
    }

    @Nullable
    @Override
    public Resource<BitmapFactory.Options> decode(@NonNull InputStream source, int width, int height, @NonNull Options options) throws IOException {
        BitmapFactory.Options bitmapOptions = new BitmapFactory.Options();
        bitmapOptions.inJustDecodeBounds = true;
        BitmapFactory.decodeStream(source, null, bitmapOptions);

        // BitmapFactory#decodeStream leaves stream's position where ever it was after reading the encoded data
        // https://developer.android.com/reference/android/graphics/BitmapFactory#decodeStream(java.io.InputStream)
        // so we need to rewind the stream to be able to read image header with exif values
        source.reset();

        int orientation = new ExifInterface(source).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_UNDEFINED);
        if (orientation == ExifInterface.ORIENTATION_ROTATE_90 || orientation == ExifInterface.ORIENTATION_ROTATE_270) {
            int tmpWidth = bitmapOptions.outWidth;
            bitmapOptions.outWidth = bitmapOptions.outHeight;
            bitmapOptions.outHeight = tmpWidth;
        }
        return new SimpleResource(bitmapOptions);
    }
}