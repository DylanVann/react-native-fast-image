package com.dylanvann.fastimage;

import android.graphics.Rect;
import android.graphics.drawable.Drawable;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.load.engine.Resource;
import com.github.penfeizhou.animation.apng.APNGDrawable;
import com.github.penfeizhou.animation.apng.decode.APNGDecoder;
import com.github.penfeizhou.animation.loader.ByteBufferLoader;
import com.github.penfeizhou.animation.loader.Loader;

import java.nio.ByteBuffer;

// APNGs with APNG4Android (FastImageApng, which only uses this when the app
// has it). Glide keeps the image's data in its memory cache, and each view
// gets a drawable of its own over it, so views don't share playback: making
// one only reads the image's header, and it decodes its frames (at a sample
// size from the size it's drawn at) on APNG4Android's threads as it plays.
final class FastImageApngRenderer {
    private FastImageApngRenderer() {
    }

    // Throws NoClassDefFoundError without APNG4Android.
    static boolean available() {
        return APNGDrawable.class.getName() != null;
    }

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
    static Resource<Drawable> decode(@NonNull ByteBuffer data, int plays) {
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
            return data.limit() + bounds.width() * bounds.height() * 4;
        }

        @Override
        public void recycle() {
        }
    }

    private static final class ApngDrawable extends APNGDrawable implements FastImageAnimatable {
        // How many times the file says it plays (0: forever).
        private final int plays;
        private volatile boolean paused = false;

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
                pause();
            } else {
                resume();
            }
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
