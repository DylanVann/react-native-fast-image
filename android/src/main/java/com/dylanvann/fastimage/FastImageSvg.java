package com.dylanvann.fastimage;

import android.graphics.Bitmap;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Registry;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.ResourceDecoder;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.engine.bitmap_recycle.BitmapPool;
import com.bumptech.glide.util.ByteBufferUtil;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

// SVG images (static), drawn with AndroidSVG when the app has it: either of
// its packages (com.caverock:androidsvg or com.caverock:androidsvg-aar).
// FastImage compiles against it but doesn't ship it, so an app never gets a
// second copy of it (from another library, or its own). Without it, an SVG
// image fails with a message saying what to add.
//
// The decoders come after Glide's own, so they're only asked about data
// Glide couldn't decode, and only take data that starts like an SVG. This
// class doesn't use AndroidSVG itself (FastImageSvgRenderer does), so it
// loads without it.
final class FastImageSvg {
    static final String MISSING =
            "SVG images need AndroidSVG: add implementation 'com.caverock:androidsvg-aar:1.4' to the app's dependencies";
    private static final int HEAD_LENGTH = 1024;
    @Nullable
    private static Boolean available;

    private FastImageSvg() {
    }

    static synchronized boolean available() {
        if (available == null) {
            try {
                Class.forName("com.caverock.androidsvg.SVG");
                available = true;
            } catch (Throwable e) {
                available = false;
            }
        }
        return available;
    }

    static void register(@NonNull Registry registry, @NonNull BitmapPool pool) {
        registry.append(InputStream.class, Bitmap.class, new StreamDecoder(pool))
                // Data Glide holds in memory, e.g. from its disk cache.
                .append(ByteBuffer.class, Bitmap.class, new BufferDecoder(pool));
    }

    // Whether the data starts like an SVG document: an <svg> element in its
    // first bytes (after an XML declaration, comments or a doctype).
    static boolean looksLikeSvg(@NonNull byte[] head, int length) {
        String text = new String(head, 0, length, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
        return text.contains("<svg");
    }

    private static byte[] readAll(InputStream stream) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] chunk = new byte[16 * 1024];
        int read;
        while ((read = stream.read(chunk)) != -1) {
            out.write(chunk, 0, read);
        }
        return out.toByteArray();
    }

    private static Resource<Bitmap> decode(byte[] data, int width, int height, Options options, BitmapPool pool)
            throws IOException {
        if (!available()) {
            throw new IOException(MISSING);
        }
        return FastImageSvgRenderer.render(data, width, height, options, pool);
    }

    private static final class StreamDecoder implements ResourceDecoder<InputStream, Bitmap> {
        private final BitmapPool pool;

        StreamDecoder(BitmapPool pool) {
            this.pool = pool;
        }

        @Override
        public boolean handles(@NonNull InputStream source, @NonNull Options options) throws IOException {
            // Glide rewinds the stream before decoding.
            byte[] head = new byte[HEAD_LENGTH];
            int length = 0;
            int read;
            while (length < head.length && (read = source.read(head, length, head.length - length)) != -1) {
                length += read;
            }
            return looksLikeSvg(head, length);
        }

        @Nullable
        @Override
        public Resource<Bitmap> decode(@NonNull InputStream source, int width, int height, @NonNull Options options)
                throws IOException {
            return FastImageSvg.decode(readAll(source), width, height, options, pool);
        }
    }

    private static final class BufferDecoder implements ResourceDecoder<ByteBuffer, Bitmap> {
        private final BitmapPool pool;

        BufferDecoder(BitmapPool pool) {
            this.pool = pool;
        }

        @Override
        public boolean handles(@NonNull ByteBuffer source, @NonNull Options options) {
            ByteBuffer copy = source.duplicate();
            byte[] head = new byte[Math.min(HEAD_LENGTH, copy.remaining())];
            copy.get(head);
            return looksLikeSvg(head, head.length);
        }

        @Nullable
        @Override
        public Resource<Bitmap> decode(@NonNull ByteBuffer source, int width, int height, @NonNull Options options)
                throws IOException {
            return FastImageSvg.decode(readAll(ByteBufferUtil.toStream(source)), width, height, options, pool);
        }
    }
}
