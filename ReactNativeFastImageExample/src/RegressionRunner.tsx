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
//   { type: 'mask', group, x, y, width, height }  an area (dp, from the
//                                                 window's top left) to leave
//                                                 out of screenshot comparisons
//   { type: 'snapshot', group, name }             take a screenshot now
//   { type: 'done' }                               past the last group
// From the script: { type: 'next' } shows the next group; { type: 'show',
// index } a given one.

type Message = { type: string; [key: string]: unknown }

const isFabric = () =>
    (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager !=
    null

const GROUPS = [...REGRESSION_GROUPS, ...EXAMPLE_GROUPS]

export default function RegressionRunner() {
    const groups = GROUPS
    const [index, setIndex] = useState(0)
    const [connected, setConnected] = useState(false)
    const socket = useRef<WebSocket | undefined>(undefined)
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
                else if (
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
    }, [groups])
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
}: {
    index: number
    group: RegressionGroup
    send: (message: Message) => void
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
    const mask = useCallback(
        (rect: Rect) => send({ type: 'mask', group: index, ...rect }),
        [index, send],
    )
    const snapshot = useCallback(
        (name: string) => send({ type: 'snapshot', group: index, name }),
        [index, send],
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
