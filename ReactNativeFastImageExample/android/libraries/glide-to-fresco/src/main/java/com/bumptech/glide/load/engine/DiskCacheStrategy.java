package com.bumptech.glide.load.engine;

/**
 * Set of available caching strategies for media.
 *
 * @see <a href="https://github.com/bumptech/glide/blob/master/library/src/main/java/com/bumptech/glide/load/engine/DiskCacheStrategy.java">Original</a>
 */
public abstract class DiskCacheStrategy {

    public static final DiskCacheStrategy ALL = new DiskCacheStrategy() {};

    public static final DiskCacheStrategy NONE = new DiskCacheStrategy() {};

    public static final DiskCacheStrategy DATA = new DiskCacheStrategy() {};

    public static final DiskCacheStrategy RESOURCE = new DiskCacheStrategy() {};

    public static final DiskCacheStrategy AUTOMATIC = new DiskCacheStrategy() {};
}
