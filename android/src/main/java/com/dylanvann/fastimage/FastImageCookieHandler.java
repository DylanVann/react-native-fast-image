package com.dylanvann.fastimage;

import android.content.Context;
import android.os.Build;
import android.text.TextUtils;
import android.webkit.CookieManager;
import android.webkit.CookieSyncManager;

import androidx.annotation.Nullable;

import java.net.CookieHandler;
import java.net.URI;
import java.util.Collections;
import java.util.List;
import java.util.Map;

// Reads and stores cookies in Android's cookie store (the WebView's
// CookieManager), which React Native's networking (fetch) and its Image
// component use. Image requests then send the cookies the app's other requests
// got, as on iOS. Does what React Native's ForwardingCookieHandler does,
// without the ReactContext that one needs (up to at least 0.77). Used through
// OkHttp's JavaNetCookieJar, which parses the cookies.
final class FastImageCookieHandler extends CookieHandler {
    private final Context context;
    @Nullable
    private CookieManager cookieManager;

    FastImageCookieHandler(Context context) {
        this.context = context.getApplicationContext();
    }

    @Override
    public Map<String, List<String>> get(URI uri, Map<String, List<String>> requestHeaders) {
        CookieManager cookieManager = cookieManager();
        if (cookieManager == null) return Collections.emptyMap();
        String cookies = cookieManager.getCookie(uri.toString());
        if (TextUtils.isEmpty(cookies)) return Collections.emptyMap();
        return Collections.singletonMap("Cookie", Collections.singletonList(cookies));
    }

    @Override
    public void put(URI uri, Map<String, List<String>> responseHeaders) {
        CookieManager cookieManager = cookieManager();
        if (cookieManager == null) return;
        String url = uri.toString();
        boolean added = false;
        for (Map.Entry<String, List<String>> header : responseHeaders.entrySet()) {
            String name = header.getKey();
            if (!"Set-Cookie".equalsIgnoreCase(name) && !"Set-Cookie2".equalsIgnoreCase(name)) continue;
            for (String cookie : header.getValue()) {
                cookieManager.setCookie(url, cookie);
                added = true;
            }
        }
        if (added) flush(cookieManager);
    }

    @SuppressWarnings("deprecation")
    private static void flush(CookieManager cookieManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.flush();
        } else {
            CookieSyncManager.getInstance().sync();
        }
    }

    // null while the WebView isn't available (not installed, or being
    // updated): requests go without cookies then, instead of failing.
    @Nullable
    @SuppressWarnings("deprecation")
    private synchronized CookieManager cookieManager() {
        if (cookieManager == null) {
            try {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
                    CookieSyncManager.createInstance(context);
                }
                cookieManager = CookieManager.getInstance();
            } catch (Exception e) {
                return null;
            }
        }
        return cookieManager;
    }
}
