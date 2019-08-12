package com.bumptech.glide;

import android.app.Application;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import androidx.annotation.CheckResult;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import android.util.Log;
import android.widget.ImageView;

import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.RequestOptions;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.bumptech.glide.request.target.ViewTarget;
import com.bumptech.glide.util.Helpers;
import com.facebook.common.executors.UiThreadImmediateExecutorService;
import com.facebook.common.references.CloseableReference;
import com.facebook.datasource.DataSource;
import com.facebook.datasource.DataSubscriber;
import com.facebook.drawee.backends.pipeline.Fresco;
import com.facebook.imagepipeline.core.ImagePipeline;
import com.facebook.imagepipeline.datasource.BaseBitmapDataSubscriber;
import com.facebook.imagepipeline.image.CloseableImage;
import com.facebook.imagepipeline.listener.BaseRequestListener;
import com.facebook.imagepipeline.request.ImageRequest;
import com.facebook.imagepipeline.request.ImageRequestBuilder;
import com.klarna.glide.fresco.R;

import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import static com.bumptech.glide.util.Helpers.msg;

/**
 * @see <a href="https://github.com/bumptech/glide/blob/master/library/src/main/java/com/bumptech/glide/RequestBuilder.java">Original</a>
 */
public class RequestBuilder<TranscodeType extends Drawable> {
    private static final String TAG = "glide";

    private final ImageRequestBuilder builder;
    private final RequestManager manager;
    private RequestOptions options;
    private volatile Target<TranscodeType> target;
    private volatile FetchListener listener;
    /** Singleton guard. */
    private static final Object _sync = new Object();
    /** Bitmap copy operation gard. */
    private static final Object _syncCopy = new Object();
    private static final int _cores = Runtime.getRuntime().availableProcessors();
    private static volatile Executor _executor;

    /* package */ RequestBuilder(@NonNull final RequestManager rm, @NonNull final Uri url) {
        builder = ImageRequestBuilder.newBuilderWithSource(url);
        manager = rm;

        Log.i(TAG, msg("url: " + url));
    }

    @NonNull
    private ImageRequest getImageRequest() {
        return builder.build();
    }

    @NonNull
    private Object getCallerContext() {
        return this;
    }

    @NonNull
    @CheckResult
    public RequestBuilder<TranscodeType> apply(@NonNull final RequestOptions requestOptions) {
        this.options = requestOptions;

        // TODO: configure image options

        builder.setProgressiveRenderingEnabled(true);

        return this;
    }

    @NonNull
    @CheckResult
    @SuppressWarnings({"unchecked", "ConstantConditions"})
    public RequestBuilder<TranscodeType> listener(@Nullable RequestListener<TranscodeType> requestListener) {
        builder.setRequestListener(listener = new FetchListener(requestListener));

        return this;
    }

    @NonNull
    public ViewTarget<ImageView, TranscodeType> into(@NonNull final ImageView view) {
        final ImagePipeline pipeline = Fresco.getImagePipeline();

        Log.i(TAG, msg("into: " + builder.getSourceUri() + ", view: " + view));

        final DataSource<CloseableReference<CloseableImage>> dsImage = pipeline.fetchDecodedImage(getImageRequest(), getCallerContext());
        dsImage.subscribe(getIntoSubscriber(view), getPreloadExecutor());

        return (ViewTarget<ImageView, TranscodeType>) (target = withDs(view, dsImage));
    }

    @NonNull
    public Target<TranscodeType> preload() {
        // TODO: use this.options for customization

        Log.i(TAG, msg("preload: " + builder.getSourceUri()));

        final ImagePipeline pipeline = Fresco.getImagePipeline();

        // to disk
        final DataSource<Void> dsvDisk = pipeline.prefetchToDiskCache(getImageRequest(), getCallerContext());
        dsvDisk.subscribe(getPreloadSubscriber(), getPreloadExecutor());

        // to memory
//        final DataSource<Void> dsvBitmap = pipeline.prefetchToBitmapCache(getImageRequest(), getCallerContext());
//        dsvBitmap.subscribe(getPreloadSubscriber(), getPreloadExecutor());

        // return EMPTY instance
        return (target = withDs(null, dsvDisk /*, dsvBitmap*/));
    }

