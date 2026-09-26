import React from 'react'
import { PriorityExample } from './PriorityExample'
import { GifExample } from './GifExample'
import { BorderRadiusExample } from './BorderRadiusExample'
import { ProgressExample } from './ProgressExample'
import { ResizeModeExample } from './ResizeModeExample'
import { TintColorExample } from './TintColorExample'
import { LocalImagesExample } from './LocalImagesExample'
import { AutoSizeExample } from './AutoSizeExample'
import FastImageGrid from './FastImageGrid'
import { RegressionGroup } from './RegressionExample'

// The example screens' sections, in groups the regression runner shows one
// at a time: each reports when its images have loaded (RunnerContext.tsx),
// and its screenshot is compared with a reference. Animated images are
// masked. The preload example isn't here (the regression cases cover it), nor
// the React Native Image grid (it exercises Fresco, not this library).
export const EXAMPLE_GROUPS: RegressionGroup[] = [
    {
        name: 'examples-1',
        cases: [<PriorityExample key="priority" />, <GifExample key="gif" />],
    },
    {
        // On its own, with room for more border styles.
        name: 'border-radius',
        cases: [<BorderRadiusExample key="border-radius" />],
    },
    {
        name: 'examples-2',
        cases: [
            <ProgressExample key="progress" />,
            <ResizeModeExample key="resize-mode-example" />,
            <TintColorExample key="tint-color" />,
        ],
    },
    {
        name: 'examples-3',
        cases: [
            <LocalImagesExample key="local-images" compact />,
            <AutoSizeExample key="auto-size" />,
        ],
    },
    {
        name: 'fastimage-grid',
        cases: [<FastImageGrid key="fastimage-grid" />],
    },
]
