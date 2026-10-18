// ThumbHashes (https://evanw.github.io/thumbhash/) on the web, as
// `react-native-fast-image/thumbhash`: importing it makes the web version
// show sources' thumbhashes (iOS and Android decode them natively), and
// thumbHashToDataURL makes a source's `blurDataUri` from one, e.g. on a
// server, so a page shows it without any JavaScript. FastImage doesn't import
// it, so web bundles only have it if the app does.
//
// The data uri is a PNG of at most 8 × 8 pixels: a ThumbHash holds at most 7
// frequencies on its longer side, so more pixels add bytes, not detail. The
// web version blurs it as it scales it up, as it does every blurDataUri.
//
// thumbHashToRGBA and rgbaToDataURL are Evan Wallace's reference code
// (https://github.com/evanw/thumbhash, js/thumbhash.js), typed, with a check
// that the hash is long enough for what its header says it holds:
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

// Recently made data uris, by their hash, the least recently used dropped.
const cache = new Map<string, string | undefined>()
const CACHE_SIZE = 256

/**
 * A ThumbHash (base64, standard or url-safe, with or without padding) as a
 * source's `blurDataUri`: a PNG data uri of at most 8 × 8 pixels (about 300
 * to 500 characters), or undefined for an empty or invalid hash. Works in
 * browsers, on servers (Node 16+) and in React Native.
 *
 * @example
 * ```js
 * // e.g. on your server, so the page shows the preview without any JavaScript
 * const source = { uri: photo.url, blurDataUri: thumbHashToDataURL(photo.thumbhash) }
 * ```
 */
export function thumbHashToDataURL(
    thumbhash: string | undefined,
): string | undefined {
    if (!thumbhash) return undefined
    if (cache.has(thumbhash)) {
        const uri = cache.get(thumbhash)
        cache.delete(thumbhash)
        cache.set(thumbhash, uri)
        return uri
    }
    const hash = base64Bytes(thumbhash)
    const image = hash ? thumbHashToRGBA(hash) : undefined
    const small = image ? shrink(image.w, image.h, image.rgba, 8) : undefined
    const uri = small ? rgbaToDataURL(small.w, small.h, small.rgba) : undefined
    if (cache.size >= CACHE_SIZE) {
        cache.delete(cache.keys().next().value as string)
    }
    cache.set(thumbhash, uri)
    return uri
}

// The web version's decoder, which index.web.tsx finds here without importing
// this module (the same key from any copy of the package).
;(globalThis as Record<symbol, unknown>)[
    Symbol.for('react-native-fast-image/thumbhash')
] = thumbHashToDataURL

// The pixels averaged down so the longer side is at most max.
function shrink(w: number, h: number, rgba: Uint8Array, max: number) {
    const scale = Math.max(w, h) / max
    if (scale <= 1) return { w, h, rgba }
    const sw = Math.max(1, Math.round(w / scale))
    const sh = Math.max(1, Math.round(h / scale))
    const out = new Uint8Array(sw * sh * 4)
    for (let y = 0; y < sh; y++) {
        const y0 = Math.floor((y * h) / sh)
        const y1 = Math.floor(((y + 1) * h) / sh)
        for (let x = 0; x < sw; x++) {
            const x0 = Math.floor((x * w) / sw)
            const x1 = Math.floor(((x + 1) * w) / sw)
            for (let c = 0; c < 4; c++) {
                let sum = 0
                for (let yy = y0; yy < y1; yy++)
                    for (let xx = x0; xx < x1; xx++)
                        sum += rgba[(yy * w + xx) * 4 + c]
                out[(y * sw + x) * 4 + c] = Math.round(
                    sum / ((y1 - y0) * (x1 - x0)),
                )
            }
        }
    }
    return { w: sw, h: sh, rgba: out }
}

