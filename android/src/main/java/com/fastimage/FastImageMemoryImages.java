package com.fastimage;

import android.graphics.Bitmap;
import android.net.Uri;

import java.lang.ref.WeakReference;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

import javax.annotation.Nullable;

// Images already in memory that views show by a uri
// (fastimage-memory://<n>), such as a Nitro Image (added by
// react-native-fast-image-nitro-image).
public final class FastImageMemoryImages {
    static final String SCHEME = "fastimage-memory";

    // Uris to bitmaps, held weakly. Added on the JS thread, read on the main
    // thread.
    private static final Map<String, WeakReference<Bitmap>> IMAGES = new HashMap<>();
    private static long sLastImage = 0;

    private FastImageMemoryImages() {
    }

    // Adds the bitmap and returns its uri. It's only held weakly: the uri
    // works while something else (e.g. the Nitro Image) keeps the bitmap.
    // Glide shows it as it is, and doesn't recycle it.
    public static synchronized String add(Bitmap bitmap) {
        // Drops the bitmaps that are gone, as new ones are added.
        Iterator<WeakReference<Bitmap>> images = IMAGES.values().iterator();
        while (images.hasNext()) {
            if (images.next().get() == null) images.remove();
        }
        String uri = SCHEME + "://" + ++sLastImage;
        IMAGES.put(uri, new WeakReference<>(bitmap));
        return uri;
    }

    // The bitmap at this uri, or null if it's no longer in memory (or was
    // recycled).
    @Nullable
    static synchronized Bitmap get(Uri uri) {
        WeakReference<Bitmap> image = IMAGES.get(uri.toString());
        Bitmap bitmap = image == null ? null : image.get();
        return bitmap == null || bitmap.isRecycled() ? null : bitmap;
    }

    static boolean isMemoryImageUri(@Nullable Uri uri) {
        return uri != null && SCHEME.equals(uri.getScheme());
    }
}
