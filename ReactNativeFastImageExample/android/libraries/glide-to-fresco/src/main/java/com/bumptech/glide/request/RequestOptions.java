package com.bumptech.glide.request;

import android.graphics.drawable.Drawable;
import androidx.annotation.CheckResult;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.load.Key;

import kotlin.NotImplementedError;

/**
 * @see <a href="https://github.com/bumptech/glide/blob/master/library/src/main/java/com/bumptech/glide/request/RequestOptions.java">Original</a>
 * */
public class RequestOptions {

    private Drawable placeholder;

    @NonNull
    @CheckResult
    public RequestOptions diskCacheStrategy(@NonNull DiskCacheStrategy strategy) {
        /* throw new NotImplementedError(); */

        // TODO: implement me

        return this;
    }

    @NonNull
    @CheckResult
    public RequestOptions priority(@NonNull Priority priority) {
        /* throw new NotImplementedError(); */

        // TODO: implement me

        return this;
    }

    @NonNull
    @CheckResult
    public RequestOptions placeholder(@Nullable Drawable drawable) {
        this.placeholder = drawable;

        return this;
    }

    @NonNull
    @CheckResult
    public RequestOptions onlyRetrieveFromCache(boolean flag) {
        /* throw new NotImplementedError(); */

        // TODO: implement me

        return this;
    }

    @NonNull
    @CheckResult
    public RequestOptions skipMemoryCache(boolean skip) {
        /* throw new NotImplementedError(); */

        // TODO: implement me

        return this;
    }

    @Nullable
    public Drawable getPlaceholder() {
        return placeholder;
    }

    public RequestOptions signature(@NonNull final Key signature){
        // TODO: implement me

        return this;
    }

    @NonNull
    @CheckResult
    public RequestOptions apply(@NonNull final RequestOptions o) {
        // TODO: implement me

        return this;
    }

    /** Returns a {@link RequestOptions} object with {@link #signature} set. */
    @NonNull
    @CheckResult
    public static RequestOptions signatureOf(@NonNull Key signature) {
        return new RequestOptions().signature(signature);
    }
}
