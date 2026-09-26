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

// Registers a screen area (in window coordinates, dp) to leave out of the
// screenshot comparison.
export const MaskContext = createContext<(rect: Rect) => void>(() => {})

// Wraps content that differs between runs (an animated image, a timing) so
// its area isn't compared. Measured after each layout.
export function Masked({ children, style, ...props }: ViewProps) {
    const register = useContext(MaskContext)
    const ref = useRef<React.ComponentRef<typeof View>>(null)
    const onLayout = useCallback(() => {
        ref.current?.measureInWindow((x, y, width, height) =>
            register({ x, y, width, height }),
        )
    }, [register])
    return (
        <View
            ref={ref}
            collapsable={false}
            onLayout={onLayout}
            style={style}
            {...props}
        >
            {children}
        </View>
    )
}
