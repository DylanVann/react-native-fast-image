package com.dylanvann.fastimage;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.widget.ImageView;

import androidx.annotation.NonNull;

import com.bumptech.glide.load.engine.bitmap_recycle.BitmapPool;
import com.bumptech.glide.load.resource.bitmap.BitmapTransformation;
import com.bumptech.glide.request.target.Target;

import java.nio.IntBuffer;
import java.nio.charset.Charset;
import java.security.MessageDigest;

// Blurs the image (blurRadius), as React Native's Image does on iOS: three box
// blurs, close to a Gaussian blur, with the box size worked out from the radius
// (in pixels) as the SVG spec describes and halved, as React Native does. So a
// radius looks the same on both platforms. It runs after the scale type's crop
// or fit, on the image at about the size the view shows it (a blurred image
// needs no more detail), on Glide's threads. Part of the request's key, so
// blurred and unblurred views of one image don't share a cached image; the
// cached file stays the original.
final class FastImageBlur extends BitmapTransformation {
    private static final String ID = "com.dylanvann.fastimage.FastImageBlur";
    private static final byte[] ID_BYTES = ID.getBytes(Charset.forName("UTF-8"));

    // In pixels on screen.
    private final float radius;
    private final ImageView.ScaleType scaleType;

    FastImageBlur(float radius, ImageView.ScaleType scaleType) {
        this.radius = radius;
        this.scaleType = scaleType;
    }

    @Override
    protected Bitmap transform(@NonNull BitmapPool pool, @NonNull Bitmap toTransform, int outWidth, int outHeight) {
        int width = toTransform.getWidth();
        int height = toTransform.getHeight();
        if (outWidth == Target.SIZE_ORIGINAL) outWidth = width;
        if (outHeight == Target.SIZE_ORIGINAL) outHeight = height;
        // How many pixels on screen a pixel of the bitmap takes.
        float shownScale = shownScale(width, height, outWidth, outHeight);
        // Blurred at the size it's shown at, or at its own size if it's shown
        // larger.
        float scale = Math.min(shownScale, 1);
        int blurredWidth = Math.max(1, Math.round(width * scale));
        int blurredHeight = Math.max(1, Math.round(height * scale));
        int boxSize = boxSize(radius * scale / shownScale, Math.max(blurredWidth, blurredHeight));
        if (boxSize <= 1 && scale == 1) return toTransform;

        Bitmap result = pool.get(blurredWidth, blurredHeight, Bitmap.Config.ARGB_8888);
        result.setDensity(toTransform.getDensity());
        Canvas canvas = new Canvas(result);
        canvas.scale(blurredWidth / (float) width, blurredHeight / (float) height);
        canvas.drawBitmap(toTransform, 0, 0, new Paint(Paint.FILTER_BITMAP_FLAG));
        canvas.setBitmap(null);
        if (boxSize > 1) blur(pool, result, boxSize);
        return result;
    }

    // Pixels on screen per pixel of the bitmap, for the view's scale type.
    private float shownScale(int width, int height, int outWidth, int outHeight) {
        if (width <= 0 || height <= 0 || outWidth <= 0 || outHeight <= 0) return 1;
        float x = outWidth / (float) width;
        float y = outHeight / (float) height;
        if (scaleType == null) return 1;
        switch (scaleType) {
            case CENTER_CROP:
                return Math.max(x, y);
            case FIT_CENTER:
            case FIT_START:
            case FIT_END:
                return Math.min(x, y);
            case FIT_XY:
                return (float) Math.sqrt(x * y);
            case CENTER_INSIDE:
                return Math.min(Math.min(x, y), 1);
            default:
                return 1;
        }
    }

    // React Native's (RCTImageBlurUtils) for a radius in pixels: odd, so it's
    // centered. At most the image's larger side (a larger box looks the same,
    // and an absurd radius would overflow).
    private static int boxSize(float radius, int max) {
        double size = Math.floor((radius * 3 * Math.sqrt(2 * Math.PI) / 4 + 0.5) / 2);
        return (int) Math.min(size, max) | 1;
    }

