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
        try await encodeMemoryVideo(audio: false)
    }
    func testActualAppleH264AACSegmentsRemuxWithBothTracks() async throws {
        try await encodeMemoryVideo(audio: true)
    }
    private func encodeMemoryVideo(audio: Bool) async throws {
        let writer = AVAssetWriter(contentType: .mpeg4Movie), collector = SegmentCollector()
        writer.delegate = collector; writer.outputFileTypeProfile = .mpeg4AppleHLS; writer.preferredOutputSegmentInterval = CMTime(seconds: 0.5, preferredTimescale: 600); writer.initialSegmentStartTime = .zero
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 64, AVVideoHeightKey: 64, AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 100000, AVVideoAllowFrameReorderingKey: false, AVVideoMaxKeyFrameIntervalKey: 15]])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: 64, kCVPixelBufferHeightKey as String: 64])
        XCTAssertTrue(writer.canAdd(input)); writer.add(input)
        let sound = AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64000]); sound.expectsMediaDataInRealTime = false
        if audio { XCTAssertTrue(writer.canAdd(sound)); writer.add(sound) }
        XCTAssertTrue(writer.startWriting()); writer.startSession(atSourceTime: .zero)
        var audioIndex = 0
        for frame in 0..<30 {
            var retries = 0
            while !input.isReadyForMoreMediaData { retries += 1; if retries > 5000 { throw ChatError.unavailable }; try await Task.sleep(nanoseconds: 1_000_000) }
            var buffer: CVPixelBuffer?; XCTAssertEqual(CVPixelBufferCreate(kCFAllocatorDefault, 64, 64, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer), kCVReturnSuccess)
            let pixel = try XCTUnwrap(buffer); CVPixelBufferLockBaseAddress(pixel, []); memset(CVPixelBufferGetBaseAddress(pixel)!, Int32(frame*5), CVPixelBufferGetDataSize(pixel)); CVPixelBufferUnlockBaseAddress(pixel, [])
            XCTAssertTrue(adaptor.append(pixel, withPresentationTime: CMTime(value: Int64(frame), timescale: 30)))
            while audio && Double(audioIndex * 1024) / 44100 < Double(frame+1) / 30 {
                var waiting = 0
                while !sound.isReadyForMoreMediaData { waiting += 1; if waiting > 5000 { throw ChatError.unavailable }; try await Task.sleep(nanoseconds: 1_000_000) }
                XCTAssertTrue(sound.append(try audioSample(index: audioIndex))); audioIndex += 1
            }
        }
        writer.endSession(atSourceTime: CMTime(value: 30, timescale: 30)); input.markAsFinished(); if audio { sound.markAsFinished() }
        await withCheckedContinuation { c in writer.finishWriting { c.resume() } }
        XCTAssertEqual(writer.status, .completed, writer.error?.localizedDescription ?? "")
        let source = collector.bytes(); XCTAssertFalse(source.isEmpty)
        let flat = try MP4.flatten(source); XCTAssertTrue(MP4.validEnvelope(flat)); XCTAssertTrue(MP4.selfContained(flat))
        let ownReference = Data([0,0,0,12]) + Data("url ".utf8) + Data([0,0,0,1])
        let reference = try XCTUnwrap(flat.range(of: ownReference)); var external = flat; external[reference.upperBound-1] = 0
        XCTAssertFalse(MP4.selfContained(external)); XCTAssertTrue(MemoryAsset(external, mime: "video/mp4").data.isEmpty, "External media references must not reach the platform loader")
        let resource = MemoryAsset(flat, mime: "video/mp4")
        let duration = try await resource.asset.load(.duration); XCTAssertGreaterThan(duration.seconds, 0.5); XCTAssertLessThanOrEqual(duration.seconds, 1.1)
        let tracks = try await resource.asset.loadTracks(withMediaType: .video); XCTAssertEqual(tracks.count, 1)
        let sounds = try await resource.asset.loadTracks(withMediaType: .audio); XCTAssertEqual(sounds.count, audio ? 1 : 0)
        // Synthetic-only output in CI test target, never in application capture/playback.
        let file = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(audio ? "mws-synthetic-memory-video-aac.mp4" : "mws-synthetic-memory-video.mp4"); try flat.write(to: file)
    }
    private func audioSample(index: Int) throws -> CMSampleBuffer {
        var description: CMAudioFormatDescription?
        var asbd = AudioStreamBasicDescription(mSampleRate: 44100, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked, mBytesPerPacket: 2, mFramesPerPacket: 1, mBytesPerFrame: 2, mChannelsPerFrame: 1, mBitsPerChannel: 16, mReserved: 0)
        XCTAssertEqual(CMAudioFormatDescriptionCreate(allocator: kCFAllocatorDefault, asbd: &asbd, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &description), noErr)
        var block: CMBlockBuffer?
        XCTAssertEqual(CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: 2048, blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0, dataLength: 2048, flags: 0, blockBufferOut: &block), noErr)
        let data = try XCTUnwrap(block); XCTAssertEqual(CMBlockBufferFillDataBytes(with: 0, blockBuffer: data, offsetIntoDestination: 0, dataLength: 2048), noErr)
        var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 44100), presentationTimeStamp: CMTime(value: Int64(index*1024), timescale: 44100), decodeTimeStamp: .invalid), size = 2
        var sample: CMSampleBuffer?
        XCTAssertEqual(CMSampleBufferCreateReady(allocator: kCFAllocatorDefault, dataBuffer: data, formatDescription: try XCTUnwrap(description), sampleCount: 1024, sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleSizeEntryCount: 1, sampleSizeArray: &size, sampleBufferOut: &sample), noErr)
        return try XCTUnwrap(sample)
    }
}