    @NonNull
    private DataSubscriber<CloseableReference<CloseableImage>> getIntoSubscriber(@NonNull final ImageView view) {
        return new BitmapExtractor(view);
    }

    /** Get instance of the thread pool / executor. */
    @NonNull
    private Executor getPreloadExecutor() {
        if (null == _executor) {
            synchronized (_sync) {
                if (null == _executor) {
                    _executor = Executors.newFixedThreadPool(_cores * 2 - 1, Helpers.withPrefix("glide"));
                }
            }
        }

        return _executor;
    }

    @NotNull
    private DataSubscriber<Void> getPreloadSubscriber() {
        return new DataSubscriber<Void>() {
            @Override
            public void onNewResult(DataSource<Void> dataSource) {

            }

            @Override
            public void onFailure(DataSource<Void> dataSource) {

            }

            @Override
            public void onCancellation(DataSource<Void> dataSource) {

            }

            @Override
            public void onProgressUpdate(DataSource<Void> dataSource) {

            }
        };
    }

    @NonNull
    private Holder withDs(@Nullable final ImageView imageView, @NonNull final DataSource<?>... sources) {
        final Holder holder = new Holder(imageView);
        Collections.addAll(holder.sources, sources);

        return holder;
    }

    /** Holder of running requests/datasources. */
    /* package */ class Holder implements ImageViewTarget<TranscodeType> {
        /* package */ final List<DataSource<?>> sources = new ArrayList<>();
        /* package */ final ImageView imageView;

        /* package */ Holder(@Nullable final ImageView imageView) {
            this.imageView = imageView;

            // store association instance in view Tags
            if (null != this.imageView) {
                this.imageView.setTag(R.id.tag_glide_fresco_holder, this);
            }
        }

        @NonNull
        @Override
        public ImageView getView() {
            return imageView;
        }

        /* package */ void closeAll() {
            int closed = 0;
            for (Object ds : sources) {
                final DataSource<?> types = (DataSource<?>) ds;

                types.close();
                closed++;
            }

            Log.d(TAG, msg("closed: " + closed + " / from: " + sources.size()));

            sources.clear();
        }
    }

    /* package */ class FetchListener extends BaseRequestListener {
        private final RequestListener<TranscodeType> requestListener;
        private volatile TranscodeType resource;

        public FetchListener(final RequestListener<TranscodeType> requestListener) {
            this.requestListener = requestListener;
        }

        @Override
        public void onRequestSuccess(@Nullable final ImageRequest request, final String requestId, final boolean isPrefetch) {
            super.onRequestSuccess(request, requestId, isPrefetch);

            final TranscodeType resource = getResource();
            final Object model = getCallerContext();
            final Target<TranscodeType> target = RequestBuilder.this.target;
            final com.bumptech.glide.load.DataSource source = null;
            final boolean isFirstResource = false;

            // skip requests without extracted image
            final String url = null != request ? String.valueOf(request.getSourceUri()) : "<null>";
            if (null == resource) {
                Log.d(TAG, msg("no resource: " + url + ", prefetch: " + isPrefetch));
                return;
            } else {
                Log.d(TAG, msg("request success: " + url + ", drawable: " + resource));
            }

//            UiThreadImmediateExecutorService.getInstance().execute(() ->
            requestListener.onResourceReady(resource, model, target, source, isFirstResource);
//            );
        }

        @Override
        public void onRequestFailure(ImageRequest request, String requestId, Throwable throwable, boolean isPrefetch) {
            final GlideException exception = new GlideException();
            final Object model = getCallerContext();
            final Target<TranscodeType> target = RequestBuilder.this.target;
            final boolean isFirstResource = false;

            // set the cause of the exception
            if(null != throwable) exception.initCause(throwable);

//            UiThreadImmediateExecutorService.getInstance().execute(() ->
            requestListener.onLoadFailed(exception, model, target, isFirstResource);
//            );
        }

        public TranscodeType getResource() {
            return resource;
        }

        public void setResource(TranscodeType resource) {
            this.resource = resource;
        }
    }

