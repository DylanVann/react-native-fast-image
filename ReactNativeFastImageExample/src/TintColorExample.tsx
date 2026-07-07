import React from 'react'
import { StyleSheet } from 'react-native'
import FastImage from 'react-native-fast-image'
import SectionFlex from './SectionFlex'
import { ExampleCard } from './ExampleCard'
import { FEATURE_COLORS } from './theme'

// @ts-ignore
import LogoImage from './images/logo.png'

export const TintColorExample = () => {
    return (
        <ExampleCard
            icon="color-palette-outline"
            color={FEATURE_COLORS.tintColor}
            title="Tint Color"
            subtitle="All non-transparent pixels are changed to the color."
        >
            <SectionFlex style={styles.row}>
                <FastImage
                    style={styles.image}
                    tintColor={'green'}
                    source={LogoImage}
                />
                <FastImage
                    style={styles.image}
                    tintColor={'#9324c3'}
                    source={LogoImage}
                />
                <FastImage
                    style={styles.image}
                    tintColor={'rgba(0,0,0,0.5)'}
                    source={LogoImage}
                />
            </SectionFlex>
        </ExampleCard>
    )
}

const styles = StyleSheet.create({
    row: {
        paddingBottom: 16,
    },
    image: {
        flex: 1,
        height: 100,
        margin: 10,
    },
})
