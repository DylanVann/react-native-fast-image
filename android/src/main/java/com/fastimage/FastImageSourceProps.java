package com.fastimage;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.model.Headers;
import com.bumptech.glide.load.model.LazyHeaders;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.ReadableType;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

// A source ({ uri, headers, priority, cache, ... }) as JS sent it, read once
// where it comes in (the view's props, the module's functions): everything
// else reads these fields, not the map. The specs can't type a source (one or
// several, and headers, are UnsafeMixed/UnsafeObject), so a value that's
// missing, of another type or unknown gets its default here instead of
// throwing where it's read. (iOS's RCTConvert+FFFastImage also defaults
// unknown values, but converts some of another type, e.g. a number string.)
final class FastImageSourceProps {
    private static final Map<String, FastImageCacheControl> CACHE_CONTROLS = new HashMap<>();
    private static final Map<String, Priority> PRIORITIES = new HashMap<>();

    static {
        CACHE_CONTROLS.put("immutable", FastImageCacheControl.IMMUTABLE);
        CACHE_CONTROLS.put("web", FastImageCacheControl.WEB);
        CACHE_CONTROLS.put("cacheOnly", FastImageCacheControl.CACHE_ONLY);
        // React Native's ImageURISource value, which views take. Its others
        // (e.g. 'reload') are immutable, as any value this map doesn't have.
        CACHE_CONTROLS.put("only-if-cached", FastImageCacheControl.CACHE_ONLY);
        PRIORITIES.put("low", Priority.LOW);
        PRIORITIES.put("normal", Priority.NORMAL);
        PRIORITIES.put("high", Priority.HIGH);
    }

    // A string, or null.
    @Nullable
    final String uri;
    // String values, and numbers and booleans as strings (as fetch's Headers
    // converts them, and iOS); others (null, objects) are left out.
    // Headers.DEFAULT without any (the same cache key as no headers).
    final Headers headers;
    final FastImageCacheControl cache;
    // Null if the source doesn't set one (preload then uses low): a value it
    // doesn't know, or one of another type, is set, as on iOS (hasPriority).
    @Nullable
    final Priority priority;
    final boolean memoryCache;
    final boolean diskCache;
    // Null without one, or for an empty one.
    @Nullable
    final String cacheKey;
    // Several sources: each one's size, to pick the one for the view's size.
    final double width;
    final double height;
    final double scale;
    // A bundled image (from require()), whose scale is its density.
    final boolean packagerAsset;
    // Its ThumbHash, or its blurDataUri if that's a data uri (JS warns about
    // another), or null. It isn't part of the source's identity (equals): a
    // new one shows without loading the image again.
    @Nullable
    final String placeholder;
    // Whether it has a thumbhash or blurDataUri key, even an empty one: the
    // `placeholder` prop is then a preview, not a url to load.
    final boolean hasPlaceholderKey;
    // Only for describing an invalid source in its error.
    private final ReadableMap map;

    private FastImageSourceProps(ReadableMap map) {
        this.map = map;
        uri = string(map, "uri");
        headers = headers(map);
        cache = orDefault(CACHE_CONTROLS.get(string(map, "cache")), FastImageCacheControl.IMMUTABLE);
        priority = map.hasKey("priority") && !map.isNull("priority")
                ? orDefault(PRIORITIES.get(string(map, "priority")), Priority.NORMAL)
                : null;
        memoryCache = bool(map, "memoryCache", true);
        diskCache = bool(map, "diskCache", true);
        String key = string(map, "cacheKey");
        cacheKey = key == null || key.isEmpty() ? null : key;
        width = number(map, "width", 0);
        height = number(map, "height", 0);
        scale = number(map, "scale", 1);
        packagerAsset = map.hasKey("__packager_asset");
        hasPlaceholderKey = map.hasKey("thumbhash") || map.hasKey("blurDataUri");
        String thumbhash = string(map, "thumbhash");
        String blurDataUri = string(map, "blurDataUri");
        placeholder = thumbhash != null && !thumbhash.isEmpty() ? thumbhash
                : blurDataUri != null && FastImageThumbHash.isDataUri(blurDataUri) ? blurDataUri
                : null;
    }

