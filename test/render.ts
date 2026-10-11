// react-test-renderer's create(), rendered inside act(): React 19 renders
// asynchronously otherwise, so the tree would still be empty when a test reads
// it.
import type React from 'react'
import TestRenderer, {
    act,
    type ReactTestRenderer,
    type TestRendererOptions,
} from 'react-test-renderer'

export function create(
    element: React.ReactElement,
    options?: TestRendererOptions,
): ReactTestRenderer {
    let renderer: ReactTestRenderer | undefined
    act(() => {
        renderer = TestRenderer.create(element, options)
    })
    return renderer!
}

export default { create }
