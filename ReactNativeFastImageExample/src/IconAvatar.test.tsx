import { withAlpha } from './IconAvatar'

describe('withAlpha', () => {
    it('appends the alpha suffix to a valid 6-digit hex color', () => {
        expect(withAlpha('#4C6FFF', '33', '#000000')).toBe('#4C6FFF33')
    })

    it('is case-insensitive for hex digits', () => {
        expect(withAlpha('#abcdef', '18', '#000000')).toBe('#abcdef18')
    })

    it.each([
        ['rgba(0,0,0,0.5)'],
        ['red'],
        ['#fff'],
        ['#12345678'],
        [''],
    ])('falls back for a non-6-digit-hex color: %s', (color) => {
        expect(withAlpha(color, '33', '#FALLBACK')).toBe('#FALLBACK')
    })
})
