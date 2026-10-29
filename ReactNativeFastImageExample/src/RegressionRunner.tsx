import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Dimensions,
    LogBox,
    NativeModules,
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
//   { type: 'group', index, name, wide, countWork, cases: [ids],
//     description, descriptions: { id: description } }
//                                                 once a group is on screen
//                                                 (wide: compared whole;
//                                                 countWork: false, its work
//                                                 isn't compared)
//   { type: 'status', group, id, status }         a case's status ('OK' passed)
//   { type: 'masks', group, id, masks, cases, content, visible, safeArea }
//                                                 the reply to 'measure'
//   { type: 'sample', group, name, area, durationMs, expect, palette }
//                                                 record a video sample (see
//                                                 scripts/verify.mts)
//   { type: 'sampleDone', group, name }           its change has finished
//   { type: 'frame', group, name, area }          a stepped sample's
//                                                 screenshot (see stepSample)
//   { type: 'stepped', group, name, expect, palette }
//                                                 its screenshots are all taken
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
// { type: 'framed', group, name } that a stepped sample's screenshot is
// taken, and { type: 'sampled', group, name, ok, seen, detail } gives its
// result; { type: 'end' } says the run is over (the work in the app's log
// after it isn't counted, and the script waits for the line to reach the
// log).

type Message = { type: string; [key: string]: unknown }

// Stepped samples' screenshots being taken, by `${group}/${name}`.
type Frames = Map<string, () => void>

// The example apps' animation clock (see AnimationClock.kt on Android,
// ExampleAnimationClock.m on iOS).
const clock = NativeModules.AnimationClock as
    | {
          pause: () => Promise<void>
          step: (ms: number) => Promise<void>
          resume: () => Promise<void>
      }
    | undefined
// How many steps a stepped sample's steppedMs takes (screenshots at 0, 25,
// 50, 75 and 100%: one mid-fade frame is enough, and the clock only moves in
// steps, so a fade is always sampled at those points), and how many more come
// after it (for a fade that started a little after the case said it was
// done).
const STEPS = 4
const MORE_STEPS = 2

// How long the app waits for a screenshot: longer than the script's own
// limits (10 s), so a late one can't answer the next step's request, and a
// reply lost when the app reconnects still doesn't leave the animations paused
// (the check says what it got).
const FRAME_TIMEOUT_MS = 15_000

// The stepped sample running (they take turns: the clock pauses every
// animation in the app), and the one before it.
let steppedTurn = Promise.resolve()

