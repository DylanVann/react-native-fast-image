package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.LruCache;
import android.widget.ImageView;

import androidx.annotation.Nullable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.ImageHeaderParserUtils;
import com.bumptech.glide.load.resource.bitmap.DownsampleStrategy;
import com.bumptech.glide.load.resource.gif.GifDrawable;
import com.bumptech.glide.request.RequestOptions;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

// Works out an image's own size for onLoad, as iOS reports it (#608). Glide
// decodes images to fit the view, so the loaded drawable is usually smaller
// than the image.
final class FastImageSourceSize {
    // Sizes of recently decoded images, for loads from the memory cache, which
    // don't decode.
    private static final LruCache<String, int[]> SIZES = new LruCache<>(500);
    private static final Executor EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private FastImageSourceSize() {
    }

    // Wraps the downsample strategy Glide would use, to record the image's
    // size (after EXIF rotation) when Glide decodes it. Views loading the same
    // image at the same size share one decode, which uses the first view's
    // options, so the size is recorded by image rather than by request.
    static final class Capture extends DownsampleStrategy {
        private final DownsampleStrategy strategy;
        private final String key;
        private boolean recorded;

        Capture(DownsampleStrategy strategy, String key) {
            this.strategy = strategy;
            this.key = key;
        }

        @Override
        public float getScaleFactor(int sourceWidth, int sourceHeight, int requestedWidth, int requestedHeight) {
            // Called again with the sampled size; the first call has the image's.
            if (!recorded) {
                recorded = true;
                SIZES.put(key, new int[]{sourceWidth, sourceHeight});
            }
            return strategy.getScaleFactor(sourceWidth, sourceHeight, requestedWidth, requestedHeight);
        }

        @Override
        public SampleSizeRounding getSampleSizeRounding(int sourceWidth, int sourceHeight, int requestedWidth, int requestedHeight) {
            return strategy.getSampleSizeRounding(sourceWidth, sourceHeight, requestedWidth, requestedHeight);
        }

        // Glide's memory cache keys include the strategy, so match the wrapped
        // one to keep sharing cached images between views.
        @Override
        public boolean equals(Object o) {
            return o instanceof Capture && ((Capture) o).strategy.equals(strategy);
        }

        @Override
        public int hashCode() {
            return strategy.hashCode();
        }
    }

    // What RequestBuilder.into(ImageView) applies for the view's scale type
    // (it leaves a transformation that's already set alone), with the
    // downsample strategy it implies wrapped by capture.
    static RequestOptions scaleTypeOptions(@Nullable ImageView.ScaleType scaleType, Capture capture) {
        RequestOptions options = new RequestOptions();
        if (scaleType != null) {
            switch (scaleType) {
                case CENTER_CROP:
                    options = options.optionalCenterCrop();
                    break;
                case CENTER_INSIDE:
                case FIT_XY:
                    options = options.optionalCenterInside();
                    break;
                case FIT_CENTER:
                case FIT_START:
                case FIT_END:
                    options = options.optionalFitCenter();
                    break;
                default:
                    break;
            }
        }
        return options.downsample(capture);
    }

    static Capture capture(@Nullable ImageView.ScaleType scaleType, Object model) {
        return new Capture(strategy(scaleType), String.valueOf(model));
    }

    private static DownsampleStrategy strategy(@Nullable ImageView.ScaleType scaleType) {
        if (scaleType == null) return DownsampleStrategy.DEFAULT;
        switch (scaleType) {
            case CENTER_CROP:
                return DownsampleStrategy.CENTER_OUTSIDE;
            case CENTER_INSIDE:
            case FIT_XY:
                return DownsampleStrategy.CENTER_INSIDE;
            case FIT_CENTER:
            case FIT_START:
            case FIT_END:
                return DownsampleStrategy.FIT_CENTER;
            default:
                return DownsampleStrategy.DEFAULT;
        }
    }

    // The image's size, or null when it has to be read from a local image's
    // header first (see readLocal).
    @Nullable
    static int[] get(Drawable resource, Object model, boolean local, boolean fromResourceCache) {
        String key = String.valueOf(model);
        if (resource instanceof GifDrawable) {
            // Glide decodes GIFs itself (sampled to fit the view), without the
            // downsample strategy; their header has the size.
            int[] size = gifSize((GifDrawable) resource);
            if (size != null) return size;
        } else if (fromResourceCache) {
            // Glide caches local images already resized for the view, and the
            // decode from there recorded the resized size.
            SIZES.remove(key);
            return null;
        } else {
            int[] size = SIZES.get(key);
            if (size != null) return size;
            if (local) return null;
        }
        return new int[]{resource.getIntrinsicWidth(), resource.getIntrinsicHeight()};
    }

    @Nullable
    private static int[] gifSize(GifDrawable gif) {
        ByteBuffer buffer = gif.getBuffer();
        if (buffer == null || buffer.limit() < 10) return null;
        // The logical screen width and height (little-endian) follow the
        // 6-byte signature.
        int width = (buffer.get(6) & 0xff) | (buffer.get(7) & 0xff) << 8;
        int height = (buffer.get(8) & 0xff) | (buffer.get(9) & 0xff) << 8;
        return new int[]{width, height};
    }

    interface Callback {
        void onSize(int[] size);
    }

    // Reads a local image's size from its header, off the main thread.
    static void readLocal(Context context, final FastImageSource source, final Drawable resource, final Object model, final Callback callback) {
        final Context appContext = context.getApplicationContext();
        EXECUTOR.execute(new Runnable() {
            @Override
            public void run() {
                int[] size = readBounds(appContext, source);
                if (size != null) {
                    SIZES.put(String.valueOf(model), size);
                } else {
                    size = new int[]{resource.getIntrinsicWidth(), resource.getIntrinsicHeight()};
                }
                final int[] result = size;
                MAIN.post(new Runnable() {
                    @Override
                    public void run() {
                        callback.onSize(result);
                    }
                });
            }
        });
    }

    @Nullable
    private static int[] readBounds(Context context, FastImageSource source) {
        try {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            InputStream stream = open(context, source);
            try {
                BitmapFactory.decodeStream(stream, null, options);
            } finally {
                stream.close();
            }
            if (options.outWidth <= 0 || options.outHeight <= 0) return null;
            int orientation;
            stream = open(context, source);
            try {
                Glide glide = Glide.get(context);
                orientation = ImageHeaderParserUtils.getOrientation(
                        glide.getRegistry().getImageHeaderParsers(), stream, glide.getArrayPool());
            } finally {
                stream.close();
            }
            // EXIF orientations 5 to 8 rotate by 90 or 270 degrees.
            boolean rotated = orientation >= 5 && orientation <= 8;
            return rotated
                    ? new int[]{options.outHeight, options.outWidth}
                    : new int[]{options.outWidth, options.outHeight};
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private static InputStream open(Context context, FastImageSource source) throws IOException {
        if (source.isBase64Resource()) {
            String data = source.getSource();
            byte[] bytes = Base64.decode(data.substring(data.indexOf(',') + 1), Base64.DEFAULT);
            return new ByteArrayInputStream(bytes);
        }
        Uri uri = source.getUri();
        String path = uri.getPath();
        if ("file".equals(uri.getScheme()) && path != null && path.startsWith("/android_asset/")) {
            return context.getAssets().open(path.substring("/android_asset/".length()));
        }
        InputStream stream = context.getContentResolver().openInputStream(uri);
        if (stream == null) throw new IOException("Can't open " + uri);
        return stream;
    }
}
