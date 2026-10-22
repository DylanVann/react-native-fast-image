package com.fastimage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.model.Headers;
import com.facebook.react.bridge.JavaOnlyArray;
import com.facebook.react.bridge.JavaOnlyMap;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.Map;

// A source as JS sends it, read once: each value of the wrong type, or one
// FastImage doesn't know, gets its default instead of throwing (the views and
// the module read only what this gives them).
@RunWith(RobolectricTestRunner.class)
public class FastImageSourcePropsTest {
    @Test
    public void readsEachValue() {
        FastImageSourceProps source = FastImageSourceProps.parse(JavaOnlyMap.of(
                "uri", "https://example.com/a.jpg",
                "headers", JavaOnlyMap.of("x-token", "fast-image"),
                "cache", "web",
                "priority", "high",
                "memoryCache", false,
                "diskCache", false,
                "cacheKey", "a",
                "width", 100,
                "height", 50.5,
                "scale", 3,
                "__packager_asset", true,
                "thumbhash", "1QcSHQRnh493V4dIh4eXh1h4kJUI"));
        assertEquals("https://example.com/a.jpg", source.uri);
        assertTrue(source.hasUri());
        assertEquals("fast-image", source.headers.getHeaders().get("x-token"));
        assertEquals(FastImageCacheControl.WEB, source.cache);
        assertEquals(Priority.HIGH, source.priority);
        assertFalse(source.memoryCache);
        assertFalse(source.diskCache);
        assertEquals("a", source.cacheKey);
        assertEquals(100, source.width, 0);
        assertEquals(50.5, source.height, 0);
        assertEquals(3, source.scale, 0);
        assertTrue(source.packagerAsset);
        assertEquals("1QcSHQRnh493V4dIh4eXh1h4kJUI", source.placeholder);
        assertTrue(source.hasPlaceholderKey);
    }

    @Test
    public void missingValuesAreTheDefaults() {
        FastImageSourceProps source = FastImageSourceProps.parse(new JavaOnlyMap());
        assertNull(source.uri);
        assertFalse(source.hasUri());
        assertSame(Headers.DEFAULT, source.headers);
        assertEquals(FastImageCacheControl.IMMUTABLE, source.cache);
        assertNull(source.priority);
        assertEquals(Priority.NORMAL, source.priorityOrNormal());
        assertTrue(source.memoryCache);
        assertTrue(source.diskCache);
        assertNull(source.cacheKey);
        assertEquals(0, source.width, 0);
        assertEquals(1, source.scale, 0);
        assertFalse(source.packagerAsset);
        assertNull(source.placeholder);
        assertFalse(source.hasPlaceholderKey);
    }

    // What used to throw where it was read (UnexpectedNativeTypeException, a
    // NullPointerException), or what TypeScript allows but FastImage doesn't
    // know.
    @Test
    public void valuesOfAnotherTypeAreTheDefaults() {
        FastImageSourceProps source = FastImageSourceProps.parse(JavaOnlyMap.of(
                "uri", 1,
                "headers", JavaOnlyArray.of("x-token"),
                "cache", 1,
                "priority", 1,
                "memoryCache", "false",
                "diskCache", null,
                "cacheKey", 2,
                "width", "100",
                "height", null,
                "scale", JavaOnlyMap.of(),
                "thumbhash", 3,
                "blurDataUri", "https://example.com/blur.jpg"));
        assertNull(source.uri);
        assertFalse(source.hasUri());
        assertSame(Headers.DEFAULT, source.headers);
        assertEquals(FastImageCacheControl.IMMUTABLE, source.cache);
        // Set, as on iOS (so preload doesn't lower it), but to the default.
        assertEquals(Priority.NORMAL, source.priority);
        assertTrue(source.memoryCache);
        assertTrue(source.diskCache);
        assertNull(source.cacheKey);
        assertEquals(0, source.width, 0);
        assertEquals(0, source.height, 0);
        assertEquals(1, source.scale, 0);
        // Not a data uri, and a thumbhash that isn't a string: no preview,
        // but the keys still make a `placeholder` prop a preview.
        assertNull(source.placeholder);
        assertTrue(source.hasPlaceholderKey);
        assertSame(Headers.DEFAULT, FastImageSourceProps.parse(JavaOnlyMap.of("headers", null)).headers);
        assertSame(Headers.DEFAULT, FastImageSourceProps.parse(JavaOnlyMap.of("headers", "x")).headers);
    }

