// Fast Image's native view without React Native, and its visual tests:
// `./gradlew testDebugUnitTest`.
plugins {
    id("com.android.library") version "9.2.1"
}

// The sources without what's only for React Native.
val reactNativeGlue = listOf(
    "FastImageAutoViewManager", "FastImageEvent", "FastImageHttpClient", "FastImageReactSource",
    "FastImageReactView", "FastImageViewManager", "FastImageViewModule", "FastImageViewPackage",
)
val viewSources = tasks.register<Sync>("viewSources") {
    from("../android/src/main/java") {
        reactNativeGlue.forEach { exclude("com/fastimage/$it.java") }
    }
    into(layout.buildDirectory.dir("view-sources"))
}

android {
    namespace = "com.fastimage"
    compileSdk = 36
    defaultConfig {
        minSdk = 24
    }
    sourceSets {
        getByName("main").java.srcDir(layout.buildDirectory.dir("view-sources").get().asFile)
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            // -Prepeats=n: each scenario runs n times.
            it.systemProperty("scenario.repeats", providers.gradleProperty("repeats").getOrElse("1"))
            // Captures through Android's renderer, not a software canvas.
            it.systemProperty("robolectric.pixelCopyRenderMode", "hardware")
            it.testLogging.events("failed")
            it.testLogging.exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.SHORT
        }
    }
    lint {
        abortOnError = false
    }
}

tasks.named("preBuild") { dependsOn(viewSources) }


val glide = "5.0.7"
dependencies {
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("com.github.bumptech.glide:glide:$glide")
    implementation("com.github.bumptech.glide:annotations:$glide")
    implementation("com.github.bumptech.glide:okhttp3-integration:$glide")
    annotationProcessor("com.github.bumptech.glide:compiler:$glide")
    implementation("com.caverock:androidsvg-aar:1.4")
    implementation("com.github.penfeizhou.android.animation:apng:3.0.5")
    implementation("com.google.code.findbugs:jsr305:3.0.2")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.15.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    // Android's own isn't there when JUnit lists the scenarios, outside
    // Robolectric's sandbox.
    testImplementation("org.json:json:20240303")

}