    // Blurs the bitmap, on its premultiplied pixels (as stored), each byte a
    // channel. A large box blurs a copy 2, 4 or 8 times smaller instead (each
    // pixel the average of a block), with a box that much smaller, of at least
    // 11 pixels, drawn back at full size: away from the edges that matches
    // blurring at full size within a few levels of 255 (about as much as a
    // slightly different radius changes it), for a quarter to a sixty-fourth of
    // the work.
    private static void blur(BitmapPool pool, Bitmap bitmap, int boxSize) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int[] pixels = new int[width * height];
        IntBuffer buffer = IntBuffer.wrap(pixels);
        bitmap.copyPixelsToBuffer(buffer);
        int factor = boxSize >= 88 ? 8 : boxSize >= 44 ? 4 : boxSize >= 22 ? 2 : 1;
        if (factor == 1) {
            blur(pixels, width, height, boxSize);
            buffer.rewind();
            bitmap.copyPixelsFromBuffer(buffer);
            return;
        }
        int smallWidth = (width + factor - 1) / factor;
        int smallHeight = (height + factor - 1) / factor;
        int[] small = shrink(pixels, width, height, factor, smallWidth, smallHeight);
        blur(small, smallWidth, smallHeight, Math.round((boxSize / (float) factor - 1) / 2) * 2 + 1);
        Bitmap copy = pool.get(smallWidth, smallHeight, Bitmap.Config.ARGB_8888);
        copy.copyPixelsFromBuffer(IntBuffer.wrap(small));
        Canvas canvas = new Canvas(bitmap);
        canvas.scale(factor, factor);
        Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC));
        canvas.drawBitmap(copy, 0, 0, paint);
        canvas.setBitmap(null);
        pool.put(copy);
    }

    // Three box blurs, each across then down, with the edges extended.
    private static void blur(int[] pixels, int width, int height, int boxSize) {
        int[] other = new int[width * height];
        int radius = boxSize / 2;
        for (int i = 0; i < 3; i++) {
            for (int y = 0; y < height; y++) boxBlur(pixels, other, y * width, 1, width, radius);
            for (int x = 0; x < width; x++) boxBlur(other, pixels, x, width, height, radius);
        }
    }

    // A copy factor times smaller: each pixel the average of a factor × factor
    // block (smaller at the right and bottom edges).
    private static int[] shrink(int[] pixels, int width, int height, int factor, int smallWidth, int smallHeight) {
        int[] small = new int[smallWidth * smallHeight];
        for (int sy = 0; sy < smallHeight; sy++) {
            for (int sx = 0; sx < smallWidth; sx++) {
                int a = 0, b = 0, c = 0, d = 0, n = 0;
                for (int y = sy * factor; y < Math.min(height, (sy + 1) * factor); y++) {
                    for (int x = sx * factor; x < Math.min(width, (sx + 1) * factor); x++) {
                        int pixel = pixels[y * width + x];
                        a += pixel >>> 24;
                        b += (pixel >> 16) & 0xff;
                        c += (pixel >> 8) & 0xff;
                        d += pixel & 0xff;
                        n++;
                    }
                }
                int half = n / 2;
                small[sy * smallWidth + sx] = ((a + half) / n) << 24 | ((b + half) / n) << 16
                        | ((c + half) / n) << 8 | ((d + half) / n);
            }
        }
        return small;
    }

    // Averages each pixel of a row or column (count pixels from start, step
    // apart) with the radius pixels on each side.
    private static void boxBlur(int[] from, int[] to, int start, int step, int count, int radius) {
        int size = 2 * radius + 1;
        int half = size / 2;
        int a = 0, b = 0, c = 0, d = 0;
        for (int i = -radius; i <= radius; i++) {
            int pixel = from[start + clamp(i, count) * step];
            a += pixel >>> 24;
            b += (pixel >> 16) & 0xff;
            c += (pixel >> 8) & 0xff;
            d += pixel & 0xff;
        }
        for (int i = 0; i < count; i++) {
            to[start + i * step] = ((a + half) / size) << 24 | ((b + half) / size) << 16
                    | ((c + half) / size) << 8 | ((d + half) / size);
            int added = from[start + clamp(i + radius + 1, count) * step];
            int removed = from[start + clamp(i - radius, count) * step];
            a += (added >>> 24) - (removed >>> 24);
            b += ((added >> 16) & 0xff) - ((removed >> 16) & 0xff);
            c += ((added >> 8) & 0xff) - ((removed >> 8) & 0xff);
            d += (added & 0xff) - (removed & 0xff);
        }
    }

    private static int clamp(int i, int count) {
        return i < 0 ? 0 : i >= count ? count - 1 : i;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof FastImageBlur
                && ((FastImageBlur) o).radius == radius
                && ((FastImageBlur) o).scaleType == scaleType;
    }

    @Override
    public int hashCode() {
        return ID.hashCode() * 31 + Float.floatToIntBits(radius) * 31 + (scaleType == null ? 0 : scaleType.ordinal());
    }

    @Override
    public void updateDiskCacheKey(@NonNull MessageDigest messageDigest) {
        messageDigest.update(ID_BYTES);
        messageDigest.update((radius + "," + scaleType).getBytes(Charset.forName("UTF-8")));
    }
}
