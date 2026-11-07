// Cut the foreground subject out of an image using the macOS Vision
// foreground mask (the same model behind "Remove Background" in Preview and
// Photos). Segmentation only; no pixels are generated.
//
// Usage: swift remove-bg.swift <input image> <output.png>
// Requires macOS 14 or newer.

import AppKit
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: remove-bg.swift <input> <output.png>\n".data(using: .utf8)!)
    exit(2)
}
let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])

guard let image = CIImage(contentsOf: inputURL, options: [.applyOrientationProperty: true]) else {
    FileHandle.standardError.write("cannot read \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

let handler = VNImageRequestHandler(ciImage: image, options: [:])
let request = VNGenerateForegroundInstanceMaskRequest()
do {
    try handler.perform([request])
} catch {
    FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}
guard let result = request.results?.first else {
    FileHandle.standardError.write("no foreground subject found\n".data(using: .utf8)!)
    exit(1)
}

let maskBuffer: CVPixelBuffer
do {
    maskBuffer = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
} catch {
    FileHandle.standardError.write("mask failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}

let mask = CIImage(cvPixelBuffer: maskBuffer)
let blend = CIFilter(name: "CIBlendWithMask")!
blend.setValue(image, forKey: kCIInputImageKey)
blend.setValue(CIImage(color: .clear).cropped(to: image.extent), forKey: kCIInputBackgroundImageKey)
blend.setValue(mask, forKey: kCIInputMaskImageKey)
guard let cutout = blend.outputImage else {
    FileHandle.standardError.write("blend failed\n".data(using: .utf8)!)
    exit(1)
}

let context = CIContext()
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
do {
    try context.writePNGRepresentation(of: cutout, to: outputURL, format: .RGBA8, colorSpace: colorSpace, options: [:])
} catch {
    FileHandle.standardError.write("write failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}
print(outputURL.path)
