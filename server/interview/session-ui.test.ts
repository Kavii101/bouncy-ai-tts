import { describe, expect, it } from "vitest";
import { flagPhrases } from "@shared/interview/flagged";
import { buildSessionNotes, sessionStage } from "@shared/interview/sessionStage";

const idle = { micOn: false, tabOn: false, hearing: false, pendingQuestion: false, writing: false, hasAnswer: false };

describe("sessionStage", () => {
  it("never says listening without the interviewer's audio", () => {
    expect(sessionStage(idle).stage).toBe("not_connected");
    expect(sessionStage({ ...idle, micOn: true })).toMatchObject({ stage: "mic_only", tone: "warn" });
    expect(sessionStage({ ...idle, micOn: true, hearing: true }).stage).toBe("mic_only");
  });

  it("walks through a question in order", () => {
    const on = { ...idle, micOn: true, tabOn: true };
    expect(sessionStage(on).stage).toBe("listening");
    expect(sessionStage({ ...on, hearing: true }).stage).toBe("hearing");
    expect(sessionStage({ ...on, writing: true }).stage).toBe("writing");
    expect(sessionStage({ ...on, hasAnswer: true }).stage).toBe("answer_ready");
  });

  it("shows manual mode is waiting, and a typed test answer works with no audio", () => {
    expect(sessionStage({ ...idle, tabOn: true, pendingQuestion: true }).stage).toBe("waiting_for_you");
    expect(sessionStage({ ...idle, writing: true }).stage).toBe("writing");
    expect(sessionStage({ ...idle, hasAnswer: true }).detail).toContain("Not listening");
  });

  it("says when only the mic is missing", () => {
    expect(sessionStage({ ...idle, tabOn: true }).detail).toContain("mic is off");
  });
});

describe("flagPhrases", () => {
  const marked = (text: string, phrases: string[]) => flagPhrases(text, phrases).filter(p => p.flagged).map(p => p.text);

  it("keeps all text and marks phrases regardless of case", () => {
    const parts = flagPhrases("I wrote it while AT Betway last year.", ["while at Betway"]);
    expect(parts.map(p => p.text).join("")).toBe("I wrote it while AT Betway last year.");
    expect(marked("I wrote it while AT Betway last year.", ["while at Betway"])).toEqual(["while AT Betway"]);
  });

  it("merges overlaps without repeating text", () => {
    const text = "we worked closely with finance";
    const parts = flagPhrases(text, ["worked closely", "closely with finance"]);
    expect(parts.map(p => p.text).join("")).toBe(text);
  });

  it("ignores phrases that are not present or too short to mean anything", () => {
    expect(flagPhrases("Plain answer.", ["absent phrase", "a", ""])).toEqual([{ text: "Plain answer.", flagged: false }]);
  });
});

describe("buildSessionNotes", () => {
  it("records answers, warnings and the transcript", () => {
    const notes = buildSessionNotes({
      title: "Interview notes",
      durationLabel: "12:03",
      turns: [{ question: "Why?", directAnswer: "Because.", bullets: ["One"], unsupportedClaims: ["Led twenty"], addYourOwn: "Add the reason." }],
      transcript: [{ source: "interviewer", text: "Why?" }, { source: "candidate", text: "Because." }],
    });
    expect(notes).toContain("Questions answered: 1.");
    expect(notes).toContain("### 1. Why?");
    expect(notes).toContain("Add in your own words: Add the reason.");
    expect(notes).toContain("Not in your evidence: Led twenty");
    expect(notes).toContain("**Interviewer:** Why?");
    expect(notes).toContain("**You:** Because.");
  });
});
