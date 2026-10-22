import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import ImageIO
import MWSChatCore
struct MediaPicker: UIViewControllerRepresentable {
    let video: Bool
    let lease: MediaLease
    let done: ([DraftMedia], String?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var c = PHPickerConfiguration(); c.filter = video ? .videos : .images; c.selectionLimit = video ? 1 : 5; c.preferredAssetRepresentationMode = .current
        let picker = PHPickerViewController(configuration: c); picker.delegate = context.coordinator; return picker
    }
    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}
    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: MediaPicker
        init(_ parent: MediaPicker) { self.parent = parent }
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            guard !results.isEmpty else { parent.done([], nil); return }
            let parent = parent
            Task {
                do {
                    var media: [DraftMedia] = []
                    for result in results {
                        guard !parent.lease.isCancelled else { throw CancellationError() }
                        let type = parent.video ? UTType.mpeg4Movie.identifier : UTType.image.identifier
                        guard result.itemProvider.hasItemConformingToTypeIdentifier(type) else { throw ChatError.invalid }
                        // The system picker owns this transient representation; never persist its URL or write a copy.
                        let bytes: Data = try await withCheckedThrowingContinuation { continuation in
                            let gate = MediaReadGate(continuation); parent.lease.onCancel { gate.finish(.failure(CancellationError())) }
                            let progress = result.itemProvider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
                                guard !parent.lease.isCancelled else { gate.finish(.failure(CancellationError())); return }
                                guard let url, url.isFileURL, error == nil else { gate.finish(.failure(ChatError.invalid)); return }
                                do { let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }; let maximum = parent.video ? MediaPolicy.videoMax : MediaPolicy.imageMax; let data = try handle.read(upToCount: maximum + 1) ?? Data(); guard !parent.lease.isCancelled else { throw CancellationError() }; guard !data.isEmpty, data.count <= maximum else { throw ChatError.tooLarge }; gate.finish(.success(data)) } catch { gate.finish(.failure(error)) }
                            }
                            parent.lease.attach(progress)
                        }
                        if parent.video {
                            guard MP4.selfContained(bytes) else { throw ChatError.invalid }
                            let resource = MemoryAsset(bytes, mime: "video/mp4")
                            let seconds = try await resource.asset.load(.duration).seconds
                            guard seconds.isFinite, seconds > 0, seconds <= 30 else { throw ChatError.invalid }
                            media.append(DraftMedia(bytes: bytes, mime: "video/mp4", name: "video.mp4"))
                        } else { media.append(try Self.photo(bytes)) }
                    }
                    if !parent.video && !MediaPolicy.photoBatch(media.map(\.bytes)) { throw ChatError.tooLarge }
                    await MainActor.run { if !parent.lease.isCancelled { parent.done(media, nil) } }
                } catch { await MainActor.run { if !parent.lease.isCancelled { parent.done([], parent.video ? "Επίλεξε MP4 H264/AAC έως30δευτ./12MB. Δεν μετατρέπεται ή αποθηκεύεται νέο αρχείο." : "Επίλεξε έως5 φωτογραφίες, έως7MB καθεμία και14MB συνολικά.") } } }
            }
        }
        static func photo(_ data: Data) throws -> DraftMedia {
            guard data.count <= MediaPolicy.imageMax, let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary), let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any], let w = props[kCGImagePropertyPixelWidth] as? Int, let h = props[kCGImagePropertyPixelHeight] as? Int, w > 0, h > 0, w <= 12000, h <= 12000, w * h <= 24_000_000 else { throw ChatError.invalid }
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 2400, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceShouldCacheImmediately: true] as CFDictionary), let bytes = UIImage(cgImage: image).jpegData(compressionQuality: 0.82), !bytes.isEmpty, bytes.count <= MediaPolicy.imageMax else { throw ChatError.invalid }
            return DraftMedia(bytes: bytes, mime: "image/jpeg", name: "photo.jpg")
        }
    }
}
