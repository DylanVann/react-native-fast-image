import { describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { thumbHashToDataURL } from './thumbhash'

// Hashes of a 4:3 red-to-blue image and a square transparent one (a magenta
// disc), and the SHA-256 of the data uris made of them: the reference
// decoder's (Evan Wallace's thumbHashToRGBA) pixels averaged down to 8 px.
const LANDSCAPE = 'mKYCnZqXl/iIeIiHeIeIiH94+IiI'
const LANDSCAPE_SHA =
    '27832e1a4c1683c34d0258424e9ed20145234419a4fcfbcffc7ac422a9c53906'
const TRANSPARENT = 'Y8WDBQA396eIiH52qBd4cI33B1iIiIB5WA=='
const TRANSPARENT_SHA =
    'aa65583762b0eda3bc31e15400938b3ded5908018eb23db1c246270344b96b22'

const sha = (text: string | undefined) =>
    createHash('sha256')
        .update(text ?? '')
        .digest('hex')

// The PNG's size, and a pixel's RGBA: it's uncompressed, one stored block
// per row (see rgbaToDataURL).
function png(uri: string | undefined) {
    const bytes = Buffer.from(
        (uri ?? '').replace('data:image/png;base64,', ''),
        'base64',
    )
    const width = bytes.readUInt32BE(16)
    const height = bytes.readUInt32BE(20)
    const pixel = (x: number, y: number) => {
        const i = 43 + y * (6 + width * 4) + 6 + x * 4
        return [...bytes.subarray(i, i + 4)]
    }
    return { width, height, pixel }
}

describe('thumbHashToDataURL', () => {
    it('is a PNG of at most 8 × 8 pixels, the reference decode averaged down', () => {
        const landscape = png(thumbHashToDataURL(LANDSCAPE))
        expect([landscape.width, landscape.height]).toEqual([8, 6])
        const [r, , b] = landscape.pixel(0, 3)
        const [r2, , b2] = landscape.pixel(7, 3)
        // Red on the left, blue on the right.
        expect(r).toBeGreaterThan(b)
        expect(b2).toBeGreaterThan(r2)
        const disc = png(thumbHashToDataURL(TRANSPARENT))
        expect([disc.width, disc.height]).toEqual([8, 8])
        // Transparent in the corner, opaque in the middle.
        expect(disc.pixel(0, 0)[3]).toBeLessThan(64)
        expect(disc.pixel(4, 4)[3]).toBe(255)
        expect(sha(thumbHashToDataURL(LANDSCAPE))).toBe(LANDSCAPE_SHA)
        expect(sha(thumbHashToDataURL(TRANSPARENT))).toBe(TRANSPARENT_SHA)
    })

    it('reads url-safe base64, and base64 without padding', () => {
        const uri = thumbHashToDataURL(TRANSPARENT)
        expect(thumbHashToDataURL(TRANSPARENT.replace(/=+$/, ''))).toBe(uri)
        expect(
            thumbHashToDataURL(
                LANDSCAPE.replace(/\+/g, '-').replace(/\//g, '_'),
            ),
        ).toBe(thumbHashToDataURL(LANDSCAPE))
    })

    it('is undefined for an empty or invalid hash', () => {
        expect(thumbHashToDataURL(undefined)).toBeUndefined()
        expect(thumbHashToDataURL('')).toBeUndefined()
        expect(thumbHashToDataURL('not base64!')).toBeUndefined()
        // Shorter than its header says.
        expect(thumbHashToDataURL(LANDSCAPE.slice(0, 12))).toBeUndefined()
        expect(thumbHashToDataURL('AAAA')).toBeUndefined()
    })

    it("is the web version's decoder once imported", () => {
        const decoder = (globalThis as Record<symbol, unknown>)[
            Symbol.for('react-native-fast-image/thumbhash')
        ]
        expect(decoder).toBe(thumbHashToDataURL)
    })
})
