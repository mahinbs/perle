import Foundation
import Capacitor
import AuthenticationServices
import CryptoKit

@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var currentCall: CAPPluginCall?
    private var currentNonce: String?

    @objc func signIn(_ call: CAPPluginCall) {
        currentCall = call
        let nonce = randomNonceString(length: 32)
        currentNonce = nonce

        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)

        let authorizationController = ASAuthorizationController(authorizationRequests: [request])
        authorizationController.delegate = self
        authorizationController.presentationContextProvider = self

        DispatchQueue.main.async {
            authorizationController.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }

        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let call = currentCall else { return }

        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("Invalid Apple credential")
            resetState()
            return
        }

        guard let identityTokenData = appleIDCredential.identityToken,
              let identityToken = String(data: identityTokenData, encoding: .utf8) else {
            call.reject("Unable to fetch Apple identity token")
            resetState()
            return
        }

        guard let nonce = currentNonce else {
            call.reject("Missing nonce")
            resetState()
            return
        }

        var fullName: [String: String] = [:]
        if let name = appleIDCredential.fullName {
            if let given = name.givenName { fullName["givenName"] = given }
            if let family = name.familyName { fullName["familyName"] = family }
        }

        call.resolve([
            "identityToken": identityToken,
            "nonce": nonce,
            "email": appleIDCredential.email ?? "",
            "fullName": fullName,
            "cancelled": false,
        ])
        resetState()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = currentCall else { return }

        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.resolve(["cancelled": true])
        } else {
            call.reject(error.localizedDescription)
        }
        resetState()
    }

    private func resetState() {
        currentCall = nil
        currentNonce = nil
    }

    private func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        var randomBytes = [UInt8](repeating: 0, count: length)
        let errorCode = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        if errorCode != errSecSuccess {
            fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
        }

        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        let nonce = randomBytes.map { byte in
            charset[Int(byte) % charset.count]
        }
        return String(nonce)
    }

    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        return hashedData.compactMap { String(format: "%02x", $0) }.joined()
    }
}
