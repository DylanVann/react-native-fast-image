package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.Bitmap;

import androidx.annotation.Nullable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.gifdecoder.GifDecoder;
import com.bumptech.glide.gifdecoder.GifHeader;
import com.bumptech.glide.gifdecoder.GifHeaderParser;
import com.bumptech.glide.gifdecoder.StandardGifDecoder;
import com.bumptech.glide.load.Transformation;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.engine.bitmap_recycle.BitmapPool;
import com.bumptech.glide.load.resource.UnitTransformation;
import com.bumptech.glide.load.resource.bitmap.BitmapResource;
import com.bumptech.glide.load.resource.gif.GifBitmapProvider;
import com.bumptech.glide.load.resource.gif.GifDrawable;

import java.nio.ByteBuffer;

// Gives a view its own animation of a GIF. Glide gives every view that shows
// the same GIF (same url and size) a GifDrawable over one frame loader (it's
// in the cached drawable's constant state), so they animate as one: a view
// whose GIF stopped (the `loop` prop) keeps drawing another view's frames, and
// restarting one throws while another view plays it. A copy has its own
// decoder and frame loader over the same data, so each view animates on its
// own, as with React Native's Image and on iOS. Decoded like Glide's
// ByteBufferGifDecoder does, at the size the image was loaded at, and cropped
// or fitted with the same transformation.
final class FastImageGif {
    private FastImageGif() {}

    // Null if the GIF can't be decoded again (then the view shows Glide's).
    @Nullable
    static GifDrawable copy(Context context, GifDrawable gif, int width, int height) {
        if (width <= 0 || height <= 0) return null;
        ByteBuffer data = gif.getBuffer();
        GifHeader header = new GifHeaderParser().setData(data).parseHeader();
        if (header.getNumFrames() <= 0 || header.getStatus() != GifDecoder.STATUS_OK) return null;
        Glide glide = Glide.get(context);
        BitmapPool bitmapPool = glide.getBitmapPool();
        GifDecoder decoder = new StandardGifDecoder(
                new GifBitmapProvider(bitmapPool, glide.getArrayPool()),
                header, gif.getBuffer(), sampleSize(header, width, height));
        decoder.setDefaultBitmapConfig(Bitmap.Config.ARGB_8888);
        decoder.advance();
        Bitmap firstFrame = decoder.getNextFrame();
        if (firstFrame == null) {
            decoder.clear();
            return null;
        }
        GifDrawable copy = new GifDrawable(
                context, decoder, UnitTransformation.<Bitmap>get(), width, height, firstFrame);
        Transformation<Bitmap> transformation = gif.getFrameTransformation();
        if (transformation != null && !(transformation instanceof UnitTransformation)) {
            // As GifDrawableTransformation does.
            Resource<Bitmap> frame = new BitmapResource(firstFrame, bitmapPool);
            Resource<Bitmap> transformed = transformation.transform(context, frame, width, height);
            if (!frame.equals(transformed)) frame.recycle();
            copy.setFrameTransformation(transformation, transformed.get());
        }
        return copy;
    }

    // ByteBufferGifDecoder's.
    private static int sampleSize(GifHeader header, int width, int height) {
        int exact = Math.min(header.getHeight() / height, header.getWidth() / width);
        int powerOfTwo = exact == 0 ? 0 : Integer.highestOneBit(exact);
        return Math.max(1, powerOfTwo);
    }
}
