import React, { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import FastImage, { type ObjectFit } from 'react-native-fast-image'
import { Images, type Image } from 'react-native-nitro-image'
import { CaseStatus, caseStyles as styles } from './CaseStatus'
import { imageUrl } from './imageServer'
import type { RegressionGroup } from './RunnerContext'

// Nitro Images (react-native-nitro-image's Image, which VisionCamera's photos
// and snapshots also give) as FastImage's source, shown through
// react-native-fast-image-nitro-image (packages/). Only in this example: the
// others don't have Nitro.

// Opaque RGBA colors.
type Rgb = [number, number, number]
const RED: Rgb = [255, 0, 0]
const GREEN: Rgb = [0, 200, 0]
const BLUE: Rgb = [0, 0, 255]
const YELLOW: Rgb = [255, 220, 0]

// An image made from pixels: `color(x, y)` for each.
function pixels(
    width: number,
    height: number,
    color: (x: number, y: number) => Rgb,
    allowGpu?: boolean,
): Image {
    const bytes = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const [r, g, b] = color(x, y)
            const i = (y * width + x) * 4
            bytes[i] = r
            bytes[i + 1] = g
            bytes[i + 2] = b
            bytes[i + 3] = 255
        }
    }
    return Images.loadFromRawPixelData(
        { buffer: bytes.buffer, width, height, pixelFormat: 'RGBA' },
        allowGpu,
    )
}

// Red, green, blue and yellow quarters.
const quadrants = (size: number, allowGpu?: boolean) =>
    pixels(
        size,
        size,
        (x, y) =>
            y < size / 2
                ? x < size / 2
                    ? RED
                    : GREEN
                : x < size / 2
                  ? BLUE
                  : YELLOW,
        allowGpu,
    )

// Four stripes, side by side: cover in a square shows the middle two.
const stripes = (width: number, height: number) =>
    pixels(
        width,
        height,
        (x) => [RED, GREEN, BLUE, YELLOW][Math.floor((x * 4) / width)],
    )

// An image from a file, as a camera's photo would be: FastImage downloads it
// and gives its path in the cache, and Nitro Image decodes it.
const WIDE = { uri: imageUrl('picsum/1018-600x300.jpg') }
async function fromFile(): Promise<Image> {
    const [preloaded] = await FastImage.preload([WIDE])
    if (!preloaded.ok) throw new Error(preloaded.error)
    const cached = await FastImage.getCachePath(WIDE)
    if (!cached.ok) throw new Error(cached.error)
    return Images.loadFromFileAsync(cached.path.replace(/^file:\/\//, ''))
}

// Shows the Image FastImage gets from `make`; passes once onLoad has the
// Image's size and onLoadEnd is ok.
function NitroImageCase({
    id,
    description,
    make,
    objectFit,
    blurRadius,
    tintColor,
    size = 64,
}: {
    id: string
    description: string
    make: () => Image | Promise<Image>
    objectFit?: ObjectFit
    blurRadius?: number
    tintColor?: string
    size?: number
}) {
    const [image, setImage] = useState<Image>()
    const [status, setStatus] = useState('waiting')
    const loaded = useRef<string>(undefined)
    useEffect(() => {
        Promise.resolve()
            .then(make)
            .then(setImage, (error) => setStatus(`no image: ${error}`))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const expected = image && `${image.width}x${image.height}`
    return (
        <View style={styles.row}>
            <View style={[styles.image, { width: size, height: size }]}>
                {image && (
                    <FastImage
                        style={{ width: size, height: size }}
                        source={image}
                        objectFit={objectFit}
                        blurRadius={blurRadius}
                        tintColor={tintColor}
                        onLoad={(e) => {
                            loaded.current = `${e.nativeEvent.width}x${e.nativeEvent.height}`
                        }}
                        onLoadEnd={(result) =>
                            setStatus(
                                result.ok && loaded.current === expected
                                    ? 'OK'
                                    : `onLoad ${loaded.current ?? 'not sent'}, onLoadEnd ${JSON.stringify(result)}, expected ${expected}`,
                            )
                        }
                    />
                )}
            </View>
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// The same Image across renders loads once; another Image loads again.
function NitroImageRerenderCase() {
    const [first] = useState(() => quadrants(32))
    const [second, setSecond] = useState<Image>()
    const [renders, setRenders] = useState(0)
    const [status, setStatus] = useState('waiting')
    const starts = useRef(0)
    const loads = useRef(0)
    const onLoad = () => {
        loads.current++
        if (loads.current === 1) {
            // Re-render with the same Image (and a new style object) a few
            // times, then switch to another Image.
            let n = 0
            const timer = setInterval(() => {
                setRenders(++n)
                if (n === 3) {
                    clearInterval(timer)
                    setTimeout(() => setSecond(stripes(32, 32)), 300)
                }
            }, 100)
        } else if (loads.current === 2) {
            setStatus(
                starts.current === 2
                    ? 'OK'
                    : `${starts.current} onLoadStart for 2 Images`,
            )
        }
    }
    return (
        <View style={styles.row}>
            <FastImage
                style={[styles.image, { opacity: 1 - renders * 0.001 }]}
                source={second ?? first}
                onLoadStart={() => starts.current++}
                onLoad={onLoad}
            />
            <CaseStatus
                id="nitro-image-rerender"
                status={status}
                description="Re-rendering with the same Nitro Image doesn't load it again; another Image loads"
            />
        </View>
    )
}

export const NITRO_IMAGE_GROUPS: RegressionGroup[] = [
    {
        name: 'nitro-image',
        cases: [
            <NitroImageCase
                key="nitro-image"
                id="nitro-image"
                description="A Nitro Image made from pixels shows (red, green, blue and yellow quarters), with onLoad's size"
                make={() => quadrants(64)}
            />,
            <NitroImageCase
                key="nitro-image-cover"
                id="nitro-image-cover"
                description="objectFit cover crops a wide Nitro Image: the middle stripes (green, blue)"
                make={() => stripes(128, 64)}
                objectFit="cover"
            />,
            <NitroImageCase
                key="nitro-image-gpu"
                id="nitro-image-gpu"
                description="A Nitro Image in GPU memory (allowGpu; a hardware bitmap on Android) shows, with objectFit cover"
                make={() => quadrants(64, true)}
                objectFit="cover"
                size={48}
            />,
            <NitroImageCase
                key="nitro-image-blur-tint"
                id="nitro-image-blur-tint"
                description="blurRadius and tintColor apply to a Nitro Image"
                make={() => quadrants(64)}
                blurRadius={4}
                tintColor="#8000ff"
                size={48}
            />,
            <NitroImageCase
                key="nitro-image-file"
                id="nitro-image-file"
                description="A Nitro Image decoded from a file (as a camera's photo) shows, 600x300, objectFit contain"
                make={fromFile}
                objectFit="contain"
                size={96}
            />,
            <NitroImageRerenderCase key="nitro-image-rerender" />,
        ],
    },
]
