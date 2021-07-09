package com.dylanvann.fastimage;

import android.webkit.CookieManager;

import java.util.Collections;
import java.util.List;

import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.HttpUrl;

public class FastImageCookieJar implements CookieJar {
    private CookieManager cookieManager;

    private CookieManager getCookieManager() {
        if (cookieManager == null) {
            cookieManager = CookieManager.getInstance();
        }
        
        return cookieManager;
    }

    @Override
    public void saveFromResponse(HttpUrl url, List<Cookie> cookies) {
        // Do nothing
    }

    @Override
    public List<Cookie> loadForRequest(HttpUrl url) {
        String cookie = getCookieManager().getCookie(url.toString());

        if (cookie == null || cookie.isEmpty()) {
            return Collections.emptyList();
        }

        return Collections.singletonList(Cookie.parse(url, cookie));
    }
}
