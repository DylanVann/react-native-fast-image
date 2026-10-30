import React from 'react'
import { PriorityExample } from './PriorityExample'
import { GifExample } from './GifExample'
import { BorderRadiusExample } from './BorderRadiusExample'
import { ProgressExample } from './ProgressExample'
import { ObjectFitExample } from './ObjectFitExample'
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
        description: {
            checks: "The example screens' priority and GIF sections: three photos loaded with source.priority low, normal and high, and an animated GIF.",
            steps: "Loads a 2048×2048 photo of a fjord with priority 'low', a 2048×2048 photo of red canyon rocks with 'normal' and a 1024×1024 photo of green hills with 'high', then the plankton GIF, each with a new query so it isn't cached. Passes once all four have sent onLoad.",
            shows: 'Top to bottom: the line "Prioritize images (low, normal, high)." over a light gray band with three photos side by side, each cropped to fill its box (the fjord, the red rocks, the green hills with a road); then "GIF support." over a gray band with the GIF in a square in the middle, a small pale creature on black (animated, so it\'s not compared). An image that didn\'t load is a slightly darker gray box.',
        },
        wide: true,
        cases: [<PriorityExample key="priority" />, <GifExample key="gif" />],
    },
    {
        // On its own, with room for more border styles.
        name: 'border-radius',
        description: {
            checks: "borderRadius on the image view: the image clipped to the rounded corners, different radii per corner, and a border that follows the curve, also with a scale transform (#757: on iOS the border and the rounded image didn't line up, leaving a gap; #870: on Android borderRadius was drawn wrong with transform scale).",
            steps: 'Loads a 200×200 photo of a pug in a blanket four times (a new query each run): a 100×100 view with borderRadius 50; a wide view with borderRadius 50 but 10 at the top left and bottom right; an 80×80 view with borderRadius 24 and a 4 dp red border; and an 80×80 view with borderRadius 40, the same border and transform scale 0.9. Passes once all four have sent onLoad.',
            shows: 'Below the line "Border radius.", on a light gray band: a round pug photo, then a wide crop of it with large rounded corners at the top right and bottom left and small ones at the top left and bottom right; under them, in the middle, a rounded square and a slightly smaller circle, each with a red border hugging the photo all the way round. A failure is square corners, a gap or a step between the border and the photo, or a corner left uncut.',
        },
        wide: true,
        cases: [<BorderRadiusExample key="border-radius" />],
    },
    {
        name: 'examples-2',
        description: {
            checks: "The example screens' progress and objectFit sections: onLoadStart, onProgress and onLoad for a remote GIF, and the photo in tall boxes with each objectFit value.",
            steps: 'Loads the jellyfish GIF (a new query each run) with onLoadStart, onProgress and onLoad; it passes once onLoadStart and onLoad have come and the last onProgress reached 100 %. Then loads a 600×300 photo of green hills into four 50×100 boxes with objectFit="contain", "scale-down", "fill" and "cover"; it passes once all four have sent onLoad.',
            shows: 'Top to bottom: "Progress callbacks." over a light gray band with the jellyfish GIF in a square and the events with their times under it (both left out of the comparison: animated, and timings); then "objectFit." over a gray band with four tall boxes, labeled under each: contain and scale-down show the whole photo small, in the middle, with darker gray bars above and below (the same, as the photo is larger than the box); fill squeezes the whole photo into the tall box; cover fills it with the middle of the photo, cut off at the sides.',
        },
        wide: true,
        cases: [
            <ProgressExample key="progress" />,
            <ObjectFitExample key="object-fit-example" />,
        ],
    },
    {
        name: 'examples-tint',
        description: {
            checks: "The example screen's tintColor section: every pixel of the image that isn't transparent is drawn in the tint color, for bundled images and for remote ones without a defaultSource (the case of #1082, where iOS crashed tinting an image with no size).",
            steps: "Shows the bundled 1000×1000 React logo three times with tintColor 'green', '#9324c3' and 'rgba(0,0,0,0.5)', then the same logo from the image server three times with the same colors and objectFit=\"contain\". Passes once all six have sent onLoad.",
            shows: "Two sentences of text, then a light gray band with three React logos: green, purple, and gray (half-transparent black); then a sentence of text and a second band with the same three logos, slightly smaller. A logo in its usual light blue means the tint wasn't applied.",
        },
        wide: true,
        cases: [<TintColorExample key="tint-color" />],
    },
    {
        name: 'examples-3',
        description: {
            checks: "The example screen's local images section: bundled images (require() and import), a GIF, an animated WebP, a base64 data uri and a WebP.",
            steps: "Shows each source in a 64×64 view: an aerial photo of fields with require() and with import, the jellyfish as a GIF and as an animated WebP, the fields photo as a base64 data uri and as a WebP. Passes once all six have sent onLoad. The last item, a FastImageBackground for picking a photo from the library, has no image and isn't counted.",
            shows: 'Below "Local images.", on a light gray band, each image under its label, wrapping into rows: the fields photo twice and the jellyfish on blue (Require, Import, GIF); the jellyfish again, then the fields photo twice (Animated WebP, Base64, WebP); then "photo library" over a darker gray square with "Pick Photo" in white. On iOS three fit in a row (3, 3, then 1), on Android four (4, then 3). The two jellyfish are animated, so they\'re not compared.',
        },
        wide: true,
        cases: [<LocalImagesExample key="local-images" compact />],
    },
    {
        name: 'examples-auto-size',
        description: {
            checks: "The example screen's auto size section: a view that takes its height from the size onLoad reports, so the photo shows at its own aspect ratio.",
            steps: 'Loads a 600×300 photo of green hills (a new query each run) in a view 200 dp wide and 300 dp tall; on onLoad, sets the height to 200 × 300 / 600 = 100. Passes once onLoad has come.',
            shows: 'Below "AutoSize.", on a light gray band, the whole hills photo in a 200×100 box in the middle, with no darker gray around it. A failure is a 200×300 box, with the photo cropped to fill it.',
        },
        wide: true,
        cases: [<AutoSizeExample key="auto-size" />],
    },
    {
        name: 'fastimage-grid',
        // Its list mounts 200 images: how many have downloaded when the next
        // group replaces it depends on timing.
        countWork: false,
        description: {
            checks: "A grid of many remote images loading at the same time, like a gallery screen (the example screen's FastImage grid).",
            steps: "Fetches the image server's list of photos and shows them in a 4-column list with 6 rows, each a 100×100 photo in a square cell. Passes once all 24 have sent onLoad.",
            shows: "Six rows of four square photos, filling the width with thin white gaps: about two and a half rows of laptops on wooden tables, then landscapes (sea, a river, beaches and rocks, a waterfall, a path through grass, a mossy log), and in the last row a desk from above, white high heels on red, a man on a road and forks on a dark background. A photo that didn't load is an empty light gray cell.",
        },
        // A fixed number of rows: the runner's status lines below the cases
        // (while any isn't OK) would change the height of a grid that fills
        // the screen, and so the rows it waits for.
        wide: true,
        cases: [<FastImageGrid key="fastimage-grid" rows={6} />],
    },
]
