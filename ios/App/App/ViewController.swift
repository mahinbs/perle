import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Programmatically register the custom local IAP plugin
        bridge?.registerPluginInstance(IAPPlugin())
    }
}
