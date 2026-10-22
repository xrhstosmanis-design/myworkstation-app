import AVFoundation
import Combine
import UniformTypeIdentifiers
import MWSChatCore
// AVFoundation reads an in-memory custom resource. No file URL, export or cache.
final class MemoryAsset: NSObject, AVAssetResourceLoaderDelegate {
    let data: Data, mime: String
    let asset: AVURLAsset
    private let queue = DispatchQueue(label: "mws.memory.playback")
    init(_ data: Data, mime: String) {
        self.data = mime == "video/mp4" && !MP4.selfContained(data) ? Data() : data; self.mime = mime
        asset = AVURLAsset(url: URL(string: "mws-memory://media/" + UUID().uuidString + ".mp4")!, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
        super.init(); asset.resourceLoader.setDelegate(self, queue: queue)
    }
    func resourceLoader(_ resourceLoader: AVAssetResourceLoader, shouldWaitForLoadingOfRequestedResource request: AVAssetResourceLoadingRequest) -> Bool {
        if let info = request.contentInformationRequest { info.contentType = (mime == "video/mp4" ? UTType.mpeg4Movie : UTType.wav).identifier; info.contentLength = Int64(data.count); info.isByteRangeAccessSupported = true }
        if let r = request.dataRequest {
            let start = r.currentOffset == 0 ? r.requestedOffset : r.currentOffset
            guard start >= 0, start <= data.count else { request.finishLoading(with: ChatError.invalid); return true }
            let begin = Int(start), count = r.requestsAllDataToEndOfResource ? data.count - begin : min(r.requestedLength, data.count - begin)
            if count > 0 { r.respond(with: data.subdata(in: begin..<(begin+count))) }
        }
        request.finishLoading(); return true
    }
}
@MainActor final class Playback: ObservableObject {
    @Published var player: AVPlayer?
    private var resource: MemoryAsset?, audio: AVAudioPlayer?
    func prepare(_ media: DraftMedia) {
        stop()
        if media.mime == "audio/wav" { do { audio = try AVAudioPlayer(data: media.bytes); audio?.prepareToPlay() } catch {} }
        if media.mime == "video/mp4" { let r = MemoryAsset(media.bytes, mime: media.mime); resource = r; let p = AVPlayer(playerItem: AVPlayerItem(asset: r.asset)); p.allowsExternalPlayback = false; player = p }
    }
    func play() { audio?.currentTime = 0; audio?.play(); player?.seek(to: .zero); player?.play() }
    func pause() { audio?.stop(); player?.pause() }
    func stop() { pause(); player?.replaceCurrentItem(with: nil); player = nil; resource = nil; audio = nil }
}
