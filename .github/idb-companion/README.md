# idb's companion, patched

`idb-companion.macos-arm64.tar.gz` is idb's v1.7.7 release
(`idb-companion.macos-arm64.tar.gz`, SHA-256
`d0e4e10a7bbd85a6ce67966acb5fca0a87fd14cd026b79f8ec3ee6c338f4a166`) with
`idb_companion` built from v1.7.7 (`1de1629a`) with
`no-integrated-display.patch`.

Without the patch, each screenshot and video stream of an Apple TV simulator
waits 5 s first: the companion waits for an integrated display to become active,
as it does during a foldable's hinge change, but an Apple TV only has a TV
output, so it never does. With it, a screenshot of the Apple TV 4K takes about
0.2 s (5.3 s before) and a stream's first frame about 0.1 s (5.2 s).

To rebuild (Xcode, `brew install xcodegen protobuf`):

```sh
git clone --depth 1 --branch v1.7.7 https://github.com/facebook/idb.git
cd idb
git apply ../react-native-fast-image/.github/idb-companion/no-integrated-display.patch
./build.sh build idb_companion   # Build/Products/Release/idb_companion
```

Then replace `idb_companion` in the release's tarball with the one built.

The fix is proposed upstream in
[facebook/idb#987](https://github.com/facebook/idb/pull/987): once it's in a
release, the workflow can download that release again and this folder can go.
