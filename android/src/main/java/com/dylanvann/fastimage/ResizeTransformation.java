package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.Bitmap;

import androidx.annotation.NonNull;

import com.bumptech.glide.load.Transformation;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.engine.bitmap_recycle.BitmapPool;
import com.bumptech.glide.load.resource.bitmap.BitmapResource;

import java.security.MessageDigest;

public class ResizeTransformation implements Transformation<Bitmap> {

    private final double MAX_BYTES = 25000000.0;

    @NonNull
    @Override
    public Resource<Bitmap> transform(@NonNull Context context, @NonNull Resource<Bitmap> resource, int outWidth, int outHeight) {
        Bitmap toTransform = resource.get();

        if (toTransform.getByteCount() > MAX_BYTES) {
            double scaleFactor = Math.sqrt(MAX_BYTES / (double) toTransform.getByteCount());
            int newHeight = (int) (outHeight * scaleFactor);
            int newWidth = (int) (outWidth * scaleFactor);

            BitmapPool pool = GlideApp.get(context).getBitmapPool();
            Bitmap scaledBitmap =  Bitmap.createScaledBitmap(toTransform, newWidth, newHeight, true);
            return BitmapResource.obtain(scaledBitmap, pool);
        }

        return resource;
    }

    @Override
    public void updateDiskCacheKey(@NonNull MessageDigest messageDigest) {
        messageDigest.update(("ResizeTransformation").getBytes());
    }
}
