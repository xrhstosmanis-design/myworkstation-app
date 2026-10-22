import SwiftUI
// Public UIKit controls with no copy/cut/share menu or undo history for private drafts.
struct PrivateComposer: UIViewRepresentable {
    @Binding var text: String
    let placeholder: String
    let maximum: Int
    final class Field: UITextView {
        override var undoManager: UndoManager? { nil }
        override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
            if action == #selector(paste(_:)) { return super.canPerformAction(action, withSender: sender) }
            return false
        }
    }
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: PrivateComposer
        init(_ parent: PrivateComposer) { self.parent = parent }
        func textViewDidChange(_ textView: UITextView) { parent.text = textView.text }
        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool { guard let r = Range(range, in: textView.text ?? "") else { return false }; return textView.text.replacingCharacters(in: r, with: text).utf16.count <= parent.maximum }
    }
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> Field {
        let view = Field(); view.delegate = context.coordinator; view.font = .preferredFont(forTextStyle: .body); view.adjustsFontForContentSizeCategory = true; view.backgroundColor = .clear; view.autocorrectionType = .no; view.spellCheckingType = .no; view.smartDashesType = .no; view.smartQuotesType = .no; view.textContentType = nil; view.textDragInteraction?.isEnabled = false; view.autocapitalizationType = .sentences; view.textContainerInset = UIEdgeInsets(top: 10, left: 8, bottom: 10, right: 8); view.accessibilityIdentifier = "composer"; view.accessibilityLabel = placeholder; view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal); return view
    }
    func updateUIView(_ uiView: Field, context: Context) { context.coordinator.parent = self; if uiView.text != text { uiView.text = text }; uiView.accessibilityLabel = placeholder; if !context.environment.isEnabled { uiView.resignFirstResponder() }; uiView.isEditable = context.environment.isEnabled }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: Field, context: Context) -> CGSize? { let width = proposal.width ?? 200, height = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height, cap = (uiView.font?.lineHeight ?? 22) * 4 + 20; return CGSize(width: width, height: max(48, min(cap, height))) }
}
