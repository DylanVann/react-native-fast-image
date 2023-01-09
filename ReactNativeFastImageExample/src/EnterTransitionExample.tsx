import React from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import FeatureText from './FeatureText'
import Section from './Section'
import SectionFlex from './SectionFlex'
import { TransitionImage } from './TransitionImage'

export const EnterTransitionExample = () => {
    return (
        <View>
            <Section>
                <FeatureText
                    text={`• Image enter transitions (${
                        Platform.OS === 'ios' ? 'curlDown, curlUp, ' : ''
                    }fadeIn, flipBottom, flipLeft, flipRight, flipTop).`}
                />
            </Section>
            {Platform.OS === 'ios' ? (
                <SectionFlex style={styles.row}>
                    <TransitionImage enterTransition="curlDown" />
                    <TransitionImage enterTransition="curlUp" />
                </SectionFlex>
            ) : null}
            <SectionFlex style={styles.row}>
                <TransitionImage enterTransition="flipTop" />
                <TransitionImage enterTransition="flipBottom" />
            </SectionFlex>
            <SectionFlex style={styles.row}>
                <TransitionImage enterTransition="flipLeft" />
                <TransitionImage enterTransition="flipRight" />
            </SectionFlex>
            <SectionFlex style={styles.row}>
                <TransitionImage enterTransition="fadeIn" />
            </SectionFlex>
        </View>
    )
}

const styles = StyleSheet.create({
    row: {
        paddingHorizontal: 10,
        paddingVertical: 20,
    },
})
