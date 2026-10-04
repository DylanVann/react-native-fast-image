# ProGuard/R8 rules for apps that use FastImage: the Android Gradle plugin
# applies them to the app's release build (consumerProguardFiles in
# build.gradle), so apps don't need to copy them.

# FastImage's classes: its view manager, native module, Glide modules and
# events.
-keep public class com.dylanvann.fastimage.* {*;}
-keep public class com.dylanvann.fastimage.** {*;}

# The Glide rules below cover what Glide's own rules (its library's
# proguard-rules.txt) didn't at the version FastImage uses by default
# (glideVersion in build.gradle) and older ones apps may pick. When updating
# Glide, revisit which are still needed: whether Glide's rules now keep
# modules' constructors (4.16.0's still keep only the AppGlideModule's), and
# whether its integrations still register old-style modules in their
# manifests (the OkHttp integration's OkHttpGlideModule still did in 5.0.9).

# Glide's modules and their constructors: FastImage's, the one Glide
# generates from them, and old-style modules Glide finds in the app's manifest
# and creates by reflection (e.g. its OkHttp integration's OkHttpGlideModule,
# which FastImage uses). R8's full mode (the default from the Android Gradle
# plugin 8.0) removes a constructor a rule doesn't name, and Glide then
# crashes when it starts ("Unable to instantiate GlideModule implementation").
-keep public class * implements com.bumptech.glide.module.GlideModule {
  <init>();
}
-keep public class * extends com.bumptech.glide.module.AppGlideModule {
  <init>(...);
}

# Glide's image header types.
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
  **[] $VALUES;
  public *;
}

# React Native's event dispatcher, which FastImage looks up by name
# (FastImageEvents), so it still compiles against React Native 0.60-0.62,
# which don't have it. R8 would rename it, and on the New Architecture every
# event (onLoad, onError, ...) would then be dropped.
-keep class com.facebook.react.uimanager.UIManagerHelper {
  public static *** getEventDispatcherForReactTag(com.facebook.react.bridge.ReactContext, int);
}

# AndroidSVG, which FastImage uses for SVG images when the app has it
# (FastImageSvgRenderer), and doesn't ship. Without it, R8 would stop at the
# missing classes.
-dontwarn com.caverock.androidsvg.**
