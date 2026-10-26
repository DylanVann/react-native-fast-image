import React, { useContext, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ScreenStack, ScreenStackItem } from 'react-native-screens'
import FastImage from 'react-native-fast-image'
import { CaseStatus, caseStyles } from './CaseStatus'
import { imageUrl } from './imageServer'
import {
    measureView,
    RegressionGroup,
    SampleContext,
    sampleStatus,
} from './RunnerContext'

// Cases in a native stack (react-native-screens), which the tvOS app doesn't
// have: it runs REGRESSION_GROUPS without these.

const RUN = Date.now()

// Colors of the test image, the screen it's on and the screen under it.
const MAGENTA = '#ff00ff'
const GRAY = '#808080'
const BLACK = '#000000'

// A stack of two screens: a black one under a gray one with a magenta image.
// Once the image has loaded, the top screen is popped while the screen is
// recorded (a video sample, see RunnerContext.tsx): the image should stay
// until the screen has slid away, showing the black one (on Android, React
// Native drops the popped screen's views at once, while react-native-screens
// still draws them for the animation, and the image went blank, showing the
// gray screen, #1385).
function PopCase({ id }: { id: string }) {
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
                palette: [GRAY],
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
                            contentStyle={styles.top}
                        >
                            <FastImage
                                style={StyleSheet.absoluteFill}
                                source={{
                                    uri: imageUrl(`magenta.png?${id}=${RUN}`),
                                }}
                                onLoad={onLoad}
                            />
                        </ScreenStackItem>
                    )}
                </ScreenStack>
            </View>
            <CaseStatus
                id={id}
                status={status}
                description="#1385: a loaded image stays while its screen slides away (a native stack's pop; on Android it went blank as the animation started). Recorded: magenta, then the black screen under it; gray (the screen behind a blank image) must not show"
            />
        </View>
    )
}

export const NAVIGATION_GROUPS: RegressionGroup[] = [
    {
        // Recorded (a video sample).
        name: 'navigation-pop',
        cases: [<PopCase key="navigation-pop" id="navigation-pop" />],
    },
]

const styles = StyleSheet.create({
    stack: {
        width: 96,
        height: 96,
        backgroundColor: BLACK,
    },
    top: {
        backgroundColor: GRAY,
    },
    under: {
        backgroundColor: BLACK,
    },
})
