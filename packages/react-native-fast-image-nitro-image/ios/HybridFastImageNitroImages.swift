import NitroImage
import NitroModules

// Gives Nitro Images' UIImages to FastImage's views (src/specs).
class HybridFastImageNitroImages: HybridFastImageNitroImagesSpec {
  func addImage(image: any HybridImageSpec) throws -> String {
    // NitroImage's own images, VisionCamera's and others' have one.
    guard let image = image as? NativeImage else {
      throw RuntimeError.error(withMessage: "FastImage can't show this Image: it has no UIImage (its class doesn't conform to NitroImage's NativeImage)")
    }
    return FFFastImageMemoryImages.add(image.uiImage)
  }
}
