package com.bumptech.glide.request.target;

import androidx.annotation.NonNull;
import android.view.View;

import kotlin.NotImplementedError;

/**
 * @see <a href="https://github.com/bumptech/glide/blob/master/library/src/main/java/com/bumptech/glide/request/target/ViewTarget.java">Original</a>
 * */
public interface ViewTarget<T extends View, Z> extends Target<Z> {
    @NonNull
    T getView();
}
