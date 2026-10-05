package com.dylanvann.fastimage;

import android.graphics.Rect;
import android.graphics.drawable.Drawable;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Registry;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.ResourceDecoder;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.resource.gif.GifOptions;
import com.bumptech.glide.util.ByteBufferUtil;
import com.github.penfeizhou.animation.apng.APNGDrawable;
import com.github.penfeizhou.animation.apng.decode.APNGDecoder;
import com.github.penfeizhou.animation.loader.ByteBufferLoader;
import com.github.penfeizhou.animation.loader.Loader;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

// Animated PNGs (APNG), animated with APNG4Android
// (com.github.penfeizhou.android.animation:apng), which FastImage includes.
// Android and Glide don't animate APNG themselves.
//
// The decoders come before Glide's own, and only take PNGs with an animation
// control chunk (acTL), when the request animates (not with dontAnimate:
// blurRadius, resizeMode repeat, which get the first frame from Glide's
// decoder).
final class FastImageApng {
    // As much of the start of the file as is read to find acTL, which comes
    // before the image data.
    private static final int HEAD_LENGTH = 4096;
    private static final byte[] SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};

    private FastImageApng() {
    }

    static void register(@NonNull Registry registry) {
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
            return FastImageGlide.isRequest(options) && animates(options) && plays(source) >= 0;
        }

        @Nullable
        @Override
        public Resource<Drawable> decode(@NonNull ByteBuffer source, int width, int height, @NonNull Options options)
                throws IOException {
            return decodeApng(source.duplicate(), plays(source));
        }
    }

    private static final class StreamDecoder implements ResourceDecoder<InputStream, Drawable> {
        @Override
        public boolean handles(@NonNull InputStream source, @NonNull Options options) throws IOException {
            if (!FastImageGlide.isRequest(options) || !animates(options)) return false;
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
            return decodeApng(data, plays(data));
        }
    }

    // APNG4Android: Glide keeps the image's data in its memory cache, and each
    // view gets a drawable of its own over it, so views don't share playback:
    // making one only reads the image's header, and it decodes its frames (at a
    // sample size from the size it's drawn at) on APNG4Android's threads as it
    // plays.
    private static Loader loader(ByteBuffer data) {
        return new ByteBufferLoader() {
            @Override
            public ByteBuffer getByteBuffer() {
                ByteBuffer buffer = data.duplicate();
                buffer.position(0);
                return buffer;
            }
        };
    }

    // Null if APNG4Android can't read it (Glide then decodes it as a PNG).
    @Nullable
    private static Resource<Drawable> decodeApng(@NonNull ByteBuffer data, int plays) {
        // Reads the header, waiting for APNG4Android's thread.
        Rect bounds = new APNGDecoder(loader(data), null).getBounds();
        if (bounds.isEmpty()) return null;
        return new ApngResource(data, plays, bounds);
    }

    private static final class ApngResource implements Resource<Drawable> {
        private final ByteBuffer data;
        private final int plays;
        private final Rect bounds;

        ApngResource(ByteBuffer data, int plays, Rect bounds) {
            this.data = data;
            this.plays = plays;
            this.bounds = bounds;
        }

        @NonNull
        @Override
        public Class<Drawable> getResourceClass() {
            return Drawable.class;
        }

        @NonNull
        @Override
        public Drawable get() {
            return new ApngDrawable(loader(data), plays);
        }

        // The data, and a frame at full size (each view's drawable has its
        // own, at the size it's drawn at).
        @Override
        public int getSize() {
            // As a long: a very large image's frame overflows an int.
            long size = data.limit() + (long) bounds.width() * bounds.height() * 4;
            return (int) Math.min(size, Integer.MAX_VALUE);
        }

        @Override
        public void recycle() {
        }
    }

    private static final class ApngDrawable extends APNGDrawable implements FastImageAnimatable {
        // How many times the file says it plays (0: forever).
        private final int plays;
        private volatile boolean paused = false;
        // Once a frame has been rendered (on the decoder's thread).
        private volatile boolean rendered = false;

        ApngDrawable(Loader loader, int plays) {
            super(loader);
            this.plays = plays;
        }

        @Override
        public void setLoopCount(int loopCount, boolean restart) {
            // Plays (0: forever), as APNG4Android counts them.
            setLoopLimit(loopCount == -1 ? plays : loopCount);
            if (restart) {
                reset();
                start();
            }
        }

        @Override
        public void setPaused(boolean paused) {
            this.paused = paused;
            // It starts and stops itself as it's shown and hidden, but not
            // while paused.
            setAutoPlay(!paused);
            if (paused) {
                // Before the first frame, onStart pauses once it's rendered:
                // the decoder's start clears a pause, then skips rendering if
                // one came in meanwhile, which left the view blank.
                if (rendered) pause();
            } else {
                resume();
            }
        }

        // From its first frame. The target starts it right after
        // setVisible(true) has (auto play): APNG4Android's start() stops and
        // starts a running decoder, and a stop made while the decoder is
        // still starting can win over that start, leaving it stopped on its
        // first frame. A running one is reset to its first frame instead.
        @Override
        public void start() {
            if (isRunning()) {
                getFrameSeqDecoder().reset();
                return;
            }
            super.start();
        }

        @Override
        public void onRender(ByteBuffer byteBuffer) {
            super.onRender(byteBuffer);
            rendered = true;
        }

        // On its decoder thread, once starting has drawn the first frame:
        // starting clears a pause made before it got there, so pause again.
        @Override
        public void onStart() {
            super.onStart();
            if (paused) getFrameSeqDecoder().pause();
        }
    }
}
