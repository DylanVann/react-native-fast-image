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
export type RegressionGroup = { name: string; cases: React.ReactElement[] }

// How the regression runner (RegressionRunner.tsx) hears from the cases and
// examples it shows. Outside the runner (the app's tabs) the contexts do
// nothing, so the same components serve both.

// Reports a case's status; 'OK' means it passed.
export const ReportContext = createContext<
    (id: string, status: string) => void
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
}
export type SampleResult = { ok: boolean; seen: string[]; detail?: string }

// Records a sample: calls `change` once the recording has started (make the
// change to check then; call `done` once it has finished, e.g. an image has
// loaded and faded in), and resolves with the result. Outside the runner
// nothing is recorded: it makes the change and passes.
export type SampleChange = (done: () => void) => void
export const SampleContext = createContext<
    (request: SampleRequest, change: SampleChange) => Promise<SampleResult>
>(async (_request, change) => {
    change(() => {})
    return { ok: true, seen: [], detail: 'not recorded (outside the runner)' }
})

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
