# ProGuard/R8 rules for apps that use FastImage: the Android Gradle plugin
# applies them to the app's release build (consumerProguardFiles in
# build.gradle), so apps don't need to copy them.

# FastImage's classes: its view manager, native module, Glide modules and
# events.
-keep public class com.dylanvann.fastimage.* {*;}
-keep public class com.dylanvann.fastimage.** {*;}

# Glide's modules (FastImage's, and the one Glide generates from them) and
# its image header types.
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep public class * extends com.bumptech.glide.module.AppGlideModule
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
  **[] $VALUES;
  public *;
}
