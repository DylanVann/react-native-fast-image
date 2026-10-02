import { FlashList } from '@shopify/flash-list'
import { File, Paths } from 'expo-file-system'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Dimensions,
    PixelRatio,
    Platform,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import type { Adapter } from './adapter'

// The scenarios (see ../README.md). Each shows a marker bar, times the
// network (`probe`), then on a frame it records turns the marker green and mounts its images, records when each image's
// load event arrives, and once they've all loaded (or after `fixedMs`) measures
// where each cell is on screen and writes the results to
// Documents/results-<run>.json, which run.ts copies from the device over USB
// (no network permission needed).
export type ScenarioName = 'grid' | 'scroll' | 'large'

type Config = {
    set: 'grid' | 'scroll' | 'large'
    columns: number
    list: boolean
    // For subjects without load events (Nitro Image), done after this long
    // on each platform: about twice the longest it has taken to show every
    // image (iOS: under 0.9 s large, 0.4 s grid; Android on a Pixel 8 Pro:
    // 8.2 s large, 1.6 s grid). The others are done at their last load
    // event (or after SAFETY_MS).
    fixedMs: { ios: number; android: number }
}

// A subject with load events that doesn't send them all is done after this.
const SAFETY_MS = 30_000

export const SCENARIOS: Record<ScenarioName, Config> = {
    // 60 photos (400 px) in a grid that's laid out at once: the ones on
    // screen are timed from the recording.
    grid: {
        set: 'grid',
        columns: 4,
        list: false,
        fixedMs: { ios: 1_000, android: 3_000 },
    },
    // 500 photos (300 px) in a FlashList, which the UI test scrolls.
    scroll: {
        set: 'scroll',
        columns: 3,
        list: true,
        fixedMs: { ios: 1_000, android: 3_000 },
    },
    // 20 large photos (4000 × 3000) shown small: memory.
    large: {
        set: 'large',
        columns: 4,
        list: false,
        fixedMs: { ios: 2_000, android: 16_000 },
    },
}

// The cell background while an image hasn't shown: far from every tinted
// photo's average color, so the recording tells them apart.
export const PLACEHOLDER = '#d9d9d9'
const MARKER_WAITING = '#000000'
const MARKER_STARTED = '#00ff00'
// Room for the status bar and the Dynamic Island above the marker.
const TOP = 60
const MARKER_HEIGHT = 24

type Manifest = {
    sets: Record<
        string,
        {
            width: number
            height: number
            images: { key: string; color: string; bytes: number }[]
        }
    >
}

type Cell = {
    index: number
    key: string
    color: string
    uri: string
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
    delay: number
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
// stay on the native side, so it doesn't time copying them into JS.
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

export function Scenario({ name, adapter, run, server, delay }: ScenarioProps) {
    const config = SCENARIOS[name]
    const [phase, setPhase] = useState<
        'loading' | 'running' | 'measuring' | 'done' | 'failed'
    >('loading')
    const [cells, setCells] = useState<Cell[]>([])
    const [message, setMessage] = useState('')
    const started = useRef(0)
    const loaded = useRef(0)
    const views = useRef(new Map<number, View>())
    // Each image's load or error time, by cell index. Not state: the
    // results aren't shown, so a load doesn't render the cells again.
    const settled = useRef(new Map<number, Partial<Cell>>())
    const marker = useRef<View>(null)
    const probeUrls = useRef<(when: string) => string[]>(() => [])
    const probeBefore = useRef<Probe | undefined>(undefined)
    const finished = useRef(false)
    const { width } = Dimensions.get('window')
    const cellSize = Math.floor(width / config.columns)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const manifest: Manifest = await (
                await fetch(`${server}/manifest.json`)
            ).json()
            const images = manifest.sets[config.set].images
            const url = (key: string, runId: string) =>
                `${server}/${key}?run=${encodeURIComponent(runId)}${delay ? `&delay=${delay}` : ''}`
            const probeKeys = manifest.sets[PROBE_SET].images
                .slice(0, PROBE_COUNT)
                .map((image) => image.key)
            if (cancelled) return
            probeUrls.current = (when) =>
                probeKeys.map((key) => url(key, `${run}-probe-${when}`))
            probeBefore.current = await probe(
                probeUrls.current('before'),
            ).catch(() => undefined)
            // A moment for the recording to show the marker before it changes.
            await new Promise((r) => setTimeout(r, 300))
            if (cancelled) return
            setCells(
                images.map((image, index) => ({
                    index,
                    key: image.key,
                    color: image.color,
                    uri: url(image.key, run),
                })),
            )
            started.current = now()
            setPhase('running')
        })().catch((error) => {
            setMessage(String(error))
            setPhase('failed')
        })
        return () => {
            cancelled = true
        }
    }, [config.set, delay, run, server])

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
        const probeAfter = await probe(probeUrls.current('after')).catch(
            () => undefined,
        )
        const window = Dimensions.get('window')
        const results = {
            version: 1,
            subject: adapter.id,
            library: adapter.version,
            scenario: name,
            run,
            server,
            delay,
            platform: Platform.OS,
            osVersion: String(Platform.Version),
            scale: PixelRatio.get(),
            window: { width: window.width, height: window.height },
            marker: markerRect,
            placeholder: PLACEHOLDER,
            loadEvents: adapter.loadEvents,
            durationMs: now() - started.current,
            // Network speed just before the images mount and just after
            // they've all loaded.
            network: { before: probeBefore.current, after: probeAfter },
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
    }, [adapter, cells, delay, name, run, server])

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

    const settle = (index: number, result: Partial<Cell>) => {
        settled.current.set(index, result)
        loaded.current += 1
        const expected = config.list ? views.current.size : cells.length
        if (adapter.loadEvents && loaded.current >= expected) finish()
    }

    const renderCell = (cell: Cell) => (
        <View
            key={cell.index}
            ref={(view) => {
                if (view) views.current.set(cell.index, view)
                else views.current.delete(cell.index)
            }}
            collapsable={false}
            style={[styles.cell, { width: cellSize, height: cellSize }]}
        >
            <adapter.Image
                uri={cell.uri}
                style={styles.image}
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

    const running = phase !== 'loading'
    return (
        <View style={styles.screen}>
            <View
                ref={marker}
                collapsable={false}
                style={[
                    styles.marker,
                    {
                        backgroundColor: running
                            ? MARKER_STARTED
                            : MARKER_WAITING,
                    },
                ]}
            />
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
    marker: { height: MARKER_HEIGHT },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
        backgroundColor: PLACEHOLDER,
        borderWidth: 1,
        borderColor: '#ffffff',
    },
    image: { flex: 1 },
    status: {
        position: 'absolute',
        bottom: 40,
        left: 16,
        fontSize: 12,
        color: '#888888',
    },
})
