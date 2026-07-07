import { useColorScheme } from 'react-native'

export interface Theme {
    dark: boolean
    background: string
    cardBackground: string
    textPrimary: string
    textSecondary: string
    placeholder: string
    border: string
    tabBarBackground: string
    tabBarActive: string
    tabBarInactive: string
    accent: string
    statusBarStyle: 'dark-content' | 'light-content'
}

const light: Theme = {
    dark: false,
    background: '#FFFFFF',
    cardBackground: '#F6F6F9',
    textPrimary: '#131318',
    textSecondary: '#6C6C76',
    placeholder: '#E4E4EA',
    border: '#ECECF1',
    tabBarBackground: '#FFFFFF',
    tabBarActive: '#6C5CE7',
    tabBarInactive: '#9A9AA6',
    accent: '#6C5CE7',
    statusBarStyle: 'dark-content',
}

const dark: Theme = {
    dark: true,
    background: '#0B0B12',
    cardBackground: '#16161F',
    textPrimary: '#F5F5F8',
    textSecondary: '#9797A6',
    placeholder: '#22222E',
    border: '#26263380',
    tabBarBackground: '#0B0B12',
    tabBarActive: '#8B7CF6',
    tabBarInactive: '#5C5C6B',
    accent: '#8B7CF6',
    statusBarStyle: 'light-content',
}

export const useTheme = (): Theme => {
    const scheme = useColorScheme()
    return scheme === 'dark' ? dark : light
}

// One accent color per example section - drives its icon avatar's icon color
// and tinted background (alpha-blended at render time, see IconAvatar).
export const FEATURE_COLORS = {
    priority: '#4C6FFF',
    gif: '#22C55E',
    borderRadius: '#A855F7',
    progress: '#F59E0B',
    preload: '#3B82F6',
    resizeMode: '#EC4899',
    tintColor: '#14B8A6',
    localImages: '#84CC16',
    autoSize: '#F97316',
    brand: '#6C5CE7',
}
