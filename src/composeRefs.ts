// Shared by the native (index.tsx) and web (index.web.tsx) versions.
import type React from 'react'

// One ref that sets each of these refs (as React Native's useMergeRefs does),
// and clears them when it's cleared.
export function composeRefs<T>(
    ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
    return (value) => {
        const cleanups = refs.map((ref) => {
            if (typeof ref === 'function') {
                const cleanup = ref(value)
                return typeof cleanup === 'function'
                    ? cleanup
                    : () => {
                          ref(null)
                      }
            }
            if (ref) {
                ref.current = value
                return () => {
                    ref.current = null
                }
            }
            return undefined
        })
        return () => cleanups.forEach((cleanup) => cleanup?.())
    }
}
