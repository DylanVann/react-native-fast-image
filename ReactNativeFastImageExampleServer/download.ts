// Downloads the images the example app shows into images/, which the server
// serves. They're committed, so this only needs to run to add or replace one.
//
//   bun ReactNativeFastImageExampleServer/download.ts

import path from 'node:path'

const IMAGES = path.join(import.meta.dir, 'images')

// The first photos from picsum.photos/list, for the image grids.
const GRID_SIZE = 200

const picsum = (id: number | string, width: number, height: number) => ({
    file: `picsum/${id}-${width}x${height}.jpg`,
    url: `https://picsum.photos/id/${id}/${width}/${height}`,
})

const images = [
    {
        file: 'logo.png',
        url: 'https://raw.githubusercontent.com/DylanVann/react-native-fast-image/main/ReactNativeFastImageExample/src/images/logo.png',
    },
    {
        file: 'jellyfish.gif',
        url: 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif',
    },
    {
        file: 'plankton.gif',
        url: 'https://cdn-images-1.medium.com/max/1600/1*-CY5bU4OqiJRox7G00sftw.gif',
    },
    picsum(1015, 2048, 2048),
    picsum(1016, 2048, 2048),
    picsum(1018, 1024, 1024),
    picsum(1018, 600, 300),
    picsum(1020, 120, 120),
    picsum(1021, 120, 120),
    picsum(1022, 120, 120),
    picsum(1025, 200, 200),
]

const list = (await (await fetch('https://picsum.photos/list')).json()) as {
    id: number
    author: string
}[]
const grid = list.slice(0, GRID_SIZE).map(({ id, author }) => ({ id, author }))
await Bun.write(
    path.join(IMAGES, 'picsum/list.json'),
    JSON.stringify(grid, null, 4) + '\n',
)
images.push(...grid.map(({ id }) => picsum(id, 100, 100)))

async function download({ file, url }: { file: string; url: string }) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: ${response.status}`)
    await Bun.write(path.join(IMAGES, file), response)
}

// A few at a time; picsum rate-limits bursts.
const queue = [...images]
await Promise.all(
    Array.from({ length: 6 }, async () => {
        for (let image; (image = queue.shift());) await download(image)
    }),
)
console.log(`Downloaded ${images.length} images to ${IMAGES}`)