function base64Bytes(base64: string): Uint8Array | undefined {
    const standard = base64.trim().replace(/-/g, '+').replace(/_/g, '/')
    if (!/^[A-Za-z0-9+/]*=*$/.test(standard)) return undefined
    try {
        const binary = atob(
            standard.replace(/=+$/, '') +
                '='.repeat((4 - (standard.replace(/=+$/, '').length % 4)) % 4),
        )
        return Uint8Array.from(binary, (c) => c.charCodeAt(0))
    } catch {
        return undefined
    }
}

// How many AC factors a channel of nx × ny has.
function count(nx: number, ny: number) {
    let n = 0
    for (let cy = 0; cy < ny; cy++)
        for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++) n++
    return n
}

function thumbHashToRGBA(
    hash: Uint8Array,
): { w: number; h: number; rgba: Uint8Array } | undefined {
    const { PI, min, max, cos, round } = Math
    if (hash.length < 5) return undefined

    // Read the constants
    const header24 = hash[0] | (hash[1] << 8) | (hash[2] << 16)
    const header16 = hash[3] | (hash[4] << 8)
    const l_dc = (header24 & 63) / 63
    const p_dc = ((header24 >> 6) & 63) / 31.5 - 1
    const q_dc = ((header24 >> 12) & 63) / 31.5 - 1
    const l_scale = ((header24 >> 18) & 31) / 31
    const hasAlpha = header24 >> 23
    const p_scale = ((header16 >> 3) & 63) / 63
    const q_scale = ((header16 >> 9) & 63) / 63
    const isLandscape = header16 >> 15
    const lx = max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7)
    const ly = max(3, isLandscape ? header16 & 7 : hasAlpha ? 5 : 7)
    const ac_start = hasAlpha ? 6 : 5
    const ac_count =
        count(lx, ly) + 2 * count(3, 3) + (hasAlpha ? count(5, 5) : 0)
    if (hash.length < ac_start + Math.ceil(ac_count / 2)) return undefined
    const a_dc = hasAlpha ? (hash[5] & 15) / 15 : 1
    const a_scale = (hash[5] >> 4) / 15

    // Read the varying factors (boost saturation by 1.25x to compensate for quantization)
    let ac_index = 0
    const decodeChannel = (nx: number, ny: number, scale: number) => {
        const ac: number[] = []
        for (let cy = 0; cy < ny; cy++)
            for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++)
                ac.push(
                    (((hash[ac_start + (ac_index >> 1)] >>
                        ((ac_index++ & 1) << 2)) &
                        15) /
                        7.5 -
                        1) *
                        scale,
                )
        return ac
    }
    const l_ac = decodeChannel(lx, ly, l_scale)
    const p_ac = decodeChannel(3, 3, p_scale * 1.25)
    const q_ac = decodeChannel(3, 3, q_scale * 1.25)
    const a_ac = hasAlpha ? decodeChannel(5, 5, a_scale) : []

    // Decode using the DCT into RGB
    const ratio = thumbHashToApproximateAspectRatio(hash)
    const w = max(1, round(ratio > 1 ? 32 : 32 * ratio))
    const h = max(1, round(ratio > 1 ? 32 / ratio : 32))
    const rgba = new Uint8Array(w * h * 4)
    const fx: number[] = []
    const fy: number[] = []
    for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i += 4) {
            let l = l_dc,
                p = p_dc,
                q = q_dc,
                a = a_dc

            // Precompute the coefficients
            for (let cx = 0, n = max(lx, hasAlpha ? 5 : 3); cx < n; cx++)
                fx[cx] = cos((PI / w) * (x + 0.5) * cx)
            for (let cy = 0, n = max(ly, hasAlpha ? 5 : 3); cy < n; cy++)
                fy[cy] = cos((PI / h) * (y + 0.5) * cy)

            // Decode L
            for (let cy = 0, j = 0; cy < ly; cy++)
                for (
                    let cx = cy ? 0 : 1, fy2 = fy[cy] * 2;
                    cx * ly < lx * (ly - cy);
                    cx++, j++
                )
                    l += l_ac[j] * fx[cx] * fy2

            // Decode P and Q
            for (let cy = 0, j = 0; cy < 3; cy++) {
                for (
                    let cx = cy ? 0 : 1, fy2 = fy[cy] * 2;
                    cx < 3 - cy;
                    cx++, j++
                ) {
                    const f = fx[cx] * fy2
                    p += p_ac[j] * f
                    q += q_ac[j] * f
                }
            }

            // Decode A
            if (hasAlpha)
                for (let cy = 0, j = 0; cy < 5; cy++)
                    for (
                        let cx = cy ? 0 : 1, fy2 = fy[cy] * 2;
                        cx < 5 - cy;
                        cx++, j++
                    )
                        a += a_ac[j] * fx[cx] * fy2

            // Convert to RGB
            const b = l - (2 / 3) * p
            const r = (3 * l - b + q) / 2
            const g = r - q
            rgba[i] = max(0, 255 * min(1, r))
            rgba[i + 1] = max(0, 255 * min(1, g))
            rgba[i + 2] = max(0, 255 * min(1, b))
            rgba[i + 3] = max(0, 255 * min(1, a))
        }
    }
    return { w, h, rgba }
}

