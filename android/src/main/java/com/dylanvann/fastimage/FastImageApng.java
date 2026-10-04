package com.dylanvann.fastimage;

import android.graphics.drawable.Drawable;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Registry;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.ResourceDecoder;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.resource.gif.GifOptions;
import com.bumptech.glide.util.ByteBufferUtil;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

// Animated PNGs (APNG), animated with APNG4Android
// (com.github.penfeizhou.android.animation:apng), which FastImage ships when
// the app's minSdkVersion is 21 or later, as APNG4Android needs (build.gradle).
// Without it, an APNG shows its first frame, as Android shows it. Android and
// Glide don't animate APNG themselves.
//
// The decoders come before Glide's own, and only take PNGs with an animation
// control chunk (acTL), when the request animates (not with dontAnimate:
// blurRadius, resizeMode repeat, which get the first frame from Glide's
// decoder). This class doesn't use APNG4Android itself
// (FastImageApngRenderer does), so it loads without it.
final class FastImageApng {
    // As much of the start of the file as is read to find acTL, which comes
    // before the image data.
    private static final int HEAD_LENGTH = 4096;
    private static final byte[] SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};
    @Nullable
    private static Boolean available;

    private FastImageApng() {
    }

    static synchronized boolean available() {
        if (available == null) {
            try {
                // Android 5+, as APNG4Android needs.
                available = Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && FastImageApngRenderer.available();
            } catch (Throwable e) {
                available = false;
            }
        }
        return available;
    }

    static void register(@NonNull Registry registry) {
        if (!available()) return;
        registry.prepend(InputStream.class, Drawable.class, new StreamDecoder())
                .prepend(ByteBuffer.class, Drawable.class, new BufferDecoder());
    }

    // How many times the APNG says it plays (0: forever), or -1 if the data
    // doesn't start like an APNG: a PNG with an acTL chunk before its image
    // data.
    static int plays(@NonNull byte[] head, int length) {
        if (length < SIGNATURE.length) return -1;
        for (int i = 0; i < SIGNATURE.length; i++) {
            if (head[i] != SIGNATURE[i]) return -1;
        }
        int offset = SIGNATURE.length;
        // Each chunk: a length, a type, the data, a CRC.
        while (offset + 8 <= length) {
            int chunkLength = ((head[offset] & 0xff) << 24) | ((head[offset + 1] & 0xff) << 16)
                    | ((head[offset + 2] & 0xff) << 8) | (head[offset + 3] & 0xff);
            String type = new String(head, offset + 4, 4, StandardCharsets.US_ASCII);
            if (type.equals("acTL")) {
                // num_frames, then num_plays.
                int plays = offset + 12;
                if (plays + 4 > length) return -1;
                return ((head[plays] & 0x7f) << 24) | ((head[plays + 1] & 0xff) << 16)
                        | ((head[plays + 2] & 0xff) << 8) | (head[plays + 3] & 0xff);
            }
            if (type.equals("IDAT") || chunkLength < 0) return -1;
            offset += 12 + chunkLength;
        }
        return -1;
    }

    private static boolean animates(Options options) {
        return !Boolean.TRUE.equals(options.get(GifOptions.DISABLE_ANIMATION));
    }

    private static int plays(@NonNull ByteBuffer source) {
        ByteBuffer copy = source.duplicate();
        byte[] head = new byte[Math.min(HEAD_LENGTH, copy.remaining())];
        copy.get(head);
        return plays(head, head.length);
    }

    private static final class BufferDecoder implements ResourceDecoder<ByteBuffer, Drawable> {
        @Override
        public boolean handles(@NonNull ByteBuffer source, @NonNull Options options) {
            return animates(options) && plays(source) >= 0;
        }

        @Nullable
        @Override
        public Resource<Drawable> decode(@NonNull ByteBuffer source, int width, int height, @NonNull Options options)
                throws IOException {
            return FastImageApngRenderer.decode(source.duplicate(), plays(source));
        }
    }

    private static final class StreamDecoder implements ResourceDecoder<InputStream, Drawable> {
        @Override
        public boolean handles(@NonNull InputStream source, @NonNull Options options) throws IOException {
            if (!animates(options)) return false;
            byte[] head = new byte[HEAD_LENGTH];
            source.mark(HEAD_LENGTH);
            int read = 0;
            try {
                while (read < head.length) {
                    int count = source.read(head, read, head.length - read);
                    if (count < 0) break;
                    read += count;
                }
            } finally {
                source.reset();
            }
            return plays(head, read) >= 0;
        }

        // Read whole: APNG4Android reads frames from it as it plays.
        @Nullable
        @Override
        public Resource<Drawable> decode(@NonNull InputStream source, int width, int height, @NonNull Options options)
                throws IOException {
            ByteBuffer data = ByteBufferUtil.fromStream(source);
            return FastImageApngRenderer.decode(data, plays(data));
        }
    }
}
