// The ref's reload(), shared by the native (index.tsx) and web
// (index.web.tsx) versions.
import type React from 'react'

// A ref for FastImage's view that gives the view reload(), as React Native's
// TextInput gives its native view its methods, and passes it on to the app's
// ref (whose cleanup it returns).
export function withReload<View extends object>(
    ref: React.Ref<View> | undefined,
    reload: (view: View) => void,
) {
    return (view: View | null): (() => void) | undefined => {
        if (view) {
            Object.assign(view, { reload: () => reload(view) })
        }
        if (typeof ref === 'function') {
            const cleanup = ref(view)
            return typeof cleanup === 'function'
                ? cleanup
                : () => {
                      ref(null)
                  }
        }
        if (ref) {
            ref.current = view
            return () => {
                ref.current = null
            }
        }
        return undefined
    }
}
