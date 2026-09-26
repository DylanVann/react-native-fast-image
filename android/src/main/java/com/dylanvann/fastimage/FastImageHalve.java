package com.dylanvann.fastimage;

import android.graphics.Bitmap;

import androidx.annotation.NonNull;

import com.bumptech.glide.load.engine.bitmap_recycle.BitmapPool;
import com.bumptech.glide.load.resource.bitmap.BitmapTransformation;

import java.nio.charset.Charset;
import java.security.MessageDigest;

// Shrinks a bitmap by halves (each pixel the average of four) while it's at
// least twice the size it's drawn at, so the scaling after it (Glide's crop
// or fit, which samples with bilinear filtering) never skips pixels.
// Scaling a large image down in one step drops fine detail (1px lines
// disappear or alias); halving keeps it, as mipmaps do on the GPU.
final class FastImageHalve extends BitmapTransformation {
    private static final String ID = "com.dylanvann.fastimage.FastImageHalve";
    private static final byte[] ID_BYTES = ID.getBytes(Charset.forName("UTF-8"));

    @Override
    protected Bitmap transform(@NonNull BitmapPool pool, @NonNull Bitmap toTransform, int outWidth, int outHeight) {
        Bitmap bitmap = toTransform;
        while (bitmap.getWidth() / 2 >= outWidth && bitmap.getHeight() / 2 >= outHeight) {
            Bitmap half = Bitmap.createScaledBitmap(bitmap, bitmap.getWidth() / 2, bitmap.getHeight() / 2, true);
            if (bitmap != toTransform) pool.put(bitmap);
            bitmap = half;
        }
        return bitmap;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof FastImageHalve;
    }

    @Override
    public int hashCode() {
        return ID.hashCode();
    }

    @Override
    public void updateDiskCacheKey(@NonNull MessageDigest messageDigest) {
        messageDigest.update(ID_BYTES);
    }
}