function thumbHashToApproximateAspectRatio(hash: Uint8Array) {
    const header = hash[3]
    const hasAlpha = hash[2] & 0x80
    const isLandscape = hash[4] & 0x80
    const lx = isLandscape ? (hasAlpha ? 5 : 7) : header & 7
    const ly = isLandscape ? header & 7 : hasAlpha ? 5 : 7
    return ly ? lx / ly : 1
}

// A PNG (uncompressed) of the pixels, as a data uri.
function rgbaToDataURL(w: number, h: number, rgba: Uint8Array) {
    const row = w * 4 + 1
    const idat = 6 + h * (5 + row)
    const bytes = [
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
        0,
        0,
        0,
        13,
        73,
        72,
        68,
        82,
        0,
        0,
        w >> 8,
        w & 255,
        0,
        0,
        h >> 8,
        h & 255,
        8,
        6,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        idat >>> 24,
        (idat >> 16) & 255,
        (idat >> 8) & 255,
        idat & 255,
        73,
        68,
        65,
        84,
        120,
        1,
    ]
    const table = [
        0, 498536548, 997073096, 651767980, 1994146192, 1802195444, 1303535960,
        1342533948, -306674912, -267414716, -690576408, -882789492, -1687895376,
        -2032938284, -1609899400, -1111625188,
    ]
    let a = 1,
        b = 0
    for (let y = 0, i = 0, end = row - 1; y < h; y++, end += row - 1) {
        bytes.push(
            y + 1 < h ? 0 : 1,
            row & 255,
            row >> 8,
            ~row & 255,
            (row >> 8) ^ 255,
            0,
        )
        for (b = (b + a) % 65521; i < end; i++) {
            const u = rgba[i] & 255
            bytes.push(u)
            a = (a + u) % 65521
            b = (b + a) % 65521
        }
    }
    bytes.push(
        b >> 8,
        b & 255,
        a >> 8,
        a & 255,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        73,
        69,
        78,
        68,
        174,
        66,
        96,
        130,
    )
    for (let [start, end] of [
        [12, 29],
        [37, 41 + idat],
    ]) {
        let c = ~0
        for (let i = start; i < end; i++) {
            c ^= bytes[i]
            c = (c >>> 4) ^ table[c & 15]
            c = (c >>> 4) ^ table[c & 15]
        }
        c = ~c
        bytes[end++] = c >>> 24
        bytes[end++] = (c >> 16) & 255
        bytes[end++] = (c >> 8) & 255
        bytes[end++] = c & 255
    }
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return 'data:image/png;base64,' + btoa(binary)
}
