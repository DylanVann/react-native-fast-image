# Scenario tests

Tests shared by Fast Image's platforms, as JSON that each platform's runner reads, so both behave alike. The format follows `loader-tests` on `feat/loaders` (the same steps where they do the same thing), and those tests come here with the loaders.

The fixtures are the example image server's (`ReactNativeFastImageExampleServer/images`).

Runners:

- Android: `fast-image-android/src/test/java/com/fastimage/ScenarioTest.java` (`./gradlew testDebugUnitTest` in `fast-image-android`, JDK 17).
- iOS: `fast-image-ios/Tests/ScenarioTests.swift` (`xcodegen generate`, then `xcodebuild test -scheme FastImageTests -destination …` in `fast-image-ios`).

With `-Prepeats=n` (Android) or `TEST_RUNNER_SCENARIO_REPEATS=n` (iOS), each scenario runs n times.

## Views

What Fast Image's native view draws, in `views/`: the steps run in order on the main thread, on a black screen, with a clock only the steps move. Each scenario gets a local HTTP server that serves the fixtures by path (the query is ignored; 404 if there's none), and empty caches. `only` limits a scenario to `ios` or `android`.

What React Native draws (borders, rounded corners, shadows) and what its JS decides (the default transition, `require()`) stays in the e2e.

On Android the views are captured through Android's renderer (Robolectric's hardware mode), since a software canvas doesn't show what depends on it: fades at an opacity, and how an animated WebP takes a fade's alpha. AVIF, HEIC, PSD, TIFF and ICNS don't decode on the JVM, so those cases stay in the e2e on Android.

Steps:

- `{"view": name, …}`: adds a view, with `size` (`[w, h]`), `at` (`[x, y]`), `sample` (the point in it that's checked, its center by default) and its props:
    - `url`: `/path` on the server, or `file:<fixture>`. `cache`: `web`.
    - `transition`: `duration` (ms), `betweenImages`, `skipOnCacheHit`.
    - `defaultSource`: `magenta` (solid), or on Android `magenta-vector` or `magenta-animated`.
    - `objectFit`, `blurRadius`, `opacity` (the view's own), `parentOpacity` (a view it's in), and on Android `alphaAnimation` (a view animation on a view it's in).
    - `magnify`: draws the screen larger, to see parts of a pixel.
- `{"set": name, …}`: changes a view's props.
- `{"remove": name}`: removes it.
- `{"hold": path}`: the server waits to answer a request for `path` until `{"release": path}`.
- `{"respond": path, "fixture": f, "headers": {name: value}}`: what the server answers for `path`.
- `{"clearMemoryCache": true}`.
- `{"advance": ms}`: moves the clock.
- `{"waitFor": {"loaded": [names]}}`: until these views' current images have loaded. `{"waitFor": {"fadeStarted": name}}`: until a fade that starts after the load (once a blur is done) has started. Fails after 15 s.
- `{"expect": {"colors": {name: "#rrggbb"}}}`: the view's color now.
- `{"fade": name, "duration": ms, "expect": [colors]}`: steps the clock through a fade and checks the view's color at evenly spaced points, from its start to its end. An image that shows at once has its final color at every point.
- `{"note": …}`: does nothing.

Colors match within 3 of 255 per channel, as the platforms round differently.
