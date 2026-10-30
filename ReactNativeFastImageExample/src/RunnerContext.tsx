import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import { View, ViewProps } from 'react-native'

// A group of cases the regression runner (RegressionRunner.tsx) shows at once.
export type RegressionGroup = {
    name: string
    description: GroupDescription
    cases: React.ReactElement[]
    // Its cases fill the screen's width (the example screens' sections). In
    // the runner, other groups' cases are only as wide as what they show, so
    // each case's area (and screenshot) is its images. A wide group's
    // screenshot is compared as a whole.
    wide?: boolean
}

// What a case checks, in plain English, for someone reviewing its screenshot
// who hasn't read its code. The Regression tab shows it, and the runner sends
// it to scripts/verify.mts (results.json).
export type Description = {
    // What it checks, and the bug it's for: the issue, the platform and what
    // went wrong.
    checks: string
    // What it does, in order: its sources and props, the changes it makes,
    // how the image server answers. Left out when `checks` says it all.
    steps?: string
    // What its part of the screenshot shows once it has passed (left to
    // right), and what a failure looks like there; for a video sample, the
    // colors it records in order.
    shows: string
}

// What a group checks as a whole; its cases describe themselves. `steps` is
// for what its cases share (the server's behavior, video samples), and
// `shows` only for groups whose cases don't describe themselves (the example
// screens).
export type GroupDescription = {
    checks: string
    steps?: string
    shows?: string
}

// How the regression runner (RegressionRunner.tsx) hears from the cases and
// examples it shows. Outside the runner (the app's tabs) the contexts do
// nothing, so the same components serve both.

// Reports a case's status; 'OK' means it passed.
export const ReportContext = createContext<
    (id: string, status: string) => void
>(() => {})

// Gives the runner a case's description, as it mounts.
export const DescribeContext = createContext<
    (id: string, description: Description) => void
>(() => {})

// Reports a status whenever it changes.
export function useReport(id: string, status: string) {
    const report = useContext(ReportContext)
    useEffect(() => report(id, status), [report, id, status])
}

// Counts an example's image loads: `onLoad` for each image, and the status is
// OK once `expected` have loaded.
export function useLoads(id: string, expected: number) {
    const [loaded, setLoaded] = useState(0)
    useReport(id, loaded >= expected ? 'OK' : `${loaded}/${expected} loaded`)
    return useCallback(() => setLoaded((n) => n + 1), [])
}

export type Rect = { x: number; y: number; width: number; height: number }

// Where a view is on screen (dp, from the top left), for masks and samples;
// undefined if it isn't there. measure's page position (from the root view,
// which starts at the top of the screen: the apps are edge to edge) is where
// the screenshot shows it.
export function measureView(
    view: React.ComponentRef<typeof View> | null,
): Promise<Rect | undefined> {
    return new Promise((resolve) => {
        if (!view) return resolve(undefined)
        view.measure((_x, _y, width, height, pageX, pageY) =>
            resolve({ x: pageX, y: pageY, width, height }),
        )
    })
}

// A video sample (see "video samples" in scripts/verify.mts): the colors to
// see at the middle of an area, in order, while the screen is recorded (for
// durationMs at most). `palette`: colors that mustn't appear (so they're
// recognized).
export type SampleRequest = {
    name: string
    area: Rect
    durationMs: number
    expect: string[]
    palette?: string[]
    // Where the app can pause its animations (see AnimationClock.kt and
    // ExampleAnimationClock.m), the sample is stepped instead of recorded:
    // the animations are paused, the case makes its change, and once it's
    // done they're stepped through this long (ms, and a little more), with a
    // screenshot after each step. A group's stepped samples take turns.
    steppedMs?: number
}
export type SampleResult = { ok: boolean; seen: string[]; detail?: string }

// Records a sample: calls `change` once the recording has started (make the
// change to check then; call `done` once it has finished, e.g. an image has
// loaded and faded in), and resolves with the result. Outside the runner
// nothing is recorded: it makes the change and passes.
// stepped: the sample is stepped (see SampleRequest), so the animations wait
// for the steps: `done` can come as soon as they've started.
export type SampleChange = (done: () => void, stepped: boolean) => void
export const SampleContext = createContext<
    (request: SampleRequest, change: SampleChange) => Promise<SampleResult>
>(async (_request, change) => {
    change(() => {}, false)
    return { ok: true, seen: [], detail: 'not recorded (outside the runner)' }
})

// True in the runner, which shows one group at a time. The app's Regression
// tab shows every case at once.
export const InRunnerContext = createContext(false)

// A sample's result as a case status: OK, or what was seen instead.
export const sampleStatus = (result: SampleResult, expect: string[]) =>
    result.ok
        ? 'OK'
        : (result.detail ??
          `saw ${result.seen.join(', ') || 'nothing'}, expected ${expect.join(', ')}`)

// Measures a masked area (in screen coordinates, dp); undefined if it isn't
// on screen.
export type MeasureMask = () => Promise<Rect | undefined>

// Registers a masked area's measure function, to leave it out of the
// screenshot comparison; returns a function that unregisters it.
export const MaskContext = createContext<(measure: MeasureMask) => () => void>(
    () => () => {},
)

// Registers a case's area (its row: the view its CaseStatus is in) with the
// runner, which sends it with the masks so a reviewer can find the case in
// the screenshot; returns a function that unregisters it.
export const CaseAreaContext = createContext<
    (id: string, measure: MeasureMask) => () => void
>(() => () => {})

// Wraps content that differs between runs (an animated image, a timing) so
// its area isn't compared. The runner measures it when a screenshot is taken,
// so it's where it is then, even if something above it changed size (which
// moves it without a layout event of its own).
export function Masked({ children, style, ...props }: ViewProps) {
    const register = useContext(MaskContext)
    const ref = useRef<React.ComponentRef<typeof View>>(null)
    useEffect(() => register(() => measureView(ref.current)), [register])
    return (
        <View ref={ref} collapsable={false} style={style} {...props}>
            {children}
        </View>
    )
}
