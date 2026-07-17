import Foundation
import Capacitor
import UIKit
import UniformTypeIdentifiers

/**
 * Save / share generated media on iOS via the system share sheet
 * (Save Image / Save to Files / AirDrop / etc.).
 */
@objc(MediaFilesPlugin)
public class MediaFilesPlugin: CAPPlugin, UIDocumentPickerDelegate {
    private var pendingCall: CAPPluginCall?

    @objc func save(_ call: CAPPluginCall) {
        // On iOS, "save" uses the share sheet so the user can Save Image / Save to Files.
        share(call)
    }

    @objc func share(_ call: CAPPluginCall) {
        guard let data = call.getString("data"), !data.isEmpty else {
            call.reject("Missing file data")
            return
        }
        let filename = call.getString("filename") ?? "share.bin"
        let mimeType = call.getString("mimeType") ?? "application/octet-stream"

        DispatchQueue.main.async {
            do {
                let raw = Self.stripDataUrl(data)
                guard let bytes = Data(base64Encoded: raw) else {
                    call.reject("Invalid base64 data")
                    return
                }

                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
                try bytes.write(to: tempURL, options: .atomic)

                guard let presenter = self.bridge?.viewController else {
                    call.reject("No view controller")
                    return
                }

                let activity = UIActivityViewController(activityItems: [tempURL], applicationActivities: nil)
                if let pop = activity.popoverPresentationController {
                    pop.sourceView = presenter.view
                    pop.sourceRect = CGRect(
                        x: presenter.view.bounds.midX,
                        y: presenter.view.bounds.midY,
                        width: 0,
                        height: 0
                    )
                    pop.permittedArrowDirections = []
                }

                activity.completionWithItemsHandler = { _, completed, _, error in
                    if let error = error {
                        call.reject(error.localizedDescription)
                        return
                    }
                    if !completed {
                        call.reject("cancelled", "USER_CANCELLED", nil)
                        return
                    }
                    call.resolve(["shared": true])
                }

                presenter.present(activity, animated: true)
            } catch {
                call.reject("Share failed: \(error.localizedDescription)")
            }
        }
    }

    private static func stripDataUrl(_ data: String) -> String {
        if data.hasPrefix("data:"), let comma = data.firstIndex(of: ",") {
            return String(data[data.index(after: comma)...])
        }
        return data
    }
}
