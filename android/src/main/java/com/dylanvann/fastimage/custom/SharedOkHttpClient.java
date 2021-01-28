package com.dylanvann.fastimage.custom;

import android.content.Context;

import java.io.File;

import okhttp3.Cache;
import okhttp3.OkHttpClient;

public class SharedOkHttpClient {
    private static SharedOkHttpClient instance;

    private final okhttp3.OkHttpClient client;
    private SharedOkHttpClient(Context context) {
        this.client = new okhttp3.OkHttpClient.Builder()
                .cache(new Cache(
                        new File(context.getCacheDir(), "http_cache"),
                        50L * 1024L * 1024L // 50 MiB
                ))
                .build();
    }

    public static SharedOkHttpClient getInstance(Context context) {
        if (instance == null) {
            instance = new SharedOkHttpClient(context);
        }
        return instance;
    }

    public OkHttpClient getClient() {
        return client;
    }
}
