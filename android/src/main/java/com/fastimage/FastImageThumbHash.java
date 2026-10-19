package com.fastimage;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.LruCache;

import androidx.annotation.Nullable;

import java.util.Locale;

// A source's `thumbhash` (https://evanw.github.io/thumbhash/) decoded into the
// placeholder it shows while its image loads: at most 32 × 32 pixels, which
// the view scales up smoothly. Decoding takes well under a millisecond, so it
// happens as the view picks its source; recent ones are cached by their hash,
// for list rows that show the same images again. Also a source's
// `blurDataUri`: a data uri's few pixels, scaled up to the same size and
// blurred (blurDataUri).
//
// thumbHashToRGBA is Evan Wallace's reference decoder
// (https://github.com/evanw/thumbhash, java/com/madebyevan/thumbhash), with a
// check that the hash is long enough for what its header says it holds:
//
// Copyright (c) 2023 Evan Wallace
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
final class FastImageThumbHash {
    private FastImageThumbHash() {
    }

    // Recently decoded placeholders, by their hash or blurDataUri: at most
    // 4 KB each.
    private static final LruCache<String, Bitmap> cache = new LruCache<>(256);

    // A source's placeholder: its blurDataUri's, or its ThumbHash's.
    @Nullable
    static Bitmap placeholder(@Nullable String value) {
        return value != null && isDataUri(value) ? blurDataUri(value) : bitmap(value);
    }

