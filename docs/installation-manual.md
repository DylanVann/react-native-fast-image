# Installation (Manual)

## iOS

- In Xcode:
    - Add `FastImage.xcodeproj` to **Libraries**.
    - Add `libFastImage.a` to **Link Binary With Libraries** under **Build Phases**.
    - [More info and screenshots.](http://facebook.github.io/react-native/docs/linking-libraries-ios.html#content)

## Android

* Edit `android/settings.gradle`

```diff
rootProject.name = 'MyApp'

include ':app'

+ include ':react-native-fast-image'
+ project(':react-native-fast-image').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-fast-image/android')
```

* Edit `android/app/build.gradle`

```diff
apply plugin: 'com.android.application'

android {
    ...
}

dependencies {
    implementation fileTree(dir: "libs", include: ["*.jar"])
    implementation "com.android.support:appcompat-v7:${rootProject.ext.supportLibVersion}"
    implementation "com.facebook.react:react-native:+"  // From node_modules
+   implementation project(':react-native-fast-image')
}
```

If you've defined *[project-wide
properties](https://developer.android.com/studio/build/gradle-tips.html)*
(**recommended**) in your root `build.gradle`, this library will detect
the presence of the following properties:

```groovy
buildscript {...}
allprojects {...}

/**
 + Project-wide Gradle configuration properties
 */
ext {
    compileSdkVersion   = 26
    targetSdkVersion    = 26
    minSdkVersion       = 16    
    buildToolsVersion   = "26.0.3"
    supportLibVersion   = "27.1.1"  

    // Uncomment the following line to specify your own glide version
    // glideVersion = "4.7.1"
}
```



* Edit `android/app/src/main/java/.../MainApplication.java`

```diff
package com.myapp;

+ import com.dylanvann.fastimage.FastImageViewPackage;

....

    @Override
    protected List<ReactPackage> getPackages() {
        return Arrays.<ReactPackage>asList(
            new MainReactPackage()
+           ,new FastImageViewPackage()
        );
    }

}
```
