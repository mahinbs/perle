import { describe, expect, it } from "vitest";
import {
  buildVoiceSpeechPlan,
  splitVoiceContentSegments,
} from "../voiceSpeechPlan";

describe("voiceSpeechPlan", () => {
  it("skips markdown tables in speech text", () => {
    const raw = [
      "Here is the intro.",
      "",
      "| Feature | Value |",
      "| --- | --- |",
      "| Speed | Fast |",
      "",
      "And here is the conclusion.",
    ].join("\n");

    const plan = buildVoiceSpeechPlan(raw);
    expect(plan.speechText).toContain("Here is the intro.");
    expect(plan.speechText).toContain("And here is the conclusion.");
    expect(plan.speechText).not.toContain("Feature");
    expect(plan.speechText).not.toContain("Speed");
  });

  it("reveals tables on screen once speech passes them", () => {
    const raw = [
      "Intro paragraph.",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "Outro paragraph.",
    ].join("\n");

    const plan = buildVoiceSpeechPlan(raw);
    const introTiming = plan.timings.find(
      (t) => plan.segments[t.segmentIndex].kind === "prose"
    );
    const introEnd = introTiming?.speechEnd ?? 0;
    const midIntro = Math.max(1, Math.floor(introEnd / 2));

    expect(plan.displayAtSpeechOffset(0)).toBe("");
    expect(plan.displayAtSpeechOffset(midIntro)).toContain("Intro");
    expect(plan.displayAtSpeechOffset(midIntro)).not.toContain("Outro");
    expect(plan.displayAtSpeechOffset(introEnd)).toContain("| A | B |");
    expect(plan.displayAtSpeechOffset(plan.speechText.length)).toBe(
      plan.fullDisplayText
    );
  });

  it("reveals prose word-by-word instead of all at once", () => {
    const plan = buildVoiceSpeechPlan(
      "First sentence here. Second sentence follows."
    );
    const timing = plan.timings[0];
    const seg = plan.segments[0];
    if (seg.kind !== "prose") throw new Error("expected prose");

    const partial = plan.displayAtSpeechOffset(
      timing.speechStart + Math.max(1, Math.floor(seg.speech.length / 3))
    );
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(seg.raw.length);
  });

  it("keeps updating display after a table while speech continues", () => {
    const raw = [
      "Intro paragraph.",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "Outro paragraph with more words here.",
    ].join("\n");

    const plan = buildVoiceSpeechPlan(raw);
    const proseTimings = plan.timings.filter(
      (t) => plan.segments[t.segmentIndex].kind === "prose"
    );
    const outroTiming = proseTimings[proseTimings.length - 1];
    const outroSeg = plan.segments[outroTiming.segmentIndex];
    if (outroSeg.kind !== "prose") throw new Error("expected prose");

    const afterTableOffset = outroTiming.speechStart + 5;
    const midOutroOffset =
      outroTiming.speechStart + Math.floor(outroSeg.speech.length / 2);
    const endOffset = plan.speechText.length;

    const afterTable = plan.displayAtSpeechOffset(afterTableOffset);
    expect(afterTable).toContain("| A | B |");
    expect(afterTable).toContain("Outro");

    const midOutro = plan.displayAtSpeechOffset(midOutroOffset);
    expect(midOutro).toContain("Outro");
    expect(midOutro.length).toBeGreaterThan(afterTable.length);

    expect(plan.displayAtSpeechOffset(endOffset)).toBe(plan.fullDisplayText);
  });

  it("splits prose-only answers unchanged", () => {
    const segments = splitVoiceContentSegments("Just a normal answer.");
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("prose");
  });
});
