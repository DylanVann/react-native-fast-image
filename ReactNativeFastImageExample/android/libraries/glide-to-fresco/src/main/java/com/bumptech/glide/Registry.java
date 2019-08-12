package com.bumptech.glide;

import androidx.annotation.NonNull;

import com.bumptech.glide.integration.okhttp3.OkHttpUrlLoader;

import kotlin.NotImplementedError;

/**
 * @see <a href="https://github.com/bumptech/glide/blob/master/library/src/main/java/com/bumptech/glide/Registry.java">Original</a>
 * */
public class Registry {
    @NonNull
    public <Model, Data> Registry replace(
            @NonNull Class<Model> modelClass,
            @NonNull Class<Data> dataClass,
            @NonNull OkHttpUrlLoader.Factory factory) {
        throw new NotImplementedError();
    }
}
