import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Dimensions,
    LogBox,
    PixelRatio,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import {
    SafeAreaProvider,
    useSafeAreaInsets,
} from 'react-native-safe-area-context'
import FastImage from 'react-native-fast-image'
import {
    CaseAreaContext,
    DescribeContext,
    Description,
    InRunnerContext,
    Masked,
    MaskContext,
    MeasureMask,
    Rect,
    RegressionGroup,
    ReportContext,
    SampleChange,
    SampleContext,
    SampleRequest,
    SampleResult,
    measureView,
} from './RunnerContext'
import { regressionCheckUrl, regressionSocketUrl } from './imageServer'

// Runs the regression cases for scripts/verify.mts, without the accessibility
// tree: it shows one group of REGRESSION_GROUPS at a time and talks to the
// script over a WebSocket (relayed by the image server, see its /regression).
// The app shows this instead of its tabs when it's launched while the script
// (or any controller) is connected to the relay; see index.tsx.
//
// Messages to the script (JSON, one per WebSocket message):
//   { type: 'hello', platform, version, arch, groups: [names], window:
//     { width, height }, scale }                   on connecting (window in
//                                                 dp; scale = pixels per dp)
//   { type: 'group', index, name, cases: [ids], description, descriptions:
//     { id: description } }                       once a group is on screen
//   { type: 'status', group, id, status }         a case's status ('OK' passed)
//   { type: 'masks', group, id, masks, cases, content, visible, safeArea }
//                                                 the reply to 'measure'
//   { type: 'sample', group, name, area, durationMs, expect, palette }
//                                                 record a video sample (see
//                                                 scripts/verify.mts)
//   { type: 'sampleDone', group, name }           its change has finished
//   { type: 'done' }                               past the last group
// masks: the areas (dp, from the window's top left) to leave out of the
// screenshot comparison, measured just before (see Masked). content: the
// area the group's cases take; cases: each case's area (its row), by id;
// visible: the window's area that isn't under
// the system's bars at the bottom (the script fails a group whose cases go
// past it, as the screenshot would cut them off). safeArea: the screen's
// area inside its safe-area insets, which the script crops the screenshot
// to.
// From the script: { type: 'next' } shows the next group; { type: 'show',
// index } a given one; { type: 'measure', group, id } asks for the group's
// masks as they are now, before the script takes its screenshot;
// { type: 'recording', group, name } says a sample's recording has started,
// and { type: 'sampled', group, name, ok, seen, detail } gives its result.

type Message = { type: string; [key: string]: unknown }

// The reply to 'measure' (see above).
type Measured = {
    masks: Rect[]
    cases?: Record<string, Rect>
    content?: Rect
    visible?: Rect
    insets?: { top: number; bottom: number }
}

// After the last render has been laid out (two frames).
const afterLayout = () =>
    new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )

