import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Icon } from './Icon'
import { useTheme } from './theme'

interface IconAvatarProps {
    name?: string
    label?: string
    color: string
    size?: number
    circle?: boolean
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

// Appends an alpha channel to a bare 6-digit hex color (e.g. "#FF0000" + "33"
// -> "#FF000033"). Falls back to `fallback` for any other color format
// (rgba(), named colors, 3/8-digit hex) instead of silently producing an
// invalid color string.
export const withAlpha = (
    color: string,
    alphaHex: string,
    fallback: string,
): string => (HEX_COLOR.test(color) ? color + alphaHex : fallback)

// Small rounded-square colored avatar used both in the app header and as
// each example card's leading icon. Supports a short text `label` (e.g.
// "GIF") instead of a glyph `name`, since Ionicons has no literal GIF icon.
export const IconAvatar = ({
    name,
    label,
    color,
    size = 40,
    circle,
}: IconAvatarProps) => {
    const theme = useTheme()
    const tint = withAlpha(color, theme.dark ? '33' : '18', theme.placeholder)
    return (
        <View
            style={[
                styles.container,
                {
                    width: size,
                    height: size,
                    borderRadius: circle ? size / 2 : size * 0.28,
                    backgroundColor: tint,
                },
            ]}
        >
            {label ? (
                <Text style={[styles.label, { color, fontSize: size * 0.3 }]}>
                    {label}
                </Text>
            ) : (
                <Icon name={name as string} size={size * 0.5} color={color} />
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontWeight: '800',
    },
})