    static FastImageSourceProps parse(ReadableMap map) {
        return new FastImageSourceProps(map);
    }

    // The array's entry as a source, or null for one that isn't an object.
    @Nullable
    static FastImageSourceProps parse(ReadableArray array, int index) {
        return array.getType(index) == ReadableType.Map ? new FastImageSourceProps(array.getMap(index)) : null;
    }

    // Whether it has a uri to load (not missing, null or blank).
    boolean hasUri() {
        return uri != null && !uri.trim().isEmpty();
    }

    Priority priorityOrNormal() {
        return priority != null ? priority : Priority.NORMAL;
    }

    // The source as JS sent it, without its thumbhash and blurDataUri (a data
    // uri can be long), for an error.
    String describe() {
        HashMap<String, Object> described = map.toHashMap();
        described.remove("thumbhash");
        described.remove("blurDataUri");
        return described.toString();
    }

    private static Headers headers(ReadableMap map) {
        if (!map.hasKey("headers") || map.getType("headers") != ReadableType.Map) return Headers.DEFAULT;
        ReadableMap headers = map.getMap("headers");
        ReadableMapKeySetIterator iterator = headers.keySetIterator();
        LazyHeaders.Builder builder = null;
        while (iterator.hasNextKey()) {
            String name = iterator.nextKey();
            String value = headerValue(headers, name);
            if (value == null) continue;
            if (builder == null) builder = new LazyHeaders.Builder();
            builder.addHeader(name, value);
        }
        return builder != null ? builder.build() : Headers.DEFAULT;
    }

    // A header's value as a string, as JS's String() gives it (a whole
    // number without ".0"), or null for one that can't be sent.
    @Nullable
    private static String headerValue(ReadableMap headers, String name) {
        switch (headers.getType(name)) {
            case String:
                return headers.getString(name);
            case Boolean:
                return headers.getBoolean(name) ? "true" : "false";
            case Number: {
                double number = headers.getDouble(name);
                return number == Math.rint(number) && Math.abs(number) < 1e15
                        ? Long.toString((long) number)
                        : Double.toString(number);
            }
            default:
                return null;
        }
    }

    @Nullable
    private static String string(ReadableMap map, String key) {
        return map.hasKey(key) && map.getType(key) == ReadableType.String ? map.getString(key) : null;
    }

    private static boolean bool(ReadableMap map, String key, boolean fallback) {
        return map.hasKey(key) && map.getType(key) == ReadableType.Boolean ? map.getBoolean(key) : fallback;
    }

    private static double number(ReadableMap map, String key, double fallback) {
        return map.hasKey(key) && map.getType(key) == ReadableType.Number ? map.getDouble(key) : fallback;
    }

    private static <T> T orDefault(@Nullable T value, T fallback) {
        return value != null ? value : fallback;
    }

    // The same image, loaded the same way: everything but the placeholder.
    @Override
    public boolean equals(@Nullable Object o) {
        if (this == o) return true;
        if (!(o instanceof FastImageSourceProps)) return false;
        FastImageSourceProps other = (FastImageSourceProps) o;
        return memoryCache == other.memoryCache
                && diskCache == other.diskCache
                // As Double.equals: NaN (from JS) equals itself.
                && Double.compare(width, other.width) == 0
                && Double.compare(height, other.height) == 0
                && Double.compare(scale, other.scale) == 0
                && packagerAsset == other.packagerAsset
                && cache == other.cache
                && priority == other.priority
                && Objects.equals(uri, other.uri)
                && Objects.equals(cacheKey, other.cacheKey)
                && headers.equals(other.headers);
    }

    @Override
    public int hashCode() {
        return Objects.hash(uri, cacheKey, cache, priority, memoryCache, diskCache);
    }

    @NonNull
    @Override
    public String toString() {
        return "FastImageSourceProps{uri=" + uri + ", cacheKey=" + cacheKey + "}";
    }
}