    @Test
    public void unknownStringsAreTheDefaults() {
        FastImageSourceProps source = FastImageSourceProps.parse(JavaOnlyMap.of(
                "cache", "reload",
                "priority", "urgent",
                "cacheKey", "",
                "uri", "   "));
        assertEquals(FastImageCacheControl.IMMUTABLE, source.cache);
        // Set, so preload doesn't lower it, but to the default.
        assertEquals(Priority.NORMAL, source.priority);
        assertNull(source.cacheKey);
        assertFalse(source.hasUri());
        // React Native's value for cacheOnly.
        assertEquals(FastImageCacheControl.CACHE_ONLY,
                FastImageSourceProps.parse(JavaOnlyMap.of("cache", "only-if-cached")).cache);
    }

    // Only string values are sent: JS converts numbers and booleans (as
    // fetch does), so anything else here (null for a header that isn't set,
    // an object) is left out.
    @Test
    public void headersKeepOnlyStringValues() {
        Map<String, String> headers = FastImageSourceProps.parse(JavaOnlyMap.of("headers", JavaOnlyMap.of(
                "x-token", "fast-image",
                "x-number", 1,
                "x-null", null,
                "x-boolean", true,
                "x-object", JavaOnlyMap.of()))).headers.getHeaders();
        assertEquals("fast-image", headers.get("x-token"));
        assertFalse(headers.containsKey("x-number"));
        assertFalse(headers.containsKey("x-null"));
        assertFalse(headers.containsKey("x-boolean"));
        assertFalse(headers.containsKey("x-object"));
        // None left: the same headers (and cache key) as no headers.
        assertSame(Headers.DEFAULT,
                FastImageSourceProps.parse(JavaOnlyMap.of("headers", JavaOnlyMap.of("x-null", null))).headers);
    }

    @Test
    public void placeholderIsTheThumbhashOrADataUri() {
        assertEquals("data:image/png;base64,AAAA", FastImageSourceProps.parse(JavaOnlyMap.of(
                "thumbhash", "",
                "blurDataUri", "data:image/png;base64,AAAA")).placeholder);
    }

    // The same image loaded the same way, whatever its placeholder: a new
    // thumbhash doesn't load the image again.
    @Test
    public void equalsIgnoresThePlaceholder() {
        FastImageSourceProps a = FastImageSourceProps.parse(JavaOnlyMap.of(
                "uri", "https://example.com/a.jpg", "headers", JavaOnlyMap.of("x-token", "a"), "thumbhash", "a"));
        FastImageSourceProps b = FastImageSourceProps.parse(JavaOnlyMap.of(
                "uri", "https://example.com/a.jpg", "headers", JavaOnlyMap.of("x-token", "a"), "thumbhash", "b"));
        FastImageSourceProps c = FastImageSourceProps.parse(JavaOnlyMap.of(
                "uri", "https://example.com/a.jpg", "headers", JavaOnlyMap.of("x-token", "c")));
        assertEquals(a, b);
        assertNotEquals(a, c);
        // NaN (e.g. a size worked out from an undefined value) is the same
        // NaN: an unchanged source doesn't load again.
        assertEquals(FastImageSourceProps.parse(JavaOnlyMap.of("uri", "a", "width", Double.NaN)),
                FastImageSourceProps.parse(JavaOnlyMap.of("uri", "a", "width", Double.NaN)));
        // Two different invalid sources aren't the same: the second fires
        // onError too.
        assertNotEquals(FastImageSourceProps.parse(JavaOnlyMap.of("uri", 1)),
                FastImageSourceProps.parse(JavaOnlyMap.of("uri", 2)));
    }

    // An invalid source's error: one without a uri as JS sent it (without its
    // thumbhash, which can be long), one with a uri by its uri.
    @Test
    public void describesASourceForItsError() {
        String noUri = FastImageSourceProps.parse(JavaOnlyMap.of("uri", 1, "thumbhash", "a")).describe();
        assertTrue(noUri, noUri.contains("uri=1"));
        assertFalse(noUri, noUri.contains("thumbhash"));
        assertEquals("{uri=photo.jpg}", FastImageSourceProps.parse(JavaOnlyMap.of("uri", "photo.jpg")).describe());
    }

    @Test
    public void anArrayEntryThatIsntAnObjectIsNoSource() {
        JavaOnlyArray sources = JavaOnlyArray.of(JavaOnlyMap.of("uri", "a"), null, "b");
        assertEquals("a", FastImageSourceProps.parse(sources, 0).uri);
        assertNull(FastImageSourceProps.parse(sources, 1));
        assertNull(FastImageSourceProps.parse(sources, 2));
    }
}