const isFabric = () =>
    (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager !=
    null

// Whether scripts/verify.mts is waiting to run the regression cases: it
// connects to the image server's relay before launching the app, and the app
// then shows the regression runner instead of its screens. Without the server
// (or the script), the request fails at once and the app starts as usual; a
// cold start on the emulator can take a few seconds to reach the server, so
// it's given time and a second try.
export async function runnerWanted() {
    for (let attempt = 0; attempt < 2; attempt++) {
        const abort = new AbortController()
        const timer = setTimeout(() => abort.abort(), 5000)
        try {
            const response = await fetch(regressionCheckUrl(), {
                signal: abort.signal,
            })
            return (await response.json()).controller === true
        } catch {
            // Refused (no server): start as usual. Timed out: once more.
            if (!abort.signal.aborted) return false
        } finally {
            clearTimeout(timer)
        }
    }
    return false
}

// groups: the groups to run, in order (the example apps' regression cases and
// example screens, or the Expo example's smoke cases).
export default function RegressionRunner({
    groups,
}: {
    groups: RegressionGroup[]
}) {
    // No fades unless a case asks for one (Android fades by default), so the
    // screenshots don't catch an image fading in. Set before the first group
    // renders; the fade-default group checks the built-in default.
    useState(() => FastImage.setDefaults({ transition: false }))
    useEffect(() => () => FastImage.setDefaults({ transition: null }), [])
    // No LogBox toasts: a case's development warning (e.g. React Native's
    // cache: 'reload') would cover later cases in the screenshots. Fatal
    // errors still show, and fail their group.
    useState(() => LogBox.ignoreAllLogs())
    const [index, setIndex] = useState(0)
    const [connected, setConnected] = useState(false)
    const socket = useRef<WebSocket | undefined>(undefined)
    // The whole screen (see 'measure').
    const screen = useRef<React.ComponentRef<typeof View>>(null)
    // Measures the group on screen's masks (set by Group).
    const measureMasks = useRef<() => Promise<Measured>>(async () => ({
        masks: [],
    }))
    const setMeasureMasks = useCallback((measure: () => Promise<Measured>) => {
        measureMasks.current = measure
    }, [])
    // Samples waiting for their recording to start, then for their result.
    const [samples] = useState(
        () =>
            new Map<
                string,
                {
                    change: SampleChange
                    resolve: (result: SampleResult) => void
                }
            >(),
    )
    // Sent once the socket is open, after hello.
    const queue = useRef<string[]>([])
    const send = useCallback((message: Message) => {
        const text = JSON.stringify(message)
        const ws = socket.current
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(text)
        else queue.current.push(text)
    }, [])
    useEffect(() => {
        let closed = false
        let ws: WebSocket | undefined
        let retry: ReturnType<typeof setTimeout> | undefined
        const connect = () => {
            ws = new WebSocket(regressionSocketUrl())
            socket.current = ws
            ws.onopen = () => {
                ws?.send(
                    JSON.stringify({
                        type: 'hello',
                        platform: Platform.OS,
                        version: Platform.Version,
                        arch: isFabric() ? 'fabric' : 'paper',
                        groups: groups.map((group) => group.name),
                        window: Dimensions.get('window'),
                        scale: PixelRatio.get(),
                    }),
                )
                for (const text of queue.current.splice(0)) ws?.send(text)
                setConnected(true)
            }
            ws.onmessage = (event) => {
                const message = JSON.parse(String(event.data)) as Message
                const sample = samples.get(`${message.group}/${message.name}`)
                if (message.type === 'recording') {
                    sample?.change(() =>
                        send({
                            type: 'sampleDone',
                            group: message.group,
                            name: message.name,
                        }),
                    )
                } else if (message.type === 'sampled') {
                    samples.delete(`${message.group}/${message.name}`)
                    sample?.resolve(message as unknown as SampleResult)
                } else if (message.type === 'next') setIndex((i) => i + 1)
                else if (message.type === 'measure') {
                    afterLayout()
                        .then(() =>
                            Promise.all([
                                measureMasks.current(),
                                measureView(screen.current),
                            ]),
                        )
                        .then(([{ insets, ...measured }, all]) => {
                            const safeArea = all &&
                                insets && {
                                    ...all,
                                    y: all.y + insets.top,
                                    height:
                                        all.height - insets.top - insets.bottom,
                                }
                            send({
                                type: 'masks',
                                group: message.group,
                                id: message.id,
                                ...measured,
                                safeArea,
                            })
                        })
                } else if (
                    message.type === 'show' &&
                    typeof message.index === 'number'
                )
                    setIndex(message.index)
            }
            ws.onclose = () => {
                setConnected(false)
                if (!closed) retry = setTimeout(connect, 500)
            }
            // onclose follows an error; the app keeps trying.
            ws.onerror = () => {}
        }
        connect()
        return () => {
            closed = true
            clearTimeout(retry)
            ws?.close()
        }
    }, [groups, send, samples])
    const done = index >= groups.length
    useEffect(() => {
        if (done) send({ type: 'done' })
    }, [done, send])
    return (
        <SafeAreaProvider>
            <Screen viewRef={screen}>
                <StatusBar hidden />
                {/* Only while it isn't showing a group, so screenshots
                don't have it. */}
                {!connected || done ? (
                    <Text style={styles.connection}>
                        regression runner: {connected ? 'done' : 'connecting'}
                    </Text>
                ) : null}
                {done ? null : (
                    <Group
                        key={index}
                        index={index}
                        group={groups[index]}
                        send={send}
                        setMeasureMasks={setMeasureMasks}
                        samples={samples}
                    />
                )}
            </Screen>
        </SafeAreaProvider>
    )
}

// The runner's screen, below the status bar (on iOS, StatusBar hidden has no
// effect under the scene lifecycle). React Native's dev banner ("Loading from
// Metro…") would cover the top; verify.mts hides it.
function Screen({
    viewRef,
    children,
}: {
    viewRef: React.RefObject<React.ComponentRef<typeof View> | null>
    children: React.ReactNode
}) {
    const insets = useSafeAreaInsets()
    return (
        <View
            ref={viewRef}
            collapsable={false}
            style={[styles.screen, { paddingTop: insets.top + 16 }]}
        >
            {children}
        </View>
    )
}

function Group({
    index,
    group,
    send,
    setMeasureMasks,
    samples,
}: {
    index: number
    group: RegressionGroup
    send: (message: Message) => void
    setMeasureMasks: (measure: () => Promise<Measured>) => void
    samples: Map<
        string,
        { change: SampleChange; resolve: (result: SampleResult) => void }
    >
}) {
    const statuses = useRef(new Map<string, string>())
    const descriptions = useRef(new Map<string, Description>())
    const describe = useCallback((id: string, description: Description) => {
        descriptions.current.set(id, description)
    }, [])
    // Cases that haven't passed (yet), with their statuses in full.
    const [notOk, setNotOk] = useState<string[]>([])
    const report = useCallback(
        (id: string, status: string) => {
            statuses.current.set(id, status)
            send({ type: 'status', group: index, id, status })
            setNotOk(
                [...statuses.current.entries()]
                    .filter(([, s]) => s !== 'OK')
                    .map(([caseId, s]) => `${caseId}: ${s}`),
            )
        },
        [index, send],
    )
    const masks = useRef(new Set<MeasureMask>())
    const mask = useCallback((measure: MeasureMask) => {
        masks.current.add(measure)
        return () => {
            masks.current.delete(measure)
        }
    }, [])
    const caseAreas = useRef(new Map<string, MeasureMask>())
    const caseArea = useCallback((id: string, measure: MeasureMask) => {
        caseAreas.current.set(id, measure)
        return () => {
            caseAreas.current.delete(id)
        }
    }, [])
    const cases = useRef<React.ComponentRef<typeof View>>(null)
    // The group's area, which fills the screen below the runner's padding.
    const area = useRef<React.ComponentRef<typeof View>>(null)
    const insets = useSafeAreaInsets()
    const measure = useCallback(async (): Promise<Measured> => {
        const rects = await Promise.all([...masks.current].map((m) => m()))
        const areas = await Promise.all(
            [...caseAreas.current].map(
                async ([id, m]) => [id, await m()] as const,
            ),
        )
        // Measured rather than from Dimensions, which can leave out the
        // system's bars on Android, which the apps draw under (edge to edge).
        const group = await measureView(area.current)
        return {
            masks: rects.filter((rect): rect is Rect => rect != null),
            cases: Object.fromEntries(
                areas.filter((entry): entry is [string, Rect] => !!entry[1]),
            ),
            content: await measureView(cases.current),
            visible: group && {
                ...group,
                height: group.height - insets.bottom,
            },
            insets: { top: insets.top, bottom: insets.bottom },
        }
    }, [insets.top, insets.bottom])
    useEffect(() => setMeasureMasks(measure), [setMeasureMasks, measure])
    const sample = useCallback(
        (request: SampleRequest, change: SampleChange) =>
            new Promise<SampleResult>((resolve) => {
                samples.set(`${index}/${request.name}`, { change, resolve })
                send({ type: 'sample', group: index, ...request })
            }),
        [index, send, samples],
    )
    // After the cases' effects, which report their first status.
    useEffect(() => {
        send({
            type: 'group',
            index,
            name: group.name,
            cases: [...statuses.current.keys()],
            description: group.description,
            descriptions: Object.fromEntries(descriptions.current),
        })
    }, [index, group, send])
    return (
        <InRunnerContext.Provider value>
            <ReportContext.Provider value={report}>
                <DescribeContext.Provider value={describe}>
                    <CaseAreaContext.Provider value={caseArea}>
                        <MaskContext.Provider value={mask}>
                            <SampleContext.Provider value={sample}>
                                <View
                                    ref={area}
                                    collapsable={false}
                                    style={[
                                        styles.group,
                                        // Above the system's bars at the bottom.
                                        { paddingBottom: insets.bottom },
                                    ]}
                                >
                                    {/* Grows to fill the screen (for cases that fill it,
                        like the grid), but not shrinking below its cases, so
                        cases that don't fit go past the visible screen and
                        the script fails the group (see 'measure'). */}
                                    <View
                                        ref={cases}
                                        collapsable={false}
                                        style={styles.cases}
                                    >
                                        {group.cases}
                                    </View>
                                    {/* Statuses in full (cases show none here), below the
                        cases so they can take as many lines as they need
                        without moving them. Empty once all have passed. */}
                                    <Masked>
                                        {notOk.map((line) => (
                                            <Text
                                                key={line}
                                                style={styles.notOk}
                                            >
                                                {line}
                                            </Text>
                                        ))}
                                    </Masked>
                                </View>
                            </SampleContext.Provider>
                        </MaskContext.Provider>
                    </CaseAreaContext.Provider>
                </DescribeContext.Provider>
            </ReportContext.Provider>
        </InRunnerContext.Provider>
    )
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: 'white',
        padding: 16,
    },
    group: {
        flex: 1,
    },
    cases: {
        flexGrow: 1,
        flexShrink: 0,
    },
    connection: {
        color: '#666',
        marginBottom: 8,
    },
    notOk: {
        color: '#b00020',
        marginBottom: 4,
    },
})
