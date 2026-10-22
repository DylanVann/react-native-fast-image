package com.fastimage;

import static com.bumptech.glide.request.RequestOptions.signatureOf;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.widget.ImageView;
import android.widget.ImageView.ScaleType;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.request.RequestOptions;
import com.bumptech.glide.signature.ApplicationVersionSignature;
import com.facebook.react.bridge.JSApplicationIllegalArgumentException;

import java.util.HashMap;
import java.util.Map;

import javax.annotation.Nullable;

class FastImageViewConverter {
    static final Drawable TRANSPARENT_DRAWABLE = new ColorDrawable(Color.TRANSPARENT);

    // objectFit's scale types. scale-down and none are laid out by the view
    // itself, at the image's own size in dp (see
    // FastImageViewWithUrl.updateImageMatrix).
    private static final Map<String, ImageView.ScaleType> FAST_IMAGE_OBJECT_FIT_MAP =
            new HashMap<String, ImageView.ScaleType>() {{
                put("contain", ScaleType.FIT_CENTER);
                put("cover", ScaleType.CENTER_CROP);
                put("fill", ScaleType.FIT_XY);
                put("scale-down", ScaleType.CENTER_INSIDE);
                put("none", ScaleType.CENTER);
            }};

    // The source to load, with its uri resolved to one Android understands, or
    // null without a uri.
    static @Nullable
    FastImageSource getImageSource(Context context, @Nullable FastImageSourceProps source) {
        if (source == null || !source.hasUri()) return null;
        FastImageSource imageSource = new FastImageSource(context, source.uri, source.headers);
        imageSource.setWebCache(source.cache == FastImageCacheControl.WEB);
        imageSource.setMemoryCache(source.memoryCache);
        imageSource.setDiskCache(source.diskCache);
        imageSource.setCacheKey(source.cacheKey);
        return imageSource;
    }

    static RequestOptions getOptions(Context context, @Nullable FastImageSource imageSource, @Nullable FastImageSourceProps source) {
        final Priority priority = source != null ? source.priorityOrNormal() : Priority.NORMAL;
        final FastImageCacheControl cacheControl = source != null ? source.cache : FastImageCacheControl.IMMUTABLE;
        DiskCacheStrategy diskCacheStrategy = DiskCacheStrategy.AUTOMATIC;
        boolean onlyFromCache = false;
        boolean skipMemoryCache = false;
        switch (cacheControl) {
            case WEB:
                // If using none then OkHttp integration should be used for caching.
                diskCacheStrategy = DiskCacheStrategy.NONE;
                skipMemoryCache = true;
                break;
            case CACHE_ONLY:
                onlyFromCache = true;
                break;
            case IMMUTABLE:
                // Use defaults.
                break;
        }

        // diskCache false: neither written to Glide's disk cache nor read from
        // it, nor to an HTTP cache (NO_STORE).
        final boolean noStore = imageSource != null && !imageSource.isDiskCache();
        if (noStore) {
            diskCacheStrategy = DiskCacheStrategy.NONE;
        }

        RequestOptions options = new RequestOptions()
                .diskCacheStrategy(diskCacheStrategy)
                .onlyRetrieveFromCache(onlyFromCache)
                // memoryCache false: only kept on disk.
                .skipMemoryCache(skipMemoryCache || (imageSource != null && !imageSource.isMemoryCache()))
                .priority(priority)
                .placeholder(TRANSPARENT_DRAWABLE)
                .set(FastImageGlide.REQUEST, true)
                .set(FastImageGlide.NO_STORE, noStore);

        // imageSource is null when only the placeholder prop is shown.
        if (imageSource != null && imageSource.isResource()) {
            // Every local resource (drawable) in Android has its own unique numeric id, which are
            // generated at build time. Although these ids are unique, they are not guaranteed unique
            // across builds. The underlying glide implementation caches these resources. To make
            // sure the cache does not return the wrong image, we should clear the cache when the
            // application version changes. Adding a cache signature for only these local resources
            // solves this issue: https://github.com/DylanVann/react-native-fast-image/issues/402
            options = options.apply(signatureOf(ApplicationVersionSignature.obtain(context)));
        }

        return options;
    }

    static ScaleType getScaleType(String propValue) {
        return getValue("objectFit", "cover", FAST_IMAGE_OBJECT_FIT_MAP, propValue);
    }

    private static <T> T getValue(String propName, String defaultPropValue, Map<String, T> map, String propValue) {
        if (propValue == null) propValue = defaultPropValue;
        T value = map.get(propValue);
        if (value == null)
            throw new JSApplicationIllegalArgumentException("FastImage, invalid " + propName + " : " + propValue);
        return value;
    }
}
