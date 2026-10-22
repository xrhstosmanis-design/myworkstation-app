import SwiftUI
import AVFoundation
import UniformTypeIdentifiers
import MWSChatCore
final class CameraPipeline: NSObject, AVCapturePhotoCaptureDelegate, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate, AVAssetWriterDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "mws.capture.memory")
    private let output = AVCapturePhotoOutput()
    private let video = AVCaptureVideoDataOutput(), audio = AVCaptureAudioDataOutput()
    private var writer: AVAssetWriter?, videoInput: AVAssetWriterInput?, audioInput: AVAssetWriterInput?
    private var recording = false, started = false, cancelled = false
    private let lock = NSLock()
    private var segments = Data(), overflow = false
    var result: ((DraftMedia?, String?) -> Void)?
    func configure(video mode: Bool) {
        queue.async {
            do {
                self.session.beginConfiguration(); self.session.sessionPreset = .vga640x480
                guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { throw ChatError.unavailable }
                let input = try AVCaptureDeviceInput(device: camera); guard self.session.canAddInput(input) else { throw ChatError.unavailable }; self.session.addInput(input)
                if mode {
                    guard let mic = AVCaptureDevice.default(for: .audio) else { throw ChatError.unavailable }; let a = try AVCaptureDeviceInput(device: mic); guard self.session.canAddInput(a), self.session.canAddOutput(self.video), self.session.canAddOutput(self.audio) else { throw ChatError.unavailable }
                    self.session.addInput(a); self.session.addOutput(self.video); self.session.addOutput(self.audio)
                    self.video.alwaysDiscardsLateVideoFrames = true; self.video.setSampleBufferDelegate(self, queue: self.queue); self.audio.setSampleBufferDelegate(self, queue: self.queue)
                    if let c = self.video.connection(with: .video), c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
                } else { guard self.session.canAddOutput(self.output) else { throw ChatError.unavailable }; self.session.addOutput(self.output) }
                self.session.commitConfiguration(); self.session.startRunning()
            } catch { self.session.commitConfiguration(); self.deliver(nil, "Δεν άνοιξε η κάμερα/το μικρόφωνο.") }
        }
    }
    private func deliver(_ media: DraftMedia?, _ error: String?) { DispatchQueue.main.async { self.result?(media, error) } }
    func photo() { queue.async { guard !self.cancelled else { return }; self.output.capturePhoto(with: AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg]), delegate: self) } }
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard !cancelled, error == nil, let data = photo.fileDataRepresentation() else { deliver(nil, "Δεν ολοκληρώθηκε η λήψη."); return }
        do { deliver(try MediaPicker.Coordinator.photo(data), nil) } catch { deliver(nil, "Η φωτογραφία δεν είναι εντός ορίων.") }
    }
    func beginVideo() { queue.async { guard !self.cancelled, !self.recording else { return }; self.recording = true } }
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard recording, !cancelled, CMSampleBufferDataIsReady(sampleBuffer) else { return }
        do {
            if writer == nil {
                guard output === video, let pixel = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
                let w = try AVAssetWriter(contentType: .mpeg4Movie); w.outputFileTypeProfile = .mpeg4AppleHLS; w.preferredOutputSegmentInterval = CMTime(seconds: 1, preferredTimescale: 600); w.initialSegmentStartTime = .zero; w.delegate = self
                let v = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: CVPixelBufferGetWidth(pixel), AVVideoHeightKey: CVPixelBufferGetHeight(pixel), AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 600000, AVVideoMaxKeyFrameIntervalKey: 30, AVVideoAllowFrameReorderingKey: false]])
                let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64000])
                v.expectsMediaDataInRealTime = true; a.expectsMediaDataInRealTime = true
                guard w.canAdd(v), w.canAdd(a) else { throw ChatError.invalid }; w.add(v); w.add(a); writer = w; videoInput = v; audioInput = a
                guard w.startWriting() else { throw ChatError.invalid }; w.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer)); started = true
            }
            guard let input = output === video ? videoInput : audioInput, input.isReadyForMoreMediaData, input.append(sampleBuffer) else { throw ChatError.unavailable }
            lock.lock(); let failed = overflow; lock.unlock(); if failed { throw ChatError.tooLarge }
        } catch { recording = false; writer?.cancelWriting(); writer = nil; deliver(nil, "Δεν ολοκληρώθηκε η λήψη βίντεο. Το πρόχειρο καθαρίστηκε.") }
    }
    func assetWriter(_ writer: AVAssetWriter, didOutputSegmentData segmentData: Data, segmentType: AVAssetSegmentType) {
        lock.lock(); defer { lock.unlock() }
        guard !overflow, segments.count + segmentData.count <= MediaPolicy.videoMax else { overflow = true; segments.removeAll(); return }; segments.append(segmentData)
    }
    func finishVideo() {
        queue.async {
            self.recording = false
            guard self.started, let writer = self.writer, writer.status == .writing else { self.deliver(nil, "Δεν υπάρχει ολοκληρωμένο βίντεο."); return }
            self.videoInput?.markAsFinished(); self.audioInput?.markAsFinished()
            writer.finishWriting {
                self.queue.async {
                    guard !self.cancelled else { return }
                    self.lock.lock(); let data = self.segments, failed = self.overflow; self.segments.removeAll(); self.lock.unlock()
                    do { guard writer.status == .completed, !failed else { throw ChatError.invalid }; let flat = try MP4.flatten(data); self.deliver(DraftMedia(bytes: flat, mime: "video/mp4", name: "video.mp4"), nil) } catch { self.deliver(nil, "Δεν δημιουργήθηκε συμβατό MP4 στη μνήμη.") }
                    self.writer = nil; self.videoInput = nil; self.audioInput = nil
                }
            }
        }
    }
    func stop() { queue.async { self.cancelled = true; self.recording = false; self.writer?.cancelWriting(); self.writer = nil; self.videoInput = nil; self.audioInput = nil; self.session.stopRunning(); self.lock.lock(); self.segments.removeAll(); self.lock.unlock() } }
}
final class AudioPCMStore: @unchecked Sendable {
    private let lock = NSLock()
    private var bytes = Data(), overflow = false
    func reset() { lock.lock(); bytes.removeAll(); overflow = false; lock.unlock() }
    func append(_ value: Data) { lock.lock(); defer { lock.unlock() }; if bytes.count + value.count <= MediaPolicy.voiceMax - 44 { bytes.append(value) } else { overflow = true } }
    func take() -> (Data, Bool) { lock.lock(); defer { lock.unlock() }; let result = (bytes, overflow); bytes.removeAll(); return result }
}
@MainActor final class CaptureState: ObservableObject {
    @Published var draft: DraftMedia?, error = "", recording = false, seconds = 0
    let camera = CameraPipeline()
    private var engine: AVAudioEngine?, converter: AVAudioConverter?, timer: Timer?
    private let pcm = AudioPCMStore()
    func prepare(_ mode: String) async {
        let microphone = mode == "voice" || mode == "video"
        if mode != "voice", !(await AVCaptureDevice.requestAccess(for: .video)) { error = "Χρειάζεται άδεια κάμερας από τις Ρυθμίσεις."; return }
        if microphone, !(await AVCaptureDevice.requestAccess(for: .audio)) { error = "Χρειάζεται άδεια μικροφώνου από τις Ρυθμίσεις."; return }
        camera.result = { [weak self] media, error in Task { @MainActor in guard let self else { return }; self.recording = false; self.timer?.invalidate(); self.draft = media; self.error = error ?? "" } }
        if mode != "voice" { camera.configure(video: mode == "video") }
    }
    func start(_ mode: String) {
        guard !recording, error.isEmpty else { return }; draft = nil; seconds = 0
        if mode == "voice" {
            do {
                try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker]); try AVAudioSession.sharedInstance().setActive(true)
                let e = AVAudioEngine(), input = e.inputNode, format = input.outputFormat(forBus: 0)
                guard let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: false), let converter = AVAudioConverter(from: format, to: target) else { throw ChatError.invalid }
                self.engine = e; self.converter = converter; pcm.reset(); let store = pcm
                input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, _ in
                    let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * 16000 / format.sampleRate) + 32)
                    guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }; var used = false; var error: NSError?
                    let status = converter.convert(to: output, error: &error) { _, state in if used { state.pointee = .noDataNow; return nil }; used = true; state.pointee = .haveData; return buffer }
                    guard error == nil, status != .error, let samples = output.int16ChannelData else { return }
                    let bytes = Data(bytes: samples[0], count: Int(output.frameLength)*2)
                    store.append(bytes)
                }
                e.prepare(); try e.start()
            } catch { self.error = "Δεν ξεκίνησε η εγγραφή φωνητικού."; cleanup(); return }
        } else { camera.beginVideo() }
        recording = true
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in Task { @MainActor in guard let self else { return }; self.seconds += 1; if self.seconds >= (mode == "voice" ? 59 : 29) { self.finish(mode) } } }
    }
    func takePhoto() { guard !recording, error.isEmpty else { return }; recording = true; camera.photo() }
    func finish(_ mode: String) {
        guard recording else { return }; recording = false; timer?.invalidate(); timer = nil
        if mode == "voice" {
            engine?.inputNode.removeTap(onBus: 0); engine?.stop(); engine = nil; converter = nil
            let (data, failed) = pcm.take()
            do { guard !failed else { throw ChatError.tooLarge }; draft = DraftMedia(bytes: try MediaPolicy.wav(data), mime: "audio/wav", name: "voice.wav") } catch { self.error = "Δεν ολοκληρώθηκε το φωνητικό εντός ορίων." }
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } else { camera.finishVideo() }
    }
    func cleanup() { timer?.invalidate(); timer = nil; if let engine { engine.inputNode.removeTap(onBus: 0); engine.stop() }; engine = nil; converter = nil; camera.stop(); draft = nil; recording = false; pcm.reset(); try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
}
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    final class Preview: UIView { override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self } }
    func makeUIView(context: Context) -> Preview { let view = Preview(); let layer = view.layer as! AVCaptureVideoPreviewLayer; layer.session = session; layer.videoGravity = .resizeAspectFill; return view }
    func updateUIView(_ uiView: Preview, context: Context) {}
}
struct CaptureView: View {
    let mode: String
    let done: (DraftMedia?, String?) -> Void
    @StateObject private var state = CaptureState()
    @StateObject private var playback = Playback()
    var body: some View {
        NavigationStack { VStack(spacing: 20) {
            if let draft = state.draft { if draft.mime.hasPrefix("image/"), let image = UIImage(data: draft.bytes) { Image(uiImage: image).resizable().scaledToFit() } else if let player = playback.player { VideoPlayer(player: player) } else { Image(systemName: "waveform").font(.system(size: 60)) }; if !draft.mime.hasPrefix("image/") { Button("▶ Προεπισκόπηση") { playback.play() }; Button("Διακοπή αναπαραγωγής") { playback.pause() } }; Button("Χρήση · προσθήκη στο πρόχειρο") { playback.stop(); done(draft, nil) }.buttonStyle(.borderedProminent) }
            else { if mode != "voice" { CameraPreview(session: state.camera.session).clipShape(RoundedRectangle(cornerRadius: 20)) } else { Image(systemName: "mic.fill").font(.system(size: 70)).frame(maxHeight: .infinity) }; Text("\(state.seconds) δευτερόλεπτα"); if mode == "photo" { Button("Λήψη φωτογραφίας") { state.takePhoto() }.buttonStyle(.borderedProminent).disabled(state.recording) } else { Button(state.recording ? "Διακοπή εγγραφής" : "Έναρξη εγγραφής") { if state.recording { state.finish(mode) } else { state.start(mode) } }.buttonStyle(.borderedProminent) } }
            if !state.error.isEmpty { Text(state.error).foregroundStyle(.red) }
            Text("Προσωρινή λήψη στη μνήμη. Δεν αποστέλλεται αυτόματα.").font(.footnote)
        }.padding().navigationTitle(mode == "photo" ? "Κάμερα" : mode == "voice" ? "Φωνητικό" : "Βίντεο έως30δ.").toolbar { Button("Ακύρωση") { playback.stop(); state.cleanup(); done(nil, nil) } } }
        .task { await state.prepare(mode) }
        .onChange(of: state.draft?.id) { _, _ in if let draft = state.draft { playback.prepare(draft) } }
        .onDisappear { playback.stop(); state.cleanup() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in playback.stop(); state.cleanup(); done(nil, nil) }
    }
}
