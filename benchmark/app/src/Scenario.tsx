import { FlashList } from '@shopify/flash-list'
import { File, Paths } from 'expo-file-system'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Animated,
    Dimensions,
    Easing,
    PixelRatio,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import type { Adapter } from './adapter'

// The scenarios (see ../README.md). Each shows a black marker bar, then turns
// the marker green, starts the clock and mounts its images, records when each
// image's load event arrives, and once they've all loaded (or after
// `fixedMs`) measures where each cell is on screen and the network (`probe`),
// writes the results to Documents/results-<run>.json (which run.ts copies
// from the device over USB, no network permission needed) and turns the
// marker blue.
export type ScenarioName = 'grid' | 'scroll' | 'large' | 'sizes'

type Config = {
    columns: number
    list: boolean
    // The manifest's set of photos (the scenario's own by default), and how
    // many of them.
    set?: string
    count?: number
    // Each photo once per entry, at that many columns: the same urls at
    // several sizes at once.
    sizes?: number[]
    // For subjects without load events (Nitro Image), done after this long
    // on each platform. With no bandwidth limit every subject shows every
    // image within 1 s (iPhone 15 Pro Max, Pixel 8); with `--mbps 50`, within
    // 0.5 s (grid) and 5.5 s (large). The others are done at their last load
    // event (or after SAFETY_MS).
    fixedMs: { ios: number; android: number }
}

// A subject with load events that doesn't send them all is done after this.
const SAFETY_MS = 30_000

// The clock next to the marker: CLOCK_BITS squares, white for a 1, showing
// the time since the run started in CLOCK_UNIT_MS units, in binary (lowest
// bit first), up to about a minute. The native driver updates it every frame
// without JS, so each frame of a recording says when it was drawn, whenever
// it reached the Mac.
const CLOCK_BITS = 14
const CLOCK_UNIT_MS = 4
const CLOCK_UNITS = 2 ** CLOCK_BITS

export const SCENARIOS: Record<ScenarioName, Config> = {
    // 60 photos (400 px) in a grid that's laid out at once: the ones on
    // screen are timed from the recording.
    grid: {
        columns: 4,
        list: false,
        fixedMs: { ios: 2_000, android: 3_000 },
    },
    // 500 photos (300 px) in a FlashList, which the UI test scrolls.
    scroll: {
        columns: 3,
        list: true,
        fixedMs: { ios: 1_000, android: 3_000 },
    },
    // 20 large photos (4000 × 3000) shown small: memory.
    large: {
        columns: 4,
        list: false,
        fixedMs: { ios: 8_000, android: 8_000 },
    },
    // 16 of the grid's photos at two sizes at once (4 and 8 columns), with
    // the same urls: a library that shares a download between its requests
    // makes 16, not 32 (the image server counts them).
    sizes: {
        columns: 4,
        list: false,
        set: 'grid',
        count: 16,
        sizes: [4, 8],
        fixedMs: { ios: 2_000, android: 3_000 },
    },
}

// The cell background while an image hasn't shown: far from every tinted
// photo's average color, so the recording tells them apart.
export const PLACEHOLDER = '#d9d9d9'
// The same color as an image, for libraries' placeholders (`placeholder`).
const PLACEHOLDER_IMAGE: number = require('./placeholder.png')
const MARKER_WAITING = '#000000'
const MARKER_STARTED = '#00ff00'
const MARKER_DONE = '#0000ff'
// Room for the status bar and the Dynamic Island above the marker.
const TOP = 60
const MARKER_HEIGHT = 24
const MARKER_WIDTH = 96

type Manifest = {
    sets: Record<
        string,
        { images: { key: string; color: string; bytes: number }[] }
    >
}

type Cell = {
    index: number
    key: string
    color: string
    uri: string
    // Its size, in columns (the scenario's by default).
    columns?: number
    loadMs?: number
    errorMs?: number
    error?: string
}

type Rect = { x: number; y: number; width: number; height: number }

export type ScenarioProps = {
    name: ScenarioName
    adapter: Adapter
    run: string
    server: string
    // The burst test's (BenchmarkTest.kt): wait for a tap on `start` before
    // mounting the images, so the measured frames start there, and no clock
    // (nothing records the screen, and the clock draws a frame every vsync);
    // fade the images in; show a placeholder image until each loads.
    hold?: boolean
    fade?: boolean
    placeholder?: boolean
}

const now = () => performance.now()

const measure = (view: View | null) =>
    new Promise<Rect | undefined>((resolve) => {
        if (!view) return resolve(undefined)
        view.measure((_x, _y, width, height, x, y) =>
            resolve({ x, y, width, height }),
        )
    })

// The images the network probe downloads: the same for every scenario, so
// rates compare across them.
const PROBE_SET = 'large'
const PROBE_COUNT = 4

export type Probe = { bytes: number; ms: number; mbps: number }

