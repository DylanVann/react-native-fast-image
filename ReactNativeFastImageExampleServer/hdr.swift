// Makes images/hdr-half.jpg, an HDR photo with a gain map (as an iPhone's)
// for the dynamicRangeLimit case (hdr): flat mid gray in standard range; in
// HDR, its right half 4 times brighter (linear) than its left half, which
// matches the standard range image. Committed, so this only needs to run to
// change it (macOS 15 or later):
//
//   swift ReactNativeFastImageExampleServer/hdr.swift ReactNativeFastImageExampleServer/images/hdr-half.jpg
import CoreImage
import Foundation

let width = 400
let height = 300
let rect = CGRect(x: 0, y: 0, width: width, height: height)
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
let linear = CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!
let standard = CIImage(color: CIColor(red: 0.5, green: 0.5, blue: 0.5, colorSpace: sRGB)!)
    .cropped(to: rect)
// 0.214 is sRGB's 0.5, linear.
let left = CIImage(color: CIColor(red: 0.214, green: 0.214, blue: 0.214, colorSpace: linear)!)
    .cropped(to: CGRect(x: 0, y: 0, width: width / 2, height: height))
let right = CIImage(color: CIColor(red: 4, green: 4, blue: 4, colorSpace: linear)!)
    .cropped(to: CGRect(x: width / 2, y: 0, width: width / 2, height: height))
try CIContext().writeJPEGRepresentation(
    of: standard,
    to: URL(fileURLWithPath: CommandLine.arguments[1]),
    colorSpace: CGColorSpace(name: CGColorSpace.displayP3)!,
    options: [.hdrImage: right.composited(over: left)]
)
