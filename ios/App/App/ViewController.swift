import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(IAPPlugin())
        bridge?.registerPluginInstance(OAuthSessionPlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(NativeTtsPlugin())
        bridge?.registerPluginInstance(MediaFilesPlugin())
    }
}
