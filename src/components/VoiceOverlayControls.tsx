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
    } catch { }
    onClose();
  };

  const handleToggleListening = () => {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch { }
    onToggleListening();
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        maxWidth: "100%", // Reasonable max width for controls
        paddingBottom: isMac ? "6rem" : "2rem",
        paddingLeft: "2rem",
        paddingRight: "2rem",
        boxSizing: "border-box",
      }}
    >
      <button
        className="btn-ghost"
        onClick={handleClose}
        aria-label="Cancel"
        style={{
          width: "clamp(48px, 15vmin, 72px)",
          height: "clamp(48px, 15vmin, 72px)",
          borderRadius: 9999,
          color: "var(--text)",
          borderColor: "var(--border)",
          fontSize: "var(--font-md)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ✕
      </button>
      <button
        className={isListening ? "btn" : "btn-ghost"}
        onClick={handleToggleListening}
        aria-label={isListening ? "Stop listening" : "Start voice"}
        style={{
          width: "clamp(60px, 18vmin, 84px)",
          height: "clamp(60px, 18vmin, 84px)",
          borderRadius: 9999,
          color: isListening ? "#111" : "var(--text)",
          borderColor: isListening ? undefined : "var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MicWaveIcon size={26} active={isListening} />
      </button>
    </div>
  );
};

export default React.memo(VoiceOverlayControls);


