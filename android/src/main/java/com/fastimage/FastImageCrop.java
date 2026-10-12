package com.fastimage;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;

import androidx.annotation.NonNull;

import com.bumptech.glide.load.engine.bitmap_recycle.BitmapPool;
import com.bumptech.glide.load.resource.bitmap.BitmapTransformation;
import com.bumptech.glide.load.resource.bitmap.TransformationUtils;

import java.nio.ByteBuffer;
import java.nio.charset.Charset;
import java.security.MessageDigest;

// objectFit cover with an objectPosition other than the center: Glide's
// CenterCrop at that position. The image is scaled to cover the view's size
// and the part the view shows is kept, so the bitmap is the view's size, as
// with CenterCrop. On each axis the image's left or top edge is at
// (view - image) * fraction + offset (CSS's object-position); an offset that
// moves it past an edge leaves that part transparent.
final class FastImageCrop extends BitmapTransformation {
    private static final String ID = "com.fastimage.FastImageCrop";
    private static final byte[] ID_BYTES = ID.getBytes(Charset.forName("UTF-8"));
    private static final Paint PAINT = new Paint(Paint.DITHER_FLAG | Paint.FILTER_BITMAP_FLAG);

    private final float x;
    private final float xOffset;
    private final float y;
    private final float yOffset;

    // Offsets in pixels.
    FastImageCrop(float x, float xOffset, float y, float yOffset) {
        this.x = x;
        this.xOffset = xOffset;
        this.y = y;
        this.yOffset = yOffset;
    }

    @Override
    protected Bitmap transform(@NonNull BitmapPool pool, @NonNull Bitmap toTransform, int outWidth, int outHeight) {
        int width = toTransform.getWidth();
        int height = toTransform.getHeight();
        if (width <= 0 || height <= 0 || outWidth <= 0 || outHeight <= 0) return toTransform;
        float scale = Math.max(outWidth / (float) width, outHeight / (float) height);
        float shownWidth = width * scale;
        float shownHeight = height * scale;
        float left = Math.round((outWidth - shownWidth) * x + xOffset);
        float top = Math.round((outHeight - shownHeight) * y + yOffset);
        Bitmap.Config config = toTransform.getConfig() != null ? toTransform.getConfig() : Bitmap.Config.ARGB_8888;
        // Past an edge, the view shows nothing there.
        boolean uncovered = left > 0 || top > 0 || left + shownWidth < outWidth || top + shownHeight < outHeight;
        if (uncovered && config == Bitmap.Config.RGB_565) config = Bitmap.Config.ARGB_8888;
        Bitmap result = pool.get(outWidth, outHeight, config);
        TransformationUtils.setAlpha(toTransform, result);
        if (uncovered) {
            result.setHasAlpha(true);
            result.eraseColor(0);
        }
        Matrix matrix = new Matrix();
        matrix.setScale(scale, scale);
        matrix.postTranslate(left, top);
        Canvas canvas = new Canvas(result);
        canvas.drawBitmap(toTransform, matrix, PAINT);
        canvas.setBitmap(null);
        return result;
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof FastImageCrop)) return false;
        FastImageCrop other = (FastImageCrop) o;
        return other.x == x && other.xOffset == xOffset && other.y == y && other.yOffset == yOffset;
    }

    @Override
    public int hashCode() {
        int hash = ID.hashCode();
        hash = hash * 31 + Float.floatToIntBits(x);
        hash = hash * 31 + Float.floatToIntBits(xOffset);
        hash = hash * 31 + Float.floatToIntBits(y);
        return hash * 31 + Float.floatToIntBits(yOffset);
    }

    @Override
    public void updateDiskCacheKey(@NonNull MessageDigest messageDigest) {
        messageDigest.update(ID_BYTES);
        messageDigest.update(ByteBuffer.allocate(16).putFloat(x).putFloat(xOffset).putFloat(y).putFloat(yOffset).array());
    }
}
