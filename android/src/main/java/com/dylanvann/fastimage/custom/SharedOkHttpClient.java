package com.dylanvann.fastimage.custom;

import android.content.Context;
import android.util.Log;

import com.dylanvann.fastimage.custom.persistence.ObjectBox;

import java.io.File;

import okhttp3.Cache;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class SharedOkHttpClient {
    private static SharedOkHttpClient instance;

    private final okhttp3.OkHttpClient client;

    private SharedOkHttpClient(Context context) {
        this.client = new okhttp3.OkHttpClient.Builder()
                .cache(new Cache(
                        new File(context.getCacheDir(), "http_cache"),
                        50L * 1024L * 1024L // 50 MiB
                ))
                .addInterceptor(chain -> {
                    Request request = chain.request();
                    String url = request.url().toString();

                    // add etag to request if set
                    String prevEtag = ObjectBox.getEtagByUrl(url);
//                    if (prevEtag != null) {
//                        request = request.newBuilder()
//                                .header("If-None-Match", prevEtag)
//                                .build();
//                        Log.d("HannoDebug", "We added the etag to the header with" + prevEtag);
//                    }

                    Response response = chain.proceed(request);

                    // update etag if changes
                    String responseEtag = response.header("etag");
                    if (responseEtag != null && !responseEtag.equals(prevEtag)) {
                        ObjectBox.putOrUpdateEtag(url, responseEtag);
                        Log.d("HannoDebug", "We updated the etag from " + prevEtag + " -> " + responseEtag);
                    }

                    return response;
                })
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
