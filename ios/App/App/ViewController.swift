import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(IAPPlugin())
        bridge?.registerPluginInstance(OAuthSessionPlugin())
    }
}
