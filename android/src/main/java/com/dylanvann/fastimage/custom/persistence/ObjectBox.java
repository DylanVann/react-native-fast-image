package com.dylanvann.fastimage.custom.persistence;

import android.content.Context;

import io.objectbox.Box;
import io.objectbox.BoxStore;

public class ObjectBox {
    private static BoxStore boxStore;

    public static void init(Context context) {
        if (boxStore == null) {
            boxStore = MyObjectBox.builder()
                    .androidContext(context.getApplicationContext())
                    .build();
        }
    }

    public static BoxStore get() { return boxStore; }

    public static Box<EntityEtagCache> getBoxEtagCache() {
        return get().boxFor(EntityEtagCache.class);
    }

    public static EntityEtagCache getEtagCacheEntityByUrl(String url) {
        return getBoxEtagCache().query().equal(EntityEtagCache_.url, url).build().findFirst();
    }

    public static String getEtagByUrl(String url) {
        EntityEtagCache entry = getEtagCacheEntityByUrl(url);
        if (entry != null) {
            return entry.etag;
        }
        return null;
    }

    public static void putOrUpdateEtag(String url, String etag) {
        EntityEtagCache entry = getEtagCacheEntityByUrl(url);
        if (entry != null) {
            entry.etag = etag;
        } else {
            entry = new EntityEtagCache();
            entry.etag = etag;
            entry.url = url;
        }
        getBoxEtagCache().put(entry);
    }
}
