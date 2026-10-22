package com.bumptech.glide.manager;

// Glide's network monitor is a process-wide singleton that Glide.tearDown()
// doesn't reset: a test that grants ACCESS_NETWORK_STATE resets it after, so
// the next one gets a monitor on its own ConnectivityManager (reset() is
// package-private, so this is in Glide's package).
public final class GlideConnectivity {
    private GlideConnectivity() {}

    public static void reset() {
        SingletonConnectivityReceiver.reset();
    }
}
