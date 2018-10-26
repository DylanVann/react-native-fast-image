package com.dylanvann.fastimage;

import android.content.Context;
import android.net.Uri;
import android.util.Log;

import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.Headers;
import com.facebook.react.views.imagehelper.ImageSource;

import javax.annotation.Nullable;

public class FastImageSource extends ImageSource {
    private static final String LOCAL_RESOURCE_SCHEME = "res";
    private static final String ANDROID_RESOURCE_SCHEME = "android.resource";
    private Headers mHeaders;
    private Uri mUri;

    public static boolean isLocalResourceUri (Uri uri) {
        return LOCAL_RESOURCE_SCHEME.equals(uri.getScheme());
    }

    public static boolean isResourceUri (Uri uri) {
        return ANDROID_RESOURCE_SCHEME.equals(uri.getScheme());
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

        if (isLocalResourceUri(mUri)) {
            // Convert res:/ scheme to android.resource:// so
            // glide can understand the uri.
            mUri = Uri.parse(mUri.toString().replace("res:/", ANDROID_RESOURCE_SCHEME + "://" + context.getPackageName() + "/"));
        }
    }

    public boolean isBase64Resource () {
        return mUri != null && "data".equals(mUri.getScheme());
    }

    @Override
    public Uri getUri() {
        return mUri;
    }

    public Headers getHeaders() {
        return mHeaders;
    }

    public GlideUrl getGlideUrl() {
        return new GlideUrl(getUri().toString(), getHeaders());
    }
}
