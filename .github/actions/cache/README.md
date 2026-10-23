# runs-on/cache's restore, patched

`restore` and `dist/restore-only` are runs-on/cache's v5.0.7 (`88d90644`) with
`segment-timeout.patch`, a 3-line change to the bundle. The save steps use
runs-on/cache itself.

runs-on/cache downloads a cache in 16 MB parts, 8 at a time, and retries a part
after 30 s. On the macOS runners, R2 sometimes stops sending a part, and the
restore then waits out the 30 s: 15–47 s per iOS job. The patch reads that time
from `DOWNLOAD_SEGMENT_TIMEOUT` (seconds; still 30 without it), and e2e.yml sets
it to 10.

To make it again:

```sh
git clone --branch v5.0.7 https://github.com/runs-on/cache.git
cd cache
git apply ../react-native-fast-image/.github/actions/cache/segment-timeout.patch
```

Then copy `restore/action.yml` and `dist/restore-only`.