// Times downloading the probe images with fetch, `PROBE_COUNT` at a time, the
// same way for every subject (not through the image library), so a run's
// network speed shows next to its times. The bodies are read as blobs, which
// stay on the native side, so it doesn't time copying them into JS. Only
// after the run: on iOS fetch shares its connections with React Native's
// Image, which would otherwise start with them open. (`close`: the image
// server closes these connections, and the manifest's.)
async function probe(urls: string[]): Promise<Probe> {
    const start = now()
    const sizes = await Promise.all(
        urls.map(async (url) => {
            const blob = await (await fetch(url)).blob()
            const size = blob.size
            ;(blob as { close?: () => void }).close?.()
            return size
        }),
    )
    const ms = now() - start
    const bytes = sizes.reduce((sum, size) => sum + size, 0)
    return { bytes, ms, mbps: (bytes * 8) / 1000 / ms }
}

export function Scenario({
    name,
    adapter,
    run,
    server,
    hold = false,
    fade = false,
    placeholder = false,
}: ScenarioProps) {
    const config = SCENARIOS[name]
    const [phase, setPhase] = useState<
        'loading' | 'ready' | 'running' | 'measuring' | 'done' | 'failed'
    >('loading')
    // hold: mounts the images.
    const start = useRef<() => void>(undefined)
    const [cells, setCells] = useState<Cell[]>([])
    const [message, setMessage] = useState('')
    const started = useRef(0)
    const views = useRef(new Map<number, View>())
    // Each image's first load or error time, by cell index. Not state: the
    // results aren't shown, so a load doesn't render the cells again.
    const settled = useRef(new Map<number, Partial<Cell>>())
    const marker = useRef<View>(null)
    const clockView = useRef<View>(null)
    const [clock] = useState(() => new Animated.Value(0))
    // Bit k is 1 while the clock modulo 2^(k+1) is at least 2^k.
    const [clockBits] = useState(() =>
        Array.from({ length: CLOCK_BITS }, (_, k) =>
            Animated.modulo(clock, 2 ** (k + 1)).interpolate({
                inputRange: [0, 2 ** k - 0.001, 2 ** k, 2 ** (k + 1)],
                outputRange: [0, 0, 1, 1],
            }),
        ),
    )
    const probeUrls = useRef<string[]>([])
    const finished = useRef(false)
    const { width } = Dimensions.get('window')

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const manifest: Manifest = await (
                await fetch(`${server}/manifest.json`)
            ).json()
            const images = manifest.sets[config.set ?? name].images.slice(
                0,
                config.count,
            )
            const url = (key: string, runId: string) =>
                `${server}/${key}?run=${encodeURIComponent(runId)}`
            probeUrls.current = manifest.sets[PROBE_SET].images
                .slice(0, PROBE_COUNT)
                .map((image) => `${url(image.key, `${run}-probe`)}&close`)
            // A moment for the recording to show the marker before it changes.
            await new Promise((r) => setTimeout(r, 300))
            if (cancelled) return
            if (hold) {
                await new Promise<void>((resolve) => {
                    start.current = resolve
                    setPhase('ready')
                })
                if (cancelled) return
            }
            setCells(
                (config.sizes ?? [config.columns]).flatMap((columns, size) =>
                    images.map((image, i) => ({
                        index: size * images.length + i,
                        key: image.key,
                        color: image.color,
                        uri: url(image.key, run),
                        columns,
                    })),
                ),
            )
            started.current = now()
            setPhase('running')
            // It stops at its largest value rather than wrap to 0.
            if (!hold) {
                Animated.timing(clock, {
                    toValue: CLOCK_UNITS - 1,
                    duration: (CLOCK_UNITS - 1) * CLOCK_UNIT_MS,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }).start()
            }
        })().catch((error) => {
            setMessage(String(error))
            setPhase('failed')
        })
        return () => {
            cancelled = true
        }
    }, [clock, config, hold, name, run, server])

    const finish = useCallback(async () => {
        if (finished.current) return
        finished.current = true
        // Let the last images draw before measuring.
        await new Promise((r) => setTimeout(r, 300))
        setPhase('measuring')
        const rects = await Promise.all(
            cells.map((cell) => measure(views.current.get(cell.index) ?? null)),
        )
        const markerRect = await measure(marker.current)
        const clockRect = await measure(clockView.current)
        const network = await probe(probeUrls.current).catch(() => undefined)
        const window = Dimensions.get('window')
        const results = {
            version: 1,
            subject: adapter.id,
            library: adapter.version,
            scenario: name,
            run,
            server,
            platform: Platform.OS,
            osVersion: String(Platform.Version),
            scale: PixelRatio.get(),
            window: { width: window.width, height: window.height },
            marker: markerRect,
            clock: clockRect && {
                rect: clockRect,
                bits: CLOCK_BITS,
                unitMs: CLOCK_UNIT_MS,
            },
            placeholder: PLACEHOLDER,
            loadEvents: adapter.loadEvents,
            durationMs: now() - started.current,
            // Network speed once the images have loaded.
            network,
            images: cells.map((cell, i) => ({
                ...cell,
                ...settled.current.get(cell.index),
                rect: rects[i],
            })),
        }
        try {
            const json = JSON.stringify(results)
            new File(Paths.document, `results-${run}.json`).write(json)
            // Android: also in the log, for the Macrobenchmark test to read
            // (it can't read a release app's files), in chunks a log line
            // can hold.
            if (Platform.OS === 'android') {
                const size = 3000
                const count = Math.ceil(json.length / size)
                for (let i = 0; i < count; i++) {
                    console.log(
                        `BENCH_RESULTS ${run} ${i + 1}/${count} ${json.slice(i * size, (i + 1) * size)}`,
                    )
                }
            }
            setPhase('done')
        } catch (error) {
            setMessage(`couldn't write the results: ${error}`)
            setPhase('failed')
        }
    }, [adapter, cells, name, run, server])

    // Done when every mounted image has loaded or failed (a list only mounts
    // the ones near the screen); without load events, after fixedMs.
    const waitMs = adapter.loadEvents
        ? SAFETY_MS
        : config.fixedMs[Platform.OS === 'android' ? 'android' : 'ios']
    useEffect(() => {
        if (phase !== 'running') return
        const timer = setTimeout(finish, waitMs)
        return () => clearTimeout(timer)
    }, [phase, finish, waitMs])

    // An image's first load or error counts (a library can send more).
    const settle = (index: number, result: Partial<Cell>) => {
        if (settled.current.has(index)) return
        settled.current.set(index, result)
        const expected = config.list ? views.current.size : cells.length
        if (adapter.loadEvents && settled.current.size >= expected) finish()
    }

    const cellSize = (cell: Cell) => {
        const size = Math.floor(width / (cell.columns ?? config.columns))
        return { width: size, height: size }
    }

    const renderCell = (cell: Cell) => (
        <View
            key={cell.index}
            ref={(view) => {
                if (view) views.current.set(cell.index, view)
                else views.current.delete(cell.index)
            }}
            collapsable={false}
            style={[styles.cell, cellSize(cell)]}
        >
            <adapter.Image
                uri={cell.uri}
                style={styles.image}
                fade={fade}
                placeholder={placeholder ? PLACEHOLDER_IMAGE : undefined}
                onLoad={() =>
                    settle(cell.index, { loadMs: now() - started.current })
                }
                onError={(error) =>
                    settle(cell.index, {
                        errorMs: now() - started.current,
                        error,
                    })
                }
            />
        </View>
    )

    const running = phase !== 'loading' && phase !== 'ready'
    return (
        <View style={styles.screen}>
            <View style={styles.markerRow}>
                <View
                    ref={marker}
                    collapsable={false}
                    style={[
                        styles.marker,
                        {
                            backgroundColor:
                                phase === 'done'
                                    ? MARKER_DONE
                                    : running
                                      ? MARKER_STARTED
                                      : MARKER_WAITING,
                        },
                    ]}
                />
                {/* Not in the list scenario, which is only scrolled. */}
                {!config.list && !hold && (
                    <View
                        ref={clockView}
                        collapsable={false}
                        style={styles.clock}
                    >
                        {clockBits.map((opacity, k) => (
                            <Animated.View
                                key={k}
                                style={[styles.clockBit, { opacity }]}
                            />
                        ))}
                    </View>
                )}
            </View>
            {running &&
                (config.list ? (
                    <FlashList
                        testID="list"
                        data={cells}
                        numColumns={config.columns}
                        keyExtractor={(cell) => String(cell.index)}
                        renderItem={({ item }) => renderCell(item)}
                    />
                ) : (
                    <View style={styles.grid}>{cells.map(renderCell)}</View>
                ))}
            {phase === 'ready' && (
                <Pressable
                    testID="start"
                    style={styles.start}
                    onPress={() => start.current?.()}
                />
            )}
            <Text
                testID={phase === 'done' ? 'done' : 'status'}
                style={styles.status}
            >
                {phase}
                {message ? `: ${message}` : ''}
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#ffffff', paddingTop: TOP },
    markerRow: { flexDirection: 'row', height: MARKER_HEIGHT },
    marker: { width: MARKER_WIDTH },
    clock: { flex: 1, flexDirection: 'row', backgroundColor: '#000000' },
    clockBit: { flex: 1, backgroundColor: '#ffffff' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
        backgroundColor: PLACEHOLDER,
        borderWidth: 1,
        borderColor: '#ffffff',
    },
    image: { flex: 1 },
    start: { flex: 1 },
    // Above the marker, so it isn't over a timed cell as it changes.
    status: {
        position: 'absolute',
        top: TOP - 14,
        left: 16,
        fontSize: 10,
        lineHeight: 12,
        color: '#888888',
    },
})
