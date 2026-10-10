package com.dylanvann.fastimage;

import android.graphics.Bitmap;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Registry;
import com.bumptech.glide.load.Option;
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
import java.security.MessageDigest;
import java.util.Locale;

// SVG images (static), drawn with AndroidSVG, which FastImage includes
// (com.caverock:androidsvg-aar). An app with its other package
// (com.caverock:androidsvg, the same classes) leaves FastImage's out
// (docs/troubleshooting.md), so it may be missing: then an SVG image fails
// with a message saying what to do.
//
// The decoders come after Glide's own, so they're only asked about data
// Glide couldn't decode, and only take data that starts like an SVG. This
// class doesn't use AndroidSVG itself (FastImageSvgRenderer does), so it
// loads without it.
final class FastImageSvg {
    static final String MISSING =
            "SVG images need AndroidSVG: the app leaves FastImage's out (an exclude of com.caverock:androidsvg-aar), so add its other package (implementation 'com.caverock:androidsvg:1.4') or remove the exclude";
    private static final int HEAD_LENGTH = 1024;
    @Nullable
    private static Boolean available;

    // objectFit scale-down and none show an image at its own size in dp
    // (FastImageViewWithUrl.updateImageMatrix): an SVG is drawn at that size,
    // the screen's pixels per dp (DENSITY) times its own, rather than at its
    // size in pixels and then enlarged. With scale-down (FITS), no larger than
    // the view. Part of the disk cache key, since the bitmap's size depends on
    // them. Unset (0) for the other fits, which draw it for the view's size.
    static final Option<Float> DENSITY = Option.disk(
            "com.dylanvann.fastimage.FastImageSvg.Density", 0f,
            new Option.CacheKeyUpdater<Float>() {
                @Override
                public void update(@NonNull byte[] keyBytes, @NonNull Float value, @NonNull MessageDigest messageDigest) {
                    messageDigest.update(keyBytes);
                    messageDigest.update(ByteBuffer.allocate(4).putFloat(value).array());
                }
            });
    static final Option<Boolean> FITS = Option.disk(
            "com.dylanvann.fastimage.FastImageSvg.Fits", false,
            new Option.CacheKeyUpdater<Boolean>() {
                @Override
                public void update(@NonNull byte[] keyBytes, @NonNull Boolean value, @NonNull MessageDigest messageDigest) {
                    messageDigest.update(keyBytes);
                    messageDigest.update((byte) (value ? 1 : 0));
                }
            });

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

    // Whether the data starts like an SVG document: its first element is
    // <svg> (after a byte order mark, whitespace, an XML declaration, comments
    // or a doctype), so e.g. an HTML page with an inline SVG isn't one.
    static boolean looksLikeSvg(@NonNull byte[] head, int length) {
        String text = new String(head, 0, length, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
        int i = text.startsWith("\uFEFF") ? 1 : 0;
        while (i < text.length()) {
            char c = text.charAt(i);
            if (Character.isWhitespace(c)) {
                i++;
            } else if (text.startsWith("<?", i)) {
                i = skipPast(text, i, "?>");
            } else if (text.startsWith("<!--", i)) {
                i = skipPast(text, i, "-->");
            } else if (text.startsWith("<!", i)) {
                // A doctype, whose internal subset ([...]) can have '>'s.
                int subset = text.indexOf('[', i);
                int close = text.indexOf('>', i);
                if (subset >= 0 && subset < close) i = skipPast(text, subset, "]");
                if (i >= 0) i = skipPast(text, i, ">");
            } else {
                return text.startsWith("<svg", i);
            }
            if (i < 0) return false;
        }
        return false;
    }

    // The index after the end marker from i, or -1 if it isn't there.
    private static int skipPast(String text, int i, String end) {
        int found = text.indexOf(end, i);
        return found < 0 ? -1 : found + end.length();
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
            if (!FastImageGlide.isRequest(options)) return false;
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
            if (!FastImageGlide.isRequest(options)) return false;
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
