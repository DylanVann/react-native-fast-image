import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Dimensions,
    PixelRatio,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
    REGRESSION_GROUPS,
    RegressionGroup,
    styles as caseStyles,
} from './RegressionExample'
import { EXAMPLE_GROUPS } from './ExampleGroups'
import {
    Masked,
    MaskContext,
    MeasureMask,
    Rect,
    ReportContext,
    SnapshotContext,
} from './RunnerContext'
import { regressionSocketUrl } from './imageServer'

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
//   { type: 'group', index, name, cases: [ids] }  once a group is on screen
//   { type: 'status', group, id, status }         a case's status ('OK' passed)
//   { type: 'snapshot', group, name, masks }      take a screenshot now
//   { type: 'masks', group, id, masks }           the reply to 'measure'
//   { type: 'done' }                               past the last group
// masks: the areas (dp, from the window's top left) to leave out of the
// screenshot comparison, measured just before (see Masked).
// From the script: { type: 'next' } shows the next group; { type: 'show',
// index } a given one; { type: 'measure', group, id } asks for the group's
// masks as they are now, before the script takes its screenshot.

type Message = { type: string; [key: string]: unknown }

// After the last render has been laid out (two frames).
const afterLayout = () =>
    new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )

const isFabric = () =>
    (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager !=
    null

const GROUPS = [...REGRESSION_GROUPS, ...EXAMPLE_GROUPS]

export default function RegressionRunner() {
    const groups = GROUPS
    const [index, setIndex] = useState(0)
    const [connected, setConnected] = useState(false)
    const socket = useRef<WebSocket | undefined>(undefined)
    // Measures the group on screen's masks (set by Group).
    const measureMasks = useRef<() => Promise<Rect[]>>(async () => [])
    const setMeasureMasks = useCallback((measure: () => Promise<Rect[]>) => {
        measureMasks.current = measure
    }, [])
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
                if (message.type === 'next') setIndex((i) => i + 1)
                else if (message.type === 'measure') {
                    afterLayout()
                        .then(() => measureMasks.current())
                        .then((masks) =>
                            send({
                                type: 'masks',
                                group: message.group,
                                id: message.id,
                                masks,
                            }),
                        )
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
    }, [groups, send])
    const done = index >= groups.length
    useEffect(() => {
        if (done) send({ type: 'done' })
    }, [done, send])
    return (
        <SafeAreaProvider>
            <View style={styles.screen}>
                <StatusBar hidden />
                <Text style={styles.connection}>
                    regression runner: {connected ? 'connected' : 'connecting'}
                    {done
                        ? ', done'
                        : `, group ${index + 1} of ${groups.length}`}
                </Text>
                {done ? null : (
                    <Group
                        key={index}
                        index={index}
                        group={groups[index]}
                        send={send}
                        setMeasureMasks={setMeasureMasks}
                    />
                )}
            </View>
        </SafeAreaProvider>
    )
}

function Group({
    index,
    group,
    send,
    setMeasureMasks,
}: {
    index: number
    group: RegressionGroup
    send: (message: Message) => void
    setMeasureMasks: (measure: () => Promise<Rect[]>) => void
}) {
    const statuses = useRef(new Map<string, string>())
    const [summary, setSummary] = useState('')
    const report = useCallback(
        (id: string, status: string) => {
            statuses.current.set(id, status)
            send({ type: 'status', group: index, id, status })
            const all = [...statuses.current.entries()]
            const ok = all.filter(([, s]) => s === 'OK').length
            const rest = all
                .filter(([, s]) => s !== 'OK')
                .map(([caseId, s]) => `${caseId}: ${s}`)
            setSummary(
                ok === all.length
                    ? `OK (${ok})`
                    : `${ok}/${all.length} OK; ${rest.join(', ')}`,
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
    const measure = useCallback(async () => {
        const rects = await Promise.all([...masks.current].map((m) => m()))
        return rects.filter((rect): rect is Rect => rect != null)
    }, [])
    useEffect(() => setMeasureMasks(measure), [setMeasureMasks, measure])
    const snapshot = useCallback(
        (name: string) => {
            afterLayout()
                .then(measure)
                .then((rects) =>
                    send({
                        type: 'snapshot',
                        group: index,
                        name,
                        masks: rects,
                    }),
                )
        },
        [index, send, measure],
    )
    // After the cases' effects, which report their first status.
    useEffect(() => {
        send({
            type: 'group',
            index,
            name: group.name,
            cases: [...statuses.current.keys()],
        })
    }, [index, group, send])
    return (
        <ReportContext.Provider value={report}>
            <MaskContext.Provider value={mask}>
                <SnapshotContext.Provider value={snapshot}>
                    {/* The summary changes as cases settle, so a screenshot
                        taken while they run (a snapshot) leaves it out. */}
                    <Masked>
                        <Text style={caseStyles.title}>
                            {group.name}: {summary}
                        </Text>
                    </Masked>
                    {group.cases}
                </SnapshotContext.Provider>
            </MaskContext.Provider>
        </ReportContext.Provider>
    )
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: 'white',
        padding: 16,
        // Clear of the status bar (on iOS, StatusBar hidden has no effect
        // under the scene lifecycle) and of React Native's dev banner
        // ("Loading from Metro…", "Refreshing…"), which comes and goes and
        // sits up to about 130 dp down; verify.mts leaves that band out of
        // screenshot comparisons.
        paddingTop: 140,
    },
    connection: {
        color: '#666',
        marginBottom: 8,
    },
})
