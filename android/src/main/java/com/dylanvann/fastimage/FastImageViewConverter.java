package com.dylanvann.fastimage;

import android.widget.ImageView;
import android.widget.ImageView.ScaleType;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.LazyHeaders;
import com.facebook.react.bridge.NoSuchKeyException;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;

import java.util.HashMap;
import java.util.Map;

class FastImageViewConverter {
    static GlideUrl glideUrl(ReadableMap source) {
        final String uriProp = source.getString("uri");
        // Get the headers prop and add to glideUrl.
        GlideUrl glideUrl;
        try {
            final ReadableMap headersMap = source.getMap("headers");
            ReadableMapKeySetIterator headersIterator = headersMap.keySetIterator();
            LazyHeaders.Builder headersBuilder = new LazyHeaders.Builder();
            while (headersIterator.hasNextKey()) {
                String key = headersIterator.nextKey();
                String value = headersMap.getString(key);
                headersBuilder.addHeader(key, value);
            }
            LazyHeaders headers = headersBuilder.build();
            glideUrl = new GlideUrl(uriProp, headers);
        } catch (NoSuchKeyException e) {
            // If there is no headers object.
            glideUrl = new GlideUrl(uriProp);
        }
        return glideUrl;
    }

    private static Map<String, Priority> REACT_PRIORITY_MAP =
            new HashMap<String, Priority>() {{
                put("low", Priority.LOW);
                put("normal", Priority.NORMAL);
                put("high", Priority.HIGH);
            }};

    static Priority priority(ReadableMap source) {
        // Get the priority prop.
        String priorityProp = "normal";
        try {
            priorityProp = source.getString("priority");
        } catch (Exception e) {
            // Noop.
        }
        final Priority priority = REACT_PRIORITY_MAP.get(priorityProp);
        return priority;
    }

    private static Map<String, ImageView.ScaleType> REACT_RESIZE_MODE_MAP =
            new HashMap<String, ImageView.ScaleType>() {{
                put("contain", ScaleType.FIT_CENTER);
                put("cover", ScaleType.CENTER_CROP);
                put("stretch", ScaleType.FIT_XY);
                put("center", ScaleType.CENTER);
            }};

    public static ScaleType scaleType(String resizeMode) {
        if (resizeMode == null) resizeMode = "cover";
        final ImageView.ScaleType scaleType = REACT_RESIZE_MODE_MAP.get(resizeMode);
        return scaleType;
    }
}
