import { describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { thumbHashDataUri } from './thumbhash'

// Hashes of 4:3 red-to-blue and square transparent images, and the SHA-256 of
// the data uris Evan Wallace's reference thumbHashToDataURL makes of them.
const LANDSCAPE = 'mKYCnZqXl/iIeIiHeIeIiH94+IiI'
const LANDSCAPE_SHA =
    '344f62fde2a78829963dfcdf87c8fcb71dccba3982ee4e2a75fcc5ee2cf461ec'
const TRANSPARENT = 'Y8WDBQA396eIiH52qBd4cI33B1iIiIB5WA=='
const TRANSPARENT_SHA =
    'f80df4d5e021e3ae15f65c3621aac3ca2b77fbc155343b69ae2c17378720e4ed'

const sha = (text: string | undefined) =>
    createHash('sha256')
        .update(text ?? '')
        .digest('hex')

describe('thumbHashDataUri', () => {
    it('decodes as the reference implementation does', () => {
        expect(sha(thumbHashDataUri(LANDSCAPE))).toBe(LANDSCAPE_SHA)
        expect(sha(thumbHashDataUri(TRANSPARENT))).toBe(TRANSPARENT_SHA)
    })

    it('reads url-safe base64, and base64 without padding', () => {
        const uri = thumbHashDataUri(TRANSPARENT)
        expect(thumbHashDataUri(TRANSPARENT.replace(/=+$/, ''))).toBe(uri)
        expect(
            thumbHashDataUri(LANDSCAPE.replace(/\+/g, '-').replace(/\//g, '_')),
        ).toBe(thumbHashDataUri(LANDSCAPE))
    })

    it('is undefined for an empty or invalid hash', () => {
        expect(thumbHashDataUri(undefined)).toBeUndefined()
        expect(thumbHashDataUri('')).toBeUndefined()
        expect(thumbHashDataUri('not base64!')).toBeUndefined()
        // Shorter than its header says.
        expect(thumbHashDataUri(LANDSCAPE.slice(0, 12))).toBeUndefined()
        expect(thumbHashDataUri('AAAA')).toBeUndefined()
    })
})
