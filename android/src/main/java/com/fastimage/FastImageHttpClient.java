package com.fastimage;

import com.facebook.react.modules.network.CookieJarContainer;
import com.facebook.react.modules.network.ForwardingCookieHandler;
import com.facebook.react.modules.network.OkHttpClientProvider;

import okhttp3.JavaNetCookieJar;
import okhttp3.OkHttpClient;

// The client FastImage's downloads start from: React Native's shared one, so
// they use the app's interceptors. (Without React Native, the native tests
// have their own version of this class.)
final class FastImageHttpClient {
    private FastImageHttpClient() {
    }

    static OkHttpClient shared() {
        OkHttpClient client = OkHttpClientProvider.getOkHttpClient();
        // React Native's shared client comes with an empty cookie jar (React
        // Native only fills it in for its networking and Image clients), so
        // images were loaded without the app's cookies, unlike on iOS. Use the
        // same cookie store (Android's CookieManager, through React Native's
        // ForwardingCookieHandler). A cookie jar the app set up itself is kept.
        if (client.cookieJar() instanceof CookieJarContainer) {
            return client.newBuilder().cookieJar(new JavaNetCookieJar(new ForwardingCookieHandler())).build();
        }
        return client;
    }
}
