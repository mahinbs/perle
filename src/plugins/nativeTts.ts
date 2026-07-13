import { registerPlugin } from "@capacitor/core";

export type NativeTtsSpeakOptions = {
  text: string;
  rate?: number;
  volume?: number;
};

export interface NativeTtsPlugin {
  warmUp(): Promise<void>;
  speak(options: NativeTtsSpeakOptions): Promise<void>;
  stop(): Promise<void>;
  isSpeaking(): Promise<{ speaking: boolean }>;
}

export const NativeTts = registerPlugin<NativeTtsPlugin>("NativeTts");
