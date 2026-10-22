import XCTest
import AVFoundation
import UniformTypeIdentifiers
import MWSChatCore
@testable import MWChat
final class SegmentCollector: NSObject, AVAssetWriterDelegate {
    private let lock = NSLock()
    private var data = Data()
    func assetWriter(_ writer: AVAssetWriter, didOutputSegmentData segmentData: Data, segmentType: AVAssetSegmentType) { lock.lock(); data.append(segmentData); lock.unlock() }
    func bytes() -> Data { lock.lock(); defer { lock.unlock() }; return data }
}
final class MemoryVideoTests: XCTestCase {
    func testActualAppleH264SegmentsRemuxInMemoryAndPlayThroughMemoryResource() async throws {
        let writer = try AVAssetWriter(contentType: .mpeg4Movie), collector = SegmentCollector()
        writer.delegate = collector; writer.outputFileTypeProfile = .mpeg4AppleHLS; writer.preferredOutputSegmentInterval = CMTime(seconds: 0.5, preferredTimescale: 600); writer.initialSegmentStartTime = .zero
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 64, AVVideoHeightKey: 64, AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 100000, AVVideoAllowFrameReorderingKey: false, AVVideoMaxKeyFrameIntervalKey: 15]])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: 64, kCVPixelBufferHeightKey as String: 64])
        XCTAssertTrue(writer.canAdd(input)); writer.add(input); XCTAssertTrue(writer.startWriting()); writer.startSession(atSourceTime: .zero)
        for frame in 0..<30 {
            var retries = 0
            while !input.isReadyForMoreMediaData { retries += 1; if retries > 5000 { throw ChatError.unavailable }; try await Task.sleep(nanoseconds: 1_000_000) }
            var buffer: CVPixelBuffer?; XCTAssertEqual(CVPixelBufferCreate(kCFAllocatorDefault, 64, 64, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer), kCVReturnSuccess)
            let pixel = try XCTUnwrap(buffer); CVPixelBufferLockBaseAddress(pixel, []); memset(CVPixelBufferGetBaseAddress(pixel)!, Int32(frame*5), CVPixelBufferGetDataSize(pixel)); CVPixelBufferUnlockBaseAddress(pixel, [])
            XCTAssertTrue(adaptor.append(pixel, withPresentationTime: CMTime(value: Int64(frame), timescale: 30)))
        }
        writer.endSession(atSourceTime: CMTime(value: 30, timescale: 30)); input.markAsFinished()
        await withCheckedContinuation { c in writer.finishWriting { c.resume() } }
        XCTAssertEqual(writer.status, .completed, writer.error?.localizedDescription ?? "")
        let source = collector.bytes(); XCTAssertFalse(source.isEmpty)
        let flat = try MP4.flatten(source); XCTAssertTrue(MP4.validEnvelope(flat))
        let resource = MemoryAsset(flat, mime: "video/mp4")
        let duration = try await resource.asset.load(.duration); XCTAssertGreaterThan(duration.seconds, 0.5); XCTAssertLessThanOrEqual(duration.seconds, 1.1)
        let tracks = try await resource.asset.loadTracks(withMediaType: .video); XCTAssertEqual(tracks.count, 1)
        // Synthetic-only output in CI test target, never in application capture/playback.
        let file = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("mws-synthetic-memory-video.mp4"); try flat.write(to: file)
    }
}
