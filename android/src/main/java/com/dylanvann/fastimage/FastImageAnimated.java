package com.dylanvann.fastimage;

import android.content.Context;
import android.content.res.Resources;
import android.graphics.drawable.AnimatedImageDrawable;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Registry;
import com.bumptech.glide.load.ImageHeaderParser;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.ResourceDecoder;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.engine.bitmap_recycle.ArrayPool;
import com.bumptech.glide.load.resource.bitmap.BitmapDrawableDecoder;
import com.bumptech.glide.load.resource.bitmap.ByteBufferBitmapDecoder;
import com.bumptech.glide.load.resource.bitmap.Downsampler;
import com.bumptech.glide.load.resource.bitmap.StreamBitmapDecoder;
import com.bumptech.glide.load.resource.drawable.AnimatedImageDecoder;
import com.bumptech.glide.load.resource.gif.GifOptions;
import com.bumptech.glide.util.ByteBufferUtil;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

// Animated WebP and AVIF images, as views' own animations. Glide (4.15+)
// decodes them to an AnimatedImageDrawable and keeps it in its memory cache,
// giving the same drawable to every view that shows the image, so the views
// would share its playback: one view's paused or loop would apply to all of
// them. A view shows the drawable Glide gives it when no other view is showing
// it (shownElsewhere), and otherwise one of its own (copy), decoded again from
// the image's data (which the drawable keeps anyway, to decode its frames
// from), off the main thread.
//
// Not animated (dontAnimate: blurRadius, resizeMode repeat), they're decoded
// as their first frame, a bitmap, as GIFs are, and as Glide did before 4.15.
// Glide's own decoder for them doesn't check that option.
final class FastImageAnimated {
    private FastImageAnimated() {}

    interface CopyCallback {
        // On the main thread: the copy, or null if it couldn't be decoded.
        void onCopy(@Nullable Drawable copy);
    }