    /** Helper class that try to extract bitmap and trim memory usage in case of {@link OutOfMemoryError}. */
    private class BitmapExtractor extends BaseBitmapDataSubscriber {
        /** How many times we should try to trim memory usage before give up.*/
        /* package */ static final int ATTEMPTS = 1;
        /** Reference on view that waits for extracted image. */
        private final ImageView view;

        /* package */ BitmapExtractor(@NonNull final ImageView view) {
            this.view = view;
        }

        @Override
        protected void onFailureImpl(DataSource<CloseableReference<CloseableImage>> dataSource) {
            if (null != dataSource) {
                dataSource.close();
            }

            Log.w(TAG, msg("failure: " + builder.getSourceUri()));

            // TODO: set placeholder for imageview
            if (null != listener) {
                final Throwable cause = dataSource != null ? dataSource.getFailureCause() : null;
                listener.onRequestFailure(null, null, cause, false);
            }
        }

        @Override
        protected void onNewResultImpl(@Nullable final Bitmap bitmap) {
            if (null == bitmap) {
                Log.w(TAG, msg("empty: " + builder.getSourceUri()));
                return;
            }

            Log.i(TAG, msg("bitmap received: " + builder.getSourceUri()));

            final Resources r = view.getResources();
            final Bitmap bmpCopy = copyResultBitmap(bitmap);

            // we cannot extract image, return failure.
            if (null == bmpCopy) {
                Log.w(TAG, msg("empty copy: " + builder.getSourceUri()));

                if (null != listener) {
                    listener.onRequestFailure(null, null, null, false);
                }

                return;
            }

            final BitmapDrawable drawable = new BitmapDrawable(r, bmpCopy);

            // do in MAIN thread
            getUiThreadExecutor(view, () -> {
                Log.i(TAG, msg("drawable set from: " + builder.getSourceUri() + ", drawable: " + drawable));

                Helpers.recycleAndSetNewDrawable(view, drawable);

                if (null != listener) {
                    listener.setResource((TranscodeType) drawable);
                    listener.onRequestSuccess(null, null, false);
                }
            });
        }

        /** Try to extract copy of bitmap with 1 attempt to trim memory usage. */
        @Nullable
        private Bitmap copyResultBitmap(@NotNull final Bitmap bitmap) {
            Bitmap bmpCopy = null;

            // try to get copy of bitmap for UI thread
            for (int i = 0; i < ATTEMPTS; i++) {
                try {
                    // do not allow many memory intensive operations at the same time.
                    // Allow next operation only when we cleanup memory of source image.
                    synchronized (_syncCopy) {
                        bmpCopy = bitmap.copy(bitmap.getConfig(), false);

                        // cleanup the source of image to reduce the memory usage of the app
                        if (!bitmap.isRecycled()) bitmap.recycle();
                    }

                    break;
                } catch (final Throwable throwable) { // possible: OutOfMemoryError
                    Log.w(TAG, msg("captured error: " + throwable.getClass().getSimpleName()), throwable);

                    final Context context = view.getContext();
                    if (null == context) break;
                    if (!(context.getApplicationContext() instanceof Application)) break;

                    // force fresco and app to trim memory usage
                    final Application application = (Application) context.getApplicationContext();
                    application.onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_BACKGROUND);

                    // force GC memory cleanup
                    Runtime.getRuntime().gc();
                }
            }

            return bmpCopy;
        }
    }

    private void getUiThreadExecutor(@NonNull final ImageView view, @NonNull final Runnable runnable) {
        if (view.post(runnable)) {
            Log.d(TAG, msg("Bitmap posted for processing. Post."));
        } else {
            UiThreadImmediateExecutorService.getInstance().execute(runnable);
            Log.d(TAG, msg("Bitmap posted for processing. Executor."));
        }
    }
}