    // A source's blurDataUri, decoded, scaled so its longer side is 32 px
    // (a ThumbHash's size), and blurred by about half of one of its pixels, so
    // that a few pixels scale up smoothly instead of in steps.
    @Nullable
    static Bitmap blurDataUri(String uri) {
        Bitmap cached = cache.get(uri);
        if (cached != null) return cached;
        Bitmap decoded = dataUri(uri);
        if (decoded == null) return null;
        int width = decoded.getWidth();
        int height = decoded.getHeight();
        float scale = 32f / Math.max(width, height);
        int w = Math.max(1, Math.round(width * scale));
        int h = Math.max(1, Math.round(height * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(decoded, w, h, true);
        int[] pixels = new int[w * h];
        scaled.getPixels(pixels, 0, w, 0, 0, w, h);
        blur(pixels, w, h, Math.max(1, Math.round(scale / 2)));
        Bitmap bitmap = Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888);
        cache.put(uri, bitmap);
        return bitmap;
    }

    // Blurs unpremultiplied ARGB pixels in place: a box blur of the radius
    // three times each way (about a Gaussian), premultiplied so transparent
    // pixels don't darken their neighbors, with the edges extended outwards.
    private static void blur(int[] pixels, int w, int h, int radius) {
        int n = w * h;
        float[][] channels = new float[4][n];
        for (int i = 0; i < n; i++) {
            int p = pixels[i];
            float a = (p >>> 24) / 255f;
            channels[0][i] = a;
            channels[1][i] = ((p >> 16) & 255) * a;
            channels[2][i] = ((p >> 8) & 255) * a;
            channels[3][i] = (p & 255) * a;
        }
        float[] line = new float[Math.max(w, h)];
        for (float[] channel : channels) {
            for (int pass = 0; pass < 3; pass++) {
                for (int y = 0; y < h; y++) boxBlur(channel, y * w, 1, w, radius, line);
                for (int x = 0; x < w; x++) boxBlur(channel, x, w, h, radius, line);
            }
        }
        for (int i = 0; i < n; i++) {
            float a = channels[0][i];
            int alpha = Math.round(a * 255);
            int r = a > 0 ? Math.min(255, Math.round(channels[1][i] / a)) : 0;
            int g = a > 0 ? Math.min(255, Math.round(channels[2][i] / a)) : 0;
            int b = a > 0 ? Math.min(255, Math.round(channels[3][i] / a)) : 0;
            pixels[i] = (alpha << 24) | (r << 16) | (g << 8) | b;
        }
    }

    // One row or column (count values, step apart from start): each becomes
    // the average of the 2 × radius + 1 around it, the edge values repeated.
    private static void boxBlur(float[] values, int start, int step, int count, int radius, float[] line) {
        for (int i = 0; i < count; i++) line[i] = values[start + i * step];
        float sum = 0;
        for (int i = -radius; i <= radius; i++) sum += line[Math.min(count - 1, Math.max(0, i))];
        for (int i = 0; i < count; i++) {
            values[start + i * step] = sum / (2 * radius + 1);
            sum += line[Math.min(count - 1, i + radius + 1)] - line[Math.max(0, i - radius)];
        }
    }

    static boolean isDataUri(String value) {
        return value.regionMatches(true, 0, "data:", 0, 5);
    }

    // A base64 data uri's image (PNG, JPEG, WebP, a GIF's first frame), or
    // null if it isn't one Android decodes (e.g. an SVG).
    @Nullable
    static Bitmap dataUri(String uri) {
        int comma = uri.indexOf(',');
        if (comma < 0 || !uri.substring(0, comma).toLowerCase(Locale.ROOT).endsWith(";base64")) return null;
        byte[] data;
        try {
            data = Base64.decode(uri.substring(comma + 1), Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return null;
        }
        return BitmapFactory.decodeByteArray(data, 0, data.length);
    }

    // The placeholder for a base64 ThumbHash (standard or url-safe, with or
    // without padding), or null for an empty or invalid one.
    @Nullable
    static Bitmap bitmap(@Nullable String thumbhash) {
        if (thumbhash == null || thumbhash.isEmpty()) return null;
        Bitmap cached = cache.get(thumbhash);
        if (cached != null) return cached;
        StringBuilder base64 = new StringBuilder(thumbhash.trim().replace('-', '+').replace('_', '/'));
        while (base64.length() % 4 != 0) base64.append('=');
        byte[] hash;
        try {
            hash = Base64.decode(base64.toString(), Base64.NO_WRAP);
        } catch (IllegalArgumentException e) {
            return null;
        }
        int[] size = new int[2];
        int[] colors = thumbHashToColors(hash, size);
        if (colors == null) return null;
        Bitmap bitmap = Bitmap.createBitmap(colors, size[0], size[1], Bitmap.Config.ARGB_8888);
        cache.put(thumbhash, bitmap);
        return bitmap;
    }

    // The hash decoded as unpremultiplied ARGB colors (Bitmap.createBitmap's),
    // its width and height in size, or null if it's too short.
    @Nullable
    private static int[] thumbHashToColors(byte[] hash, int[] size) {
        if (hash.length < 5) return null;
        // Read the constants
        int header24 = (hash[0] & 255) | ((hash[1] & 255) << 8) | ((hash[2] & 255) << 16);
        int header16 = (hash[3] & 255) | ((hash[4] & 255) << 8);
        float l_dc = (float) (header24 & 63) / 63.0f;
        float p_dc = (float) ((header24 >> 6) & 63) / 31.5f - 1.0f;
        float q_dc = (float) ((header24 >> 12) & 63) / 31.5f - 1.0f;
        float l_scale = (float) ((header24 >> 18) & 31) / 31.0f;
        boolean hasAlpha = (header24 >> 23) != 0;
        float p_scale = (float) ((header16 >> 3) & 63) / 63.0f;
        float q_scale = (float) ((header16 >> 9) & 63) / 63.0f;
        boolean isLandscape = (header16 >> 15) != 0;
        int lx = Math.max(3, isLandscape ? hasAlpha ? 5 : 7 : header16 & 7);
        int ly = Math.max(3, isLandscape ? header16 & 7 : hasAlpha ? 5 : 7);
        int ac_start = hasAlpha ? 6 : 5;
        int ac_count = count(lx, ly) + 2 * count(3, 3) + (hasAlpha ? count(5, 5) : 0);
        if (hash.length < ac_start + (ac_count + 1) / 2) return null;
        float a_dc = hasAlpha ? (float) (hash[5] & 15) / 15.0f : 1.0f;
        float a_scale = hasAlpha ? (float) ((hash[5] >> 4) & 15) / 15.0f : 0;

        // Read the varying factors (boost saturation by 1.25x to compensate for quantization)
        int[] ac_index = {0};
        float[] l_ac = decode(hash, ac_start, ac_index, lx, ly, l_scale);
        float[] p_ac = decode(hash, ac_start, ac_index, 3, 3, p_scale * 1.25f);
        float[] q_ac = decode(hash, ac_start, ac_index, 3, 3, q_scale * 1.25f);
        float[] a_ac = hasAlpha ? decode(hash, ac_start, ac_index, 5, 5, a_scale) : null;

        // Decode using the DCT into RGB
        float ratio = approximateAspectRatio(hash);
        int w = Math.max(1, Math.round(ratio > 1.0f ? 32.0f : 32.0f * ratio));
        int h = Math.max(1, Math.round(ratio > 1.0f ? 32.0f / ratio : 32.0f));
        int[] colors = new int[w * h];
        int cx_stop = Math.max(lx, hasAlpha ? 5 : 3);
        int cy_stop = Math.max(ly, hasAlpha ? 5 : 3);
        float[] fx = new float[cx_stop];
        float[] fy = new float[cy_stop];
        for (int y = 0, i = 0; y < h; y++) {
            for (int x = 0; x < w; x++, i++) {
                float l = l_dc, p = p_dc, q = q_dc, a = a_dc;

                // Precompute the coefficients
                for (int cx = 0; cx < cx_stop; cx++)
                    fx[cx] = (float) Math.cos(Math.PI / w * (x + 0.5f) * cx);
                for (int cy = 0; cy < cy_stop; cy++)
                    fy[cy] = (float) Math.cos(Math.PI / h * (y + 0.5f) * cy);

                // Decode L
                for (int cy = 0, j = 0; cy < ly; cy++) {
                    float fy2 = fy[cy] * 2.0f;
                    for (int cx = cy > 0 ? 0 : 1; cx * ly < lx * (ly - cy); cx++, j++)
                        l += l_ac[j] * fx[cx] * fy2;
                }

                // Decode P and Q
                for (int cy = 0, j = 0; cy < 3; cy++) {
                    float fy2 = fy[cy] * 2.0f;
                    for (int cx = cy > 0 ? 0 : 1; cx < 3 - cy; cx++, j++) {
                        float f = fx[cx] * fy2;
                        p += p_ac[j] * f;
                        q += q_ac[j] * f;
                    }
                }

                // Decode A
                if (a_ac != null)
                    for (int cy = 0, j = 0; cy < 5; cy++) {
                        float fy2 = fy[cy] * 2.0f;
                        for (int cx = cy > 0 ? 0 : 1; cx < 5 - cy; cx++, j++)
                            a += a_ac[j] * fx[cx] * fy2;
                    }

                // Convert to RGB
                float b = l - 2.0f / 3.0f * p;
                float r = (3.0f * l - b + q) / 2.0f;
                float g = r - q;
                colors[i] = (channel(a) << 24) | (channel(r) << 16) | (channel(g) << 8) | channel(b);
            }
        }
        size[0] = w;
        size[1] = h;
        return colors;
    }

    private static int channel(float value) {
        return Math.max(0, Math.round(255.0f * Math.min(1, value)));
    }

    // How many AC factors a channel of nx × ny has.
    private static int count(int nx, int ny) {
        int n = 0;
        for (int cy = 0; cy < ny; cy++)
            for (int cx = cy > 0 ? 0 : 1; cx * ny < nx * (ny - cy); cx++)
                n++;
        return n;
    }

    private static float[] decode(byte[] hash, int start, int[] index, int nx, int ny, float scale) {
        float[] ac = new float[count(nx, ny)];
        for (int i = 0; i < ac.length; i++) {
            int data = hash[start + (index[0] >> 1)] >> ((index[0] & 1) << 2);
            ac[i] = ((float) (data & 15) / 7.5f - 1.0f) * scale;
            index[0]++;
        }
        return ac;
    }

    private static float approximateAspectRatio(byte[] hash) {
        byte header = hash[3];
        boolean hasAlpha = (hash[2] & 0x80) != 0;
        boolean isLandscape = (hash[4] & 0x80) != 0;
        int lx = isLandscape ? hasAlpha ? 5 : 7 : header & 7;
        int ly = isLandscape ? header & 7 : hasAlpha ? 5 : 7;
        return ly == 0 ? 1 : (float) lx / (float) ly;
    }
}
