import Foundation
import MWSChatCore
// Immutable selection scope plus cancellable OS-provider reads. Never keeps a provider URL.
final class MediaLease: @unchecked Sendable {
    let epoch: UInt64
    let scope: Scope?
    private let lock = NSLock()
    private var cancelled = false
    private var progresses: [Progress] = []
    private var cancellations: [() -> Void] = []
    init(epoch: UInt64, scope: Scope?) { self.epoch = epoch; self.scope = scope }
    var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
    func attach(_ progress: Progress) { lock.lock(); let stopped = cancelled; if !stopped { progresses.append(progress) }; lock.unlock(); if stopped { progress.cancel() } }
    func onCancel(_ action: @escaping () -> Void) { lock.lock(); let stopped = cancelled; if !stopped { cancellations.append(action) }; lock.unlock(); if stopped { action() } }
    func cancel() { lock.lock(); guard !cancelled else { lock.unlock(); return }; cancelled = true; let running = progresses, actions = cancellations; progresses.removeAll(); cancellations.removeAll(); lock.unlock(); running.forEach { $0.cancel() }; actions.forEach { $0() } }
}
final class MediaReadGate: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Data, Error>?
    init(_ continuation: CheckedContinuation<Data, Error>) { self.continuation = continuation }
    func finish(_ result: Result<Data, Error>) { lock.lock(); let continuation = self.continuation; self.continuation = nil; lock.unlock(); continuation?.resume(with: result) }
}
