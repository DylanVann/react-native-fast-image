import type { Image } from 'react-native-nitro-image'
import type { HybridObject } from 'react-native-nitro-modules'

export interface FastImageNitroImages extends HybridObject<{
    ios: 'swift'
    android: 'kotlin'
}> {
    /**
     * Gives the Image's native image (its UIImage or Bitmap) to FastImage's
     * views, and returns the uri they show it by. FastImage only holds it
     * weakly: the uri works while the Image is alive.
     */
    addImage(image: Image): string
}
