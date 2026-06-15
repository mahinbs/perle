import React from "react";

interface ChatDateDividerProps {
  label: string;
}

export const ChatDateDivider: React.FC<ChatDateDividerProps> = ({ label }) => (
  <div className="flex justify-center my-4">
    <span
      className="px-3 py-1 rounded-lg text-xs font-medium"
      style={{
        background: "var(--input-bg)",
        color: "var(--sub)",
        border: "1px solid var(--border)",
      }}
    >
      {label}
    </span>
  </div>
);
