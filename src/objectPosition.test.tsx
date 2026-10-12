import { describe, expect, it } from 'bun:test'
import { cssPosition, resolveObjectPosition } from './objectPosition'

// Each value with the object-position Chrome 154 computes for it (an <img>'s
// getComputedStyle, checked 2026-10-10), or INVALID where it ignores it.
const CHROME: [string, string][] = [
    ['center', '50% 50%'],
    ['left', '0% 50%'],
    ['right', '100% 50%'],
    ['top', '50% 0%'],
    ['bottom', '50% 100%'],
    ['10px', '10px 50%'],
    ['25%', '25% 50%'],
    ['0', '0px 50%'],
    ['10', 'INVALID'],
    ['left top', '0% 0%'],
    ['top left', '0% 0%'],
    ['center top', '50% 0%'],
    ['top center', '50% 0%'],
    ['center left', '0% 50%'],
    ['left center', '0% 50%'],
    ['center center', '50% 50%'],
    ['10% 20%', '10% 20%'],
    ['10px 20px', '10px 20px'],
    ['left 10%', '0% 10%'],
    ['10% top', '10% 0%'],
    ['top 10%', 'INVALID'],
    ['10% left', 'INVALID'],
    ['left right', 'INVALID'],
    ['top bottom', 'INVALID'],
    ['right 10px bottom 20%', 'calc(100% - 10px) 80%'],
    ['bottom 20% right 10px', 'calc(100% - 10px) 80%'],
    ['left 0 top 0', '0px 0px'],
    ['right 10px top', 'INVALID'],
    ['right top 10px', 'INVALID'],
    ['center 10px top 0', 'INVALID'],
    ['left 10px center', 'INVALID'],
    ['right -10px bottom 120%', 'calc(100% + 10px) -20%'],
    ['10PX 20Px', '10px 20px'],
    ['LEFT TOP', '0% 0%'],
    ['  left   top  ', '0% 0%'],
    ['10px, 20px', 'INVALID'],
    ['5.5px .5%', '5.5px 0.5%'],
    ['+5px -5px', '5px -5px'],
    ['1e1px 0', '10px 0px'],
]

// Chrome writes a zero as 0px or 0%, whichever was given.
const zero = (css: string) => css.replace(/(^|[ (])0(px|%)/g, '$10')

describe('objectPosition', () => {
    it('resolves CSS positions as Chrome does', () => {
        for (const [value, chrome] of CHROME) {
            const position = resolveObjectPosition(value)
            const css = position ? cssPosition(position) : 'INVALID'
            expect(`${value}: ${zero(css)}`).toBe(`${value}: ${zero(chrome)}`)
        }
    })

    it("doesn't take calc() or units other than px and %", () => {
        // Valid CSS (calc(100% - 10px) 50%, 16px 32px), but not supported.
        expect(resolveObjectPosition('calc(100% - 10px) 50%')).toBeNull()
        expect(resolveObjectPosition('1em 2em')).toBeNull()
    })

    it('resolves to a fraction of the free space and an offset', () => {
        expect(resolveObjectPosition('right 10px bottom 20%')).toEqual({
            x: { fraction: 1, offset: -10 },
            y: { fraction: 0.8, offset: 0 },
        })
        expect(resolveObjectPosition(undefined)).toEqual({
            x: { fraction: 0.5, offset: 0 },
            y: { fraction: 0.5, offset: 0 },
        })
    })

    it('takes edges as an object, a missing axis centered', () => {
        expect(resolveObjectPosition({ right: 10, bottom: '20%' })).toEqual(
            resolveObjectPosition('right 10px bottom 20%'),
        )
        expect(resolveObjectPosition({ top: 0 })).toEqual(
            resolveObjectPosition('center top'),
        )
        expect(resolveObjectPosition({ left: '25%' })).toEqual(
            resolveObjectPosition('25% center'),
        )
        expect(resolveObjectPosition({})).toEqual(
            resolveObjectPosition('center'),
        )
    })

    it("doesn't take opposite edges together, or other values", () => {
        expect(resolveObjectPosition({ top: 0, bottom: 0 } as any)).toBeNull()
        expect(resolveObjectPosition({ left: 0, right: 0 } as any)).toBeNull()
        expect(resolveObjectPosition({ left: '10px' } as any)).toBeNull()
        expect(resolveObjectPosition({ left: Number.NaN })).toBeNull()
        expect(resolveObjectPosition(10 as any)).toBeNull()
    })
})
