package com.dylanvann.fastimage;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.RectF;

import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.engine.bitmap_recycle.BitmapPool;
import com.bumptech.glide.load.resource.bitmap.BitmapResource;
import com.bumptech.glide.load.resource.bitmap.DownsampleStrategy;
import com.caverock.androidsvg.SVG;
import com.caverock.androidsvg.SVGParseException;

import java.io.ByteArrayInputStream;
import java.io.IOException;

// Draws an SVG into a bitmap with AndroidSVG, at the size the request's
// downsample strategy gives for the view (as Glide decodes other images, but
// also larger than the SVG's own size, as it's drawn, not scaled up). Glide
// then applies the view's transformations (scale type, blur) as for any
// bitmap. Only used when the app has AndroidSVG (see FastImageSvg).
final class FastImageSvgRenderer {
    // An SVG with neither a size nor a viewBox, as browsers size one.
    private static final float DEFAULT_WIDTH = 300;
    private static final float DEFAULT_HEIGHT = 150;
    // At most this many pixels (a 4096 x 4096 bitmap), however large the view.
    private static final float MAX_PIXELS = 4096f * 4096f;

    private FastImageSvgRenderer() {
    }

    static Resource<Bitmap> render(byte[] data, int width, int height, Options options, BitmapPool pool)
            throws IOException {
        SVG svg;
        try {
            svg = SVG.getFromInputStream(new ByteArrayInputStream(data));
        } catch (SVGParseException e) {
            throw new IOException("Cannot decode the SVG: " + e.getMessage(), e);
        }
        // The SVG's own size: its width and height, or its viewBox's.
        RectF viewBox = svg.getDocumentViewBox();
        float ownWidth = svg.getDocumentWidth();
        float ownHeight = svg.getDocumentHeight();
        if (viewBox != null && viewBox.width() > 0 && viewBox.height() > 0) {
            if (ownWidth <= 0 && ownHeight <= 0) {
                ownWidth = viewBox.width();
                ownHeight = viewBox.height();
            } else if (ownWidth <= 0) {
                ownWidth = ownHeight * viewBox.width() / viewBox.height();
            } else if (ownHeight <= 0) {
                ownHeight = ownWidth * viewBox.height() / viewBox.width();
            }
        } else {
            if (ownWidth <= 0 || ownHeight <= 0) {
                ownWidth = DEFAULT_WIDTH;
                ownHeight = DEFAULT_HEIGHT;
            }
            // Scaled to the bitmap through a viewBox of its own size.
            svg.setDocumentViewBox(0, 0, ownWidth, ownHeight);
        }
        int sourceWidth = Math.max(1, Math.round(ownWidth));
        int sourceHeight = Math.max(1, Math.round(ownHeight));

        // The strategy also records the SVG's own size for onLoad
        // (FastImageSourceSize.Capture).
        DownsampleStrategy strategy = options.get(DownsampleStrategy.OPTION);
        int targetWidth = width > 0 ? width : sourceWidth;
        int targetHeight = height > 0 ? height : sourceHeight;
        float scale = strategy != null
                ? strategy.getScaleFactor(sourceWidth, sourceHeight, targetWidth, targetHeight)
                : 1f;
        if (Float.isNaN(scale) || Float.isInfinite(scale) || scale <= 0) scale = 1f;
        float pixels = sourceWidth * scale * sourceHeight * scale;
        if (pixels > MAX_PIXELS) scale *= (float) Math.sqrt(MAX_PIXELS / pixels);
        int bitmapWidth = Math.max(1, Math.round(sourceWidth * scale));
        int bitmapHeight = Math.max(1, Math.round(sourceHeight * scale));

        svg.setDocumentWidth(bitmapWidth);
        svg.setDocumentHeight(bitmapHeight);
        // Cleared (transparent), from Glide's pool.
        Bitmap bitmap = pool.get(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888);
        svg.renderToCanvas(new Canvas(bitmap));
        return BitmapResource.obtain(bitmap, pool);
    }
}