// A stepped sample (see SampleRequest): once the samples before it are done,
// pauses the animations, has the script screenshot the area, makes the change
// and waits for it (durationMs at most, as a recording), then steps through
// steppedMs (in STEPS steps, and MORE_STEPS more) with a screenshot after each
// step. 'recorded' if the animations couldn't be paused (it's recorded
// instead), 'gone' if its group was (the runner showed the next one).
function stepSample(
    group: number,
    request: SampleRequest,
    change: SampleChange,
    send: (message: Message) => void,
    frames: Frames,
    gone: () => boolean,
) {
    const turn = steppedTurn.then(async () => {
        if (!clock) return 'recorded' as const
        if (gone()) return 'gone' as const
        const shot = () =>
            new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, FRAME_TIMEOUT_MS)
                frames.set(`${group}/${request.name}`, () => {
                    clearTimeout(timer)
                    resolve()
                })
                send({
                    type: 'frame',
                    group,
                    name: request.name,
                    area: request.area,
                })
            })
        try {
            await clock.pause()
        } catch {
            return 'recorded' as const
        }
        try {
            await shot()
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, request.durationMs)
                change(() => {
                    clearTimeout(timer)
                    resolve()
                }, true)
            })
            const step = (request.steppedMs ?? 0) / STEPS
            for (let i = 0; i <= STEPS + MORE_STEPS && !gone(); i++) {
                await clock.step(i === 0 ? 0 : step)
                await shot()
            }
        } catch {
            // A step that failed: the check says what the screenshots got.
        } finally {
            await clock.resume().catch(() => {})
        }
        return gone() ? ('gone' as const) : ('stepped' as const)
    })
    steppedTurn = turn.then(
        () => {},
        () => {},
    )
    return turn
}

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
    // The group to show next ('next': the one after), while the one on screen
    // is unmounted and the caches cleared: each group starts with empty
    // caches, so the work it makes Fast Image do (see scripts/verify.mts)
    // doesn't depend on the groups before it, which differ between a full
    // run, a CI shard and a run of some groups. Cleared once the unmount is
    // on screen, when the views have let go of their images (Android's
    // memory cache keeps the images views hold).
    const [next, setNext] = useState<number | 'next' | undefined>(undefined)
    useEffect(() => {
        if (next === undefined) return
        let cancelled = false
        const show = () => {
            if (cancelled) return
            setIndex(next === 'next' ? index + 1 : next)
            setNext(undefined)
        }
        afterLayout()
            .then(() =>
                Promise.all([
                    FastImage.clearMemoryCache(),
                    FastImage.clearDiskCache(),
                ]),
            )
            .then(show, show)
        return () => {
            cancelled = true
        }
    }, [next, index])
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
    // Stepped samples waiting for their screenshots (see stepSample).
    const [frames] = useState<Frames>(() => new Map())
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
                    sample?.change(
                        () =>
                            send({
                                type: 'sampleDone',
                                group: message.group,
                                name: message.name,
                            }),
                        false,
                    )
                } else if (message.type === 'framed') {
                    const key = `${message.group}/${message.name}`
                    frames.get(key)?.()
                    frames.delete(key)
                } else if (message.type === 'sampled') {
                    samples.delete(`${message.group}/${message.name}`)
                    sample?.resolve(message as unknown as SampleResult)
                } else if (message.type === 'next') setNext('next')
                else if (message.type === 'end')
                    console.log('FastImageWork end')
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
                    setNext(message.index)
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
    }, [groups, send, samples, frames])
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
                {done || next !== undefined ? null : (
                    <Group
                        key={index}
                        index={index}
                        group={groups[index]}
                        send={send}
                        setMeasureMasks={setMeasureMasks}
                        samples={samples}
                        frames={frames}
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
    frames,
}: {
    index: number
    group: RegressionGroup
    send: (message: Message) => void
    setMeasureMasks: (measure: () => Promise<Measured>) => void
    samples: Map<
        string,
        { change: SampleChange; resolve: (result: SampleResult) => void }
    >
    frames: Frames
}) {
    // Before its cases mount: the work Fast Image logs after this line in
    // the app's log (FastImageWork, in debug builds) is this group's (see
    // scripts/verify.mts).
    useState(() => console.log(`FastImageWork group ${group.name}`))
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
                if (request.steppedMs !== undefined && clock) {
                    // Stepped, or recorded where the clock can't pause
                    // (hidden APIs not allowed).
                    stepSample(
                        index,
                        request,
                        change,
                        send,
                        frames,
                        () => unmounted.current,
                    ).then((result) => {
                        if (result === 'gone') return
                        send({
                            type: result === 'stepped' ? 'stepped' : 'sample',
                            group: index,
                            ...request,
                        })
                    })
                } else send({ type: 'sample', group: index, ...request })
            }),
        [index, send, samples, frames],
    )
    // Its stepped samples stop when it goes (see stepSample).
    const unmounted = useRef(false)
    useEffect(
        () => () => {
            unmounted.current = true
        },
        [],
    )
    // After the cases' effects, which report their first status.
    useEffect(() => {
        send({
            type: 'group',
            index,
            name: group.name,
            wide: group.wide === true,
            countWork: group.countWork !== false,
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
                                        style={[
                                            styles.cases,
                                            !group.wide && styles.narrow,
                                        ]}
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
    // Cases as wide as their content (see RegressionGroup's `wide`).
    narrow: {
        alignItems: 'flex-start',
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
