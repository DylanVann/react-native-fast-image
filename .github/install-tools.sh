#!/bin/bash
# The tools e2e.yml's jobs download, into $1 (bin/, and node/ for Node), each
# checked against its SHA-256 (Node against nodejs.org's list):
#   - Node at .node-version's version, with npm and npx (React Native's Gradle
#     autolinking runs npx);
#   - ffmpeg and ffprobe, for the video samples: static builds (Homebrew took
#     about 20 s, apt about 14 s);
#   - macOS: XCLogParser (where xcodebuild's time went) and simslim (slimming
#     the simulator for later runs);
#   - Linux: ccache, which React Native's CMake compiles the Android apps' C++
#     through when it's on the PATH (static build).
# The jobs keep them in R2, keyed by this file and .node-version, so they're
# only downloaded when one changes. Each download has a time limit and is
# tried again: a stalled one (ffmpeg's host) hung jobs for 30 minutes.
set -euo pipefail
node_version=v$(cat .node-version)
mkdir -p "$1/bin" && cd "$1"
get() {
    curl -fsSL --connect-timeout 20 --max-time 300 --retry 3 --retry-all-errors "$@"
}

if [ "$(uname -s)" = Darwin ]; then
    node=node-$node_version-darwin-arm64
    ffmpeg=https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2
    get -o ffmpeg.zip "$ffmpeg/ffmpeg.zip" -o ffprobe.zip "$ffmpeg/ffprobe.zip"
    get -o xclogparser.zip https://github.com/MobileNativeFoundation/XCLogParser/releases/download/v0.2.49/XCLogParser-macOS-arm64-v0.2.49.zip
    get -o simslim.tar.gz https://github.com/MobAI-App/simslim/releases/download/v0.12.2/simslim-v0.12.2-macos-arm64.tar.gz
    shasum -a 256 -c <<'EOF'
c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924  ffmpeg.zip
fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6  ffprobe.zip
96e4793d6c3c23a0238e18520c6742f5a1f3ac495857e13253223b0b9cbea5fa  xclogparser.zip
b47302da6fb83b8b4c21f4fdd61507469770c07b0ff07fd1f48207bda4270887  simslim.tar.gz
EOF
    unzip -q xclogparser.zip -d bin && tar -xzf simslim.tar.gz -C bin
    rm xclogparser.zip simslim.tar.gz
else
    node=node-$node_version-linux-x64
    ffmpeg=https://ffmpeg.martin-riedl.de/download/linux/amd64/1789931100_9.0.2
    ccache=ccache-4.14.1-linux-x86_64-musl-static
    get -o ffmpeg.zip "$ffmpeg/ffmpeg.zip" -o ffprobe.zip "$ffmpeg/ffprobe.zip"
    get -o ccache.tar.gz "https://github.com/ccache/ccache/releases/download/v4.14.1/$ccache.tar.gz"
    shasum -a 256 -c <<'EOF'
fa8ecf4abbd290d98f7d188b8649cc6b391ae209a98452be955a15aab1909d7f  ffmpeg.zip
3f428c49070be3d24ec338602b76d412e401ffcb8a5641ef0e729181a232fc32  ffprobe.zip
8f684cf82a7acd2f1daddbefcda505c499afe8245cfbfe78f751ce389cd6df52  ccache.tar.gz
EOF
    tar -xzf ccache.tar.gz -C bin --strip-components 1 "$ccache/ccache"
    rm ccache.tar.gz
fi
unzip -q ffmpeg.zip -d bin && unzip -q ffprobe.zip -d bin && rm ffmpeg.zip ffprobe.zip

get -O "https://nodejs.org/dist/$node_version/$node.tar.gz"
get "https://nodejs.org/dist/$node_version/SHASUMS256.txt" | grep " $node.tar.gz$" | shasum -a 256 -c
mkdir node && tar -xzf "$node.tar.gz" -C node --strip-components 1 "$node/bin" "$node/lib" && rm "$node.tar.gz"
