package com.fastimage;

import okhttp3.OkHttpClient;

// The client FastImage's downloads start from. (In React Native, the library's
// version of this class uses React Native's shared client.)
final class FastImageHttpClient {
    private static final OkHttpClient CLIENT = new OkHttpClient();

    private FastImageHttpClient() {
    }

    static OkHttpClient shared() {
        return CLIENT;
    }
}
