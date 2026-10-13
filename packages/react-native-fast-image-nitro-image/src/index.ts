import type { Image } from 'react-native-nitro-image'
import { NitroModules } from 'react-native-nitro-modules'
import type { FastImageNitroImages } from './specs/FastImageNitroImages.nitro'

const images = NitroModules.createHybridObject<FastImageNitroImages>(
    'FastImageNitroImages',
)

// Each Image's uri, so a view given the same Image again gets the same source
// (and doesn't load it again).
const uris = new WeakMap<Image, string>()

/**
 * The FastImage source that shows this Nitro Image. FastImage calls it for an
 * Image passed as its `source`, so apps don't need to.
 */
export function imageSource(image: Image): { uri: string } {
    let uri = uris.get(image)
    if (uri === undefined) {
        uri = images.addImage(image)
        uris.set(image, uri)
    }
    return { uri }
}
