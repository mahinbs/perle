import Foundation
import Capacitor
import AVFoundation

/**
 * Native iOS TTS (AVSpeechSynthesizer) for Capacitor WebViews where
 * window.speechSynthesis is unreliable.
 */
@objc(NativeTtsPlugin)
public class NativeTtsPlugin: CAPPlugin, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var pendingSpeakCall: CAPPluginCall?
    private var audioSessionConfigured = false

    public override func load() {
        synthesizer.delegate = self
    }

    private func configureAudioSessionIfNeeded() {
        do {
            let session = AVAudioSession.sharedInstance()
            // playAndRecord keeps mic + TTS working in the same voice session.
            try session.setCategory(
                .playAndRecord,
                mode: .spokenAudio,
                options: [.defaultToSpeaker, .allowBluetooth, .duckOthers]
            )
            try session.setActive(true, options: [])
            audioSessionConfigured = true
        } catch {
            // Best-effort fallback.
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                try session.setActive(true, options: [])
                audioSessionConfigured = true
            } catch {
                // Ignore — speak may still work with the default session.
            }
        }
    }

    @objc func warmUp(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.configureAudioSessionIfNeeded()
            call.resolve()
        }
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            call.resolve()
            return
        }

        let rate = call.getFloat("rate") ?? 1.0
        let volume = call.getFloat("volume") ?? 1.0
        call.keepAlive = true

        DispatchQueue.main.async {
            self.configureAudioSessionIfNeeded()

            if let previous = self.pendingSpeakCall {
                self.pendingSpeakCall = nil
                previous.resolve()
            }
            if self.synthesizer.isSpeaking {
                self.synthesizer.stopSpeaking(at: .immediate)
            }

            let utterance = AVSpeechUtterance(string: text)
            // Map web SpeechSynthesis rate (~1.0) onto AVSpeech default rate.
            let clamped = max(0.5, min(rate, 1.4))
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * clamped
            utterance.volume = max(0.0, min(volume, 1.0))
            utterance.pitchMultiplier = 1.0
            utterance.preUtteranceDelay = 0.05
            utterance.postUtteranceDelay = 0.05

            // Prefer an English voice when available for consistent output.
            if let voice = AVSpeechSynthesisVoice(language: Locale.current.identifier)
                ?? AVSpeechSynthesisVoice(language: "en-US") {
                utterance.voice = voice
            }

            self.pendingSpeakCall = call
            self.synthesizer.speak(utterance)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.synthesizer.isSpeaking {
                self.synthesizer.stopSpeaking(at: .immediate)
            }
            if let speakCall = self.pendingSpeakCall {
                self.pendingSpeakCall = nil
                speakCall.resolve()
            }
            call.resolve()
        }
    }

    @objc func isSpeaking(_ call: CAPPluginCall) {
        call.resolve([
            "speaking": synthesizer.isSpeaking
        ])
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            if let speakCall = self.pendingSpeakCall {
                self.pendingSpeakCall = nil
                speakCall.resolve()
            }
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            if let speakCall = self.pendingSpeakCall {
                self.pendingSpeakCall = nil
                speakCall.resolve()
            }
        }
    }
}
