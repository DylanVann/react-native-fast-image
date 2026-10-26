import React, { useContext, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ScreenStack, ScreenStackItem } from 'react-native-screens'
import FastImage from 'react-native-fast-image'
import { CaseStatus, caseStyles } from './CaseStatus'
import { imageUrl } from './imageServer'
import {
    Description,
    measureView,
    RegressionGroup,
    SampleContext,
    sampleStatus,
} from './RunnerContext'

// Cases in a native stack (react-native-screens), which only this app has:
// the minimum and tvOS apps run REGRESSION_GROUPS without these.

const RUN = Date.now()

// Colors of the test image, its ThumbHash (solid cyan) and the screen under it.
const MAGENTA = '#ff00ff'
const CYAN = '#00ffff'
const BLACK = '#000000'
const THUMBHASH_CYAN = 'KgQABwB5eIh3d3iIdwh3h3eIiHj4iIcP'

// A stack of two screens: a black one under one with a magenta image (with a
// cyan ThumbHash). Once the image has loaded, the top screen is popped while
// the screen is recorded (a video sample, see RunnerContext.tsx): the image
// should stay until the screen has slid away, showing the black one (on
// Android, React Native drops the popped screen's views at once, while
// react-native-screens still draws them for the animation, and the image went
// back to its ThumbHash, #1385).
function PopCase({
    id,
    description,
}: {
    id: string
    description: Description
}) {
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const started = useRef(false)
    const [popped, setPopped] = useState(false)
    const [status, setStatus] = useState('loading')
    const expect = [MAGENTA, BLACK]
    const onLoad = async () => {
        if (started.current) return
        started.current = true
        const area = await measureView(view.current)
        if (!area) return setStatus('not on screen')
        setStatus('recording')
        const result = await sample(
            {
                name: id,
                area,
                durationMs: 4000,
                expect,
                palette: [CYAN],
            },
            (done) => {
                setPopped(true)
                // The animation takes about 350 ms.
                setTimeout(done, 1000)
            },
        )
        setStatus(sampleStatus(result, expect))
    }
    return (
        <View style={caseStyles.row}>
            <View ref={view} collapsable={false} style={styles.stack}>
                <ScreenStack style={StyleSheet.absoluteFill}>
                    <ScreenStackItem
                        screenId={`${id}-under`}
                        headerConfig={{ hidden: true }}
                        contentStyle={styles.under}
                    />
                    {popped ? null : (
                        <ScreenStackItem
                            screenId={`${id}-top`}
                            headerConfig={{ hidden: true }}
                            stackAnimation="slide_from_right"
                        >
                            <FastImage
                                style={StyleSheet.absoluteFill}
                                source={{
                                    uri: imageUrl(`magenta.png?${id}=${RUN}`),
                                    thumbhash: THUMBHASH_CYAN,
                                }}
                                transition={false}
                                onLoad={onLoad}
                            />
                        </ScreenStackItem>
                    )}
                </ScreenStack>
            </View>
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

export const NAVIGATION_GROUPS: RegressionGroup[] = [
    {
        // Recorded (a video sample).
        name: 'navigation-pop',
        description: {
            checks: 'An image in a screen that a native stack pops stays until the screen is gone.',
            steps: 'A video sample: the screen is recorded while the case pops the screen, and the color in the middle of the view must go through the listed colors in order.',
        },
        cases: [
            <PopCase
                key="navigation-pop-thumbhash"
                id="navigation-pop-thumbhash"
                description={{
                    checks: 'A loaded image stays while its screen slides away (#1385: on Android, React Native drops the views of a popped screen as the animation starts, and the image went back to its ThumbHash for the rest of it).',
                    steps: "A 96 × 96 native stack (react-native-screens' ScreenStack) of two screens: a black one, and over it one with a magenta image with a cyan ThumbHash. Once the image has loaded, the top screen is popped with stackAnimation slide_from_right. Recorded for a second.",
                    shows: 'Recorded: magenta until the screen has slid away, then black; cyan (the ThumbHash) must not show. At the end, a black square.',
                }}
            />,
        ],
    },
]

const styles = StyleSheet.create({
    stack: {
        width: 96,
        height: 96,
        backgroundColor: BLACK,
    },
    under: {
        backgroundColor: BLACK,
    },
})
