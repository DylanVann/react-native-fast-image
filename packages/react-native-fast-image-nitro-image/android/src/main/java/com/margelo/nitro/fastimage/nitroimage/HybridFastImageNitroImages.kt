package com.margelo.nitro.fastimage.nitroimage

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.fastimage.FastImageMemoryImages
import com.margelo.nitro.image.HybridImage
import com.margelo.nitro.image.HybridImageSpec

// Gives Nitro Images' bitmaps to FastImage's views (src/specs).
@Keep
@DoNotStrip
class HybridFastImageNitroImages : HybridFastImageNitroImagesSpec() {
  override fun addImage(image: HybridImageSpec): String {
    // NitroImage's own images, and VisionCamera's.
    val bitmap = (image as? HybridImage)?.bitmap
      ?: throw Error("FastImage can't show this Image: it has no Bitmap (it isn't NitroImage's HybridImage)")
    return FastImageMemoryImages.add(bitmap)
  }
}
