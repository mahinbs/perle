import { Capacitor } from "@capacitor/core";

/**
 * App Store Guideline 1.4.1: without regulatory medical clearance, iOS must not
 * ship dedicated wellness / sleep / mental-health companion features that can be
 * interpreted as medical advice, diagnosis, or treatment.
 *
 * Android / web may keep these features with disclaimers.
 */
export function supportsWellnessCompanionFeatures(): boolean {
  if (!Capacitor.isNativePlatform()) return true;
  return Capacitor.getPlatform() !== "ios";
}

export function supportsSleepHealthFeatures(): boolean {
  return supportsWellnessCompanionFeatures();
}
