# Other Android Versions

If you are not on a clean React Native install you may need to change the versions of some things this library uses.

If you've defined
_[project-wide-properties](https://developer.android.com/studio/build/gradle-tips.html)_(**recommended**)
in your root `build.gradle`, this library will detect the presence of the following properties:

```groovy
buildscript {...}
allprojects {...}

/**
 + Project-wide Gradle configuration properties
 */
ext {
    // You can use any of these to change project wide versions:
    // compileSdkVersion   = 26
    // targetSdkVersion    = 26
    // minSdkVersion       = 16
    // buildToolsVersion   = "26.0.3"
    // supportLibVersion   = "27.1.1"
    // glideVersion        = "4.7.1"
}
```
