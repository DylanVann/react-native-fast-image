package com.bumptech.glide.request;

import androidx.annotation.Nullable;

import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.target.Target;

/**
 * @see <a href="https://github.com/bumptech/glide/blob/master/library/src/main/java/com/bumptech/glide/request/RequestListener.java">Original</a>
 */
public interface RequestListener<R> {
    boolean onLoadFailed(
            @Nullable GlideException e, Object model, Target<R> target, boolean isFirstResource);

    boolean onResourceReady(
            R resource, Object model, Target<R> target, DataSource dataSource, boolean isFirstResource);
}
