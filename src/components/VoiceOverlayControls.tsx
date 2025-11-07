import React from "react";
import MicWaveIcon from "./MicWaveIcon";

interface VoiceOverlayControlsProps {
  isListening: boolean;
  onClose: () => void;
  onToggleListening: () => void;
  isMac: boolean;
}

const VoiceOverlayControls: React.FC<VoiceOverlayControlsProps> = ({
  isListening,
  onClose,
  onToggleListening,
  isMac,
}) => {
  const handleClose = () => {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    onClose();
  };

  const handleToggleListening = () => {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    onToggleListening();
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: isMac ? "6rem" : undefined,
      }}
    >
      <button
        className="btn-ghost"
        onClick={handleClose}
        aria-label="Cancel"
        style={{
          width: 72,
          height: 72,
          borderRadius: 9999,
          color: "var(--text)",
          borderColor: "var(--border)",
          fontSize: "var(--font-md)",
        }}
      >
        ✕
      </button>
      <button
        className={isListening ? "btn" : "btn-ghost"}
        onClick={handleToggleListening}
        aria-label={isListening ? "Stop listening" : "Start voice"}
        style={{
          width: 84,
          height: 84,
          borderRadius: 9999,
          color: isListening ? "#111" : "var(--text)",
          borderColor: isListening ? undefined : "var(--border)",
        }}
      >
        <MicWaveIcon size={26} active={isListening} />
      </button>
    </div>
  );
};

export default React.memo(VoiceOverlayControls);