    // What each drawable Glide decoded was decoded from, to decode copies
    // (kept as long as the drawable is).
    private static final Map<Drawable, Source> SOURCES = new WeakHashMap<>();
    // Decodes copies, one at a time.
    private static final Executor COPIES = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "FastImageAnimated");
        thread.setDaemon(true);
        return thread;
    });
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    // The repeat count each drawable decoded here had: the file's, which a
    // view goes back to when loop isn't set (a view may have changed it with
    // loop, this one or one that showed the drawable before).
    private static final Map<Drawable, Integer> REPEAT_COUNTS = new WeakHashMap<>();

    private static final class Source {
        final ResourceDecoder<ByteBuffer, Drawable> decoder;
        final ByteBuffer data;
        final int width;
        final int height;
        final Options options;

        Source(ResourceDecoder<ByteBuffer, Drawable> decoder, ByteBuffer data, int width, int height, Options options) {
            this.decoder = decoder;
            this.data = data;
            this.width = width;
            this.height = height;
            this.options = options;
        }
    }

    // Ahead of Glide's own decoder for them, which this uses.
    static void register(@NonNull Context context, @NonNull Glide glide, @NonNull Registry registry) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return;
        List<ImageHeaderParser> parsers = registry.getImageHeaderParsers();
        ArrayPool arrayPool = glide.getArrayPool();
        Resources resources = context.getResources();
        Downsampler downsampler = new Downsampler(
                parsers, resources.getDisplayMetrics(), glide.getBitmapPool(), arrayPool);
        ByteBufferDecoder byteBufferDecoder = new ByteBufferDecoder(
                AnimatedImageDecoder.byteBufferDecoder(parsers, arrayPool),
                new BitmapDrawableDecoder<>(resources, new ByteBufferBitmapDecoder(downsampler)));
        registry.prepend(ByteBuffer.class, Drawable.class, byteBufferDecoder);
        registry.prepend(InputStream.class, Drawable.class, new StreamDecoder(
                AnimatedImageDecoder.streamDecoder(parsers, arrayPool),
                new BitmapDrawableDecoder<>(resources, new StreamBitmapDecoder(downsampler, arrayPool)),
                byteBufferDecoder));
    }

    // Whether the drawable is one decoded here that a view other than this
    // one is showing (its callback is that view, or a drawable that view
    // shows). A view that stops showing it clears its callback, so the next
    // view can show it instead of a copy.
    static boolean shownElsewhere(@NonNull Drawable drawable, @NonNull Drawable.Callback view) {
        synchronized (SOURCES) {
            if (!SOURCES.containsKey(drawable)) return false;
        }
        Drawable.Callback callback = drawable.getCallback();
        return callback != null && callback != view;
    }

    // The file's repeat count for a drawable decoded here, or null.
    @Nullable
    static Integer repeatCount(@NonNull Drawable drawable) {
        synchronized (REPEAT_COUNTS) {
            return REPEAT_COUNTS.get(drawable);
        }
    }

    @RequiresApi(Build.VERSION_CODES.P)
    @Nullable
    private static Resource<Drawable> remember(@Nullable Resource<Drawable> decoded) {
        if (decoded == null) return null;
        Drawable drawable = decoded.get();
        if (drawable instanceof AnimatedImageDrawable) {
            synchronized (REPEAT_COUNTS) {
                REPEAT_COUNTS.put(drawable, ((AnimatedImageDrawable) drawable).getRepeatCount());
            }
        }
        return decoded;
    }

    // Decodes a drawable of its own for an image decoded here, off the main
    // thread (its first frame: the drawable decodes the rest as it plays).
    // The callback gets null if it isn't one, or it couldn't be decoded.
    static void copy(@NonNull Drawable drawable, @NonNull CopyCallback callback) {
        Source source;
        synchronized (SOURCES) {
            source = SOURCES.get(drawable);
        }
        if (source == null) {
            callback.onCopy(null);
            return;
        }
        COPIES.execute(() -> {
            Drawable copy = null;
            try {
                Resource<Drawable> resource = remember(source.decoder.decode(
                        source.data.duplicate(), source.width, source.height, source.options));
                if (resource != null) copy = resource.get();
            } catch (IOException | RuntimeException ignored) {
                // It decoded the first time; if it doesn't now, there's no copy.
            }
            Drawable result = copy;
            MAIN.post(() -> callback.onCopy(result));
        });
    }

    private static boolean animates(Options options) {
        return !Boolean.TRUE.equals(options.get(GifOptions.DISABLE_ANIMATION));
    }

    // The first frame, as a still image.
    @SuppressWarnings("unchecked")
    @Nullable
    private static <T> Resource<Drawable> still(
            ResourceDecoder<T, BitmapDrawable> decoder, T source, int width, int height, Options options)
            throws IOException {
        return (Resource<Drawable>) (Resource<?>) decoder.decode(source, width, height, options);
    }

    @RequiresApi(Build.VERSION_CODES.P)
    private static final class ByteBufferDecoder implements ResourceDecoder<ByteBuffer, Drawable> {
        private final ResourceDecoder<ByteBuffer, Drawable> glide;
        private final ResourceDecoder<ByteBuffer, BitmapDrawable> stillDecoder;

        ByteBufferDecoder(ResourceDecoder<ByteBuffer, Drawable> glide,
                ResourceDecoder<ByteBuffer, BitmapDrawable> stillDecoder) {
            this.glide = glide;
            this.stillDecoder = stillDecoder;
        }

        @Override
        public boolean handles(@NonNull ByteBuffer source, @NonNull Options options) throws IOException {
            return FastImageGlide.isRequest(options) && glide.handles(source, options);
        }

        @Nullable
        @Override
        public Resource<Drawable> decode(@NonNull ByteBuffer source, int width, int height, @NonNull Options options)
                throws IOException {
            if (!animates(options)) return still(stillDecoder, source, width, height, options);
            // Its own position, for decoding it again.
            ByteBuffer data = source.duplicate();
            Resource<Drawable> decoded = remember(glide.decode(source, width, height, options));
            if (decoded != null) {
                synchronized (SOURCES) {
                    SOURCES.put(decoded.get(), new Source(glide, data, width, height, options));
                }
            }
            return decoded;
        }
    }

    @RequiresApi(Build.VERSION_CODES.P)
    private static final class StreamDecoder implements ResourceDecoder<InputStream, Drawable> {
        private final ResourceDecoder<InputStream, Drawable> glide;
        private final ResourceDecoder<InputStream, BitmapDrawable> stillDecoder;
        private final ByteBufferDecoder byteBufferDecoder;

        StreamDecoder(ResourceDecoder<InputStream, Drawable> glide,
                ResourceDecoder<InputStream, BitmapDrawable> stillDecoder, ByteBufferDecoder byteBufferDecoder) {
            this.glide = glide;
            this.stillDecoder = stillDecoder;
            this.byteBufferDecoder = byteBufferDecoder;
        }

        @Override
        public boolean handles(@NonNull InputStream source, @NonNull Options options) throws IOException {
            return FastImageGlide.isRequest(options) && glide.handles(source, options);
        }

        // Read whole, as Glide's own does.
        @Nullable
        @Override
        public Resource<Drawable> decode(@NonNull InputStream source, int width, int height, @NonNull Options options)
                throws IOException {
            if (!animates(options)) return still(stillDecoder, source, width, height, options);
            return byteBufferDecoder.decode(ByteBufferUtil.fromStream(source), width, height, options);
        }
    }
}
