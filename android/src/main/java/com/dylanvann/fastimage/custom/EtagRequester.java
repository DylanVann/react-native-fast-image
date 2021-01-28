package com.dylanvann.fastimage.custom;

import com.dylanvann.fastimage.custom.persistence.ObjectBox;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class EtagRequester {
    /**
     * Requests etag at the server. Won't call callback on failure or if
     * etas hasn't changed.
     * @param url
     * @param callback
     */
    public static void requestEtag(final String url, final EtagCallback callback) {
        String prevEtag = ObjectBox.getEtagByUrl(url);

        OkHttpClient client = SharedOkHttpClient.getInstance(null).getClient();
        Request.Builder request = new Request.Builder()
                .url(url);

        if (prevEtag != null) {
            request.addHeader("If-None-Match", prevEtag);
        }

        client.newCall(request.build()).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                e.printStackTrace();
            }

            @Override
            public void onResponse(Call call, Response response) {
                if (response.code() == 200) {
                    String etag = response.header("etag");
                    if (etag != null) {
                        callback.onEtag(etag);
                    }
                }
            }
        });
    }
}
