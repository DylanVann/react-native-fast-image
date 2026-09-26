import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import { View, ViewProps } from 'react-native'

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

// Asks the runner's script for a screenshot now, named after the case (for a
// state that passes, such as an image still loading).
export const SnapshotContext = createContext<(name: string) => void>(() => {})

export type Rect = { x: number; y: number; width: number; height: number }

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
    useEffect(
        () =>
            register(
                () =>
                    new Promise((resolve) => {
                        const view = ref.current
                        if (!view) return resolve(undefined)
                        // measure's page position (from the root view,
                        // which starts at the top of the screen: both apps are
                        // edge to edge) is where the screenshot shows it. On
                        // Android's legacy architecture, measureInWindow
                        // leaves out the status bar (or display cutout) height.
                        view.measure((_x, _y, width, height, pageX, pageY) =>
                            resolve({ x: pageX, y: pageY, width, height }),
                        )
                    }),
            ),
        [register],
    )
    return (
        <View ref={ref} collapsable={false} style={style} {...props}>
            {children}
        </View>
    )
}
