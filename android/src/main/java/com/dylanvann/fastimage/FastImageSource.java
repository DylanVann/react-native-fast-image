package com.dylanvann.fastimage;

import android.content.Context;
import android.content.res.Resources;
import android.net.Uri;
import android.text.TextUtils;

import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.Headers;
import com.facebook.react.views.imagehelper.ImageSource;

import javax.annotation.Nullable;

public class FastImageSource extends ImageSource {
    private static final String DATA_SCHEME = "data";
    private static final String LOCAL_RESOURCE_SCHEME = "res";
    private static final String ANDROID_RESOURCE_SCHEME = "android.resource";
    private static final String ANDROID_CONTENT_SCHEME = "content";
    private static final String LOCAL_FILE_SCHEME = "file";
    private static final String ASSET_SCHEME = "asset";
    private final Headers mHeaders;
    private Uri mUri;

    public static boolean isBase64Uri(Uri uri) {
        return DATA_SCHEME.equals(uri.getScheme());
    }

    public static boolean isLocalResourceUri(Uri uri) {
        return LOCAL_RESOURCE_SCHEME.equals(uri.getScheme());
    }

    public static boolean isResourceUri(Uri uri) {
        return ANDROID_RESOURCE_SCHEME.equals(uri.getScheme());
    }

    public static boolean isContentUri(Uri uri) {
        return ANDROID_CONTENT_SCHEME.equals(uri.getScheme());
    }

    public static boolean isLocalFileUri(Uri uri) {
        return LOCAL_FILE_SCHEME.equals(uri.getScheme());
    }

    public static boolean isAssetUri(Uri uri) {
        return ASSET_SCHEME.equals(uri.getScheme());
    }

    public FastImageSource(Context context, String source) {
        this(context, source, null);
    }

    public FastImageSource(Context context, String source, @Nullable Headers headers) {
        this(context, source, 0.0d, 0.0d, headers);
    }

    public FastImageSource(Context context, String source, double width, double height, @Nullable Headers headers) {
        super(context, source, width, height);
        mHeaders = headers == null ? Headers.DEFAULT : headers;
        mUri = super.getUri();
        if (mUri == null || TextUtils.isEmpty(mUri.toString())) {
            // A bundled image that release builds package as a raw resource
            // (e.g. an SVG, which isn't a drawable): React Native's
            // ImageSource only looks for drawables.
            Uri raw = rawResourceUri(context, source);
            if (raw != null) mUri = raw;
        }

        if (isResource() && TextUtils.isEmpty(mUri.toString())) {
            throw new Resources.NotFoundException("Local Resource Not Found. Resource: '" + getSource() + "'.");
        }

        if (isLocalResourceUri(mUri)) {
            // Convert res:/ scheme to android.resource:// so
            // glide can understand the uri.
            mUri = Uri.parse(mUri.toString().replace("res:/", ANDROID_RESOURCE_SCHEME + "://" + context.getPackageName() + "/"));
        }

        if (isAssetUri(mUri) && mUri.getPath() != null) {
            // Convert asset:/ (a file in the app's assets, as React Native's
            // Image supports) to file:///android_asset/, which Glide loads.
            mUri = Uri.parse(LOCAL_FILE_SCHEME + ":///android_asset" + mUri.getPath());
        }
    }


    // The raw resource with the source's name (a bundled image's source is
    // its resource name, e.g. src_images_logo), or null.
    @Nullable
    private static Uri rawResourceUri(Context context, @Nullable String source) {
        if (source == null || source.isEmpty() || source.contains(":")) return null;
        int id = context.getResources().getIdentifier(source, "raw", context.getPackageName());
        if (id == 0) return null;
        return Uri.parse(ANDROID_RESOURCE_SCHEME + "://" + context.getPackageName() + "/" + id);
    }

    public boolean isBase64Resource() {
        return mUri != null && FastImageSource.isBase64Uri(mUri);
    }

    public boolean isResource() {
        return mUri != null && FastImageSource.isResourceUri(mUri);
    }

    public boolean isLocalFile() {
        return mUri != null && FastImageSource.isLocalFileUri(mUri);
    }

    public boolean isContentUri() {
        return mUri != null && FastImageSource.isContentUri(mUri);
    }

    public Object getSourceForLoad() {
        if (isContentUri()) {
            return getSource();
        }
        if (isBase64Resource()) {
            return getSource();
        }
        if (isResource()) {
            return getUri();
        }
        if (isLocalFile()) {
            return getUri().toString();
        }
        return new FastImageUrl(getGlideUrl());
    }

    @Override
    public Uri getUri() {
        return mUri;
    }

    public Headers getHeaders() {
        return mHeaders;
    }

    // Set for `cache: 'web'`.
    private boolean mWebCache = false;

    void setWebCache(boolean webCache) {
        mWebCache = webCache;
    }

    boolean isWebCache() {
        return mWebCache;
    }

    // `memoryCache`: whether the decoded image is kept in the memory cache.
    private boolean mMemoryCache = true;

    void setMemoryCache(boolean memoryCache) {
        mMemoryCache = memoryCache;
    }

    boolean isMemoryCache() {
        return mMemoryCache;
    }

    // An http(s) url.
    boolean isRemote() {
        String scheme = mUri == null ? null : mUri.getScheme();
        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
    }

    // `cacheKey`: the key to cache the image under instead of its url.
    @Nullable
    private String mCacheKey = null;

    void setCacheKey(@Nullable String cacheKey) {
        mCacheKey = cacheKey == null || cacheKey.isEmpty() ? null : cacheKey;
    }

    public GlideUrl getGlideUrl() {
        String url = getUri().toString();
        if (mWebCache) {
            // Follows the HTTP cache, which is keyed by url.
            return new FastImageWebGlideUrl(url, getHeaders());
        }
        if (mCacheKey != null) {
            return new FastImageKeyedGlideUrl(url, getHeaders(), mCacheKey);
        }
        return new GlideUrl(url, getHeaders());
    }
}
