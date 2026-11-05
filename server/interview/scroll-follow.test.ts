import { describe, expect, it } from "vitest";
import { alignSpeech, buildScrollScript, fillInFor } from "@shared/interview/scrollFollow";

const CUES = [
  { id: "c1", title: "Open", say: "Welcome everyone. Revenue grew eighteen percent this quarter.", transition: "", seconds: 20, notes: "" },
  { id: "c2", title: "Retention", say: "Retention is the engine behind that growth. Onboarding now takes two days instead of two weeks.", transition: "", seconds: 30, notes: "" },
  { id: "c3", title: "Roadmap", say: "Next we ship the dashboard in Q3. Then the mobile app follows.", transition: "", seconds: 25, notes: "" },
];

describe("buildScrollScript", () => {
  it("splits cues into sentences with global word offsets", () => {
    const s = buildScrollScript(CUES);
    expect(s.sentences.length).toBe(6);
    expect(s.sentences[0].cueTitle).toBe("Open");
    expect(s.sentences[2].text).toContain("Retention is the engine");
    expect(s.words.length).toBeGreaterThan(20);
    expect(s.sentences[1].startWord).toBeGreaterThan(s.sentences[0].startWord);
  });
  it("handles an empty deck", () => {
    expect(buildScrollScript([]).sentences).toHaveLength(0);
  });
});

describe("alignSpeech", () => {
  const script = buildScrollScript(CUES);

  it("finds the sentence being spoken from the start", () => {
    const hit = alignSpeech("welcome everyone revenue grew eighteen percent", script, 0);
    expect(hit).not.toBeNull();
    // The spoken phrase ends inside the second sentence, so position lands there.
    expect(hit!.sentenceIndex).toBe(1);
    expect(hit!.confidence).toBeGreaterThan(0.5);
  });

  it("follows a paraphrase by keyword overlap", () => {
    const hit = alignSpeech("retention really is the engine behind the growth", script, 5);
    expect(hit).not.toBeNull();
    expect(hit!.sentenceIndex).toBe(2);
  });

  it("jumps ahead when the speaker skips forward", () => {
    const hit = alignSpeech("next we ship the dashboard in Q3", script, 0);
    expect(hit).not.toBeNull();
    expect(hit!.sentenceIndex).toBe(4);
  });

  it("returns null when speech is off-script", () => {
    const hit = alignSpeech("the weather in Lisbon is lovely this time of year", script, 0);
    expect(hit).toBeNull();
  });

  it("does not run backwards far behind the current position", () => {
    const late = script.words.length - 2;
    const hit = alignSpeech("welcome everyone revenue grew", script, late);
    expect(hit).toBeNull();
  });
});

describe("fillInFor", () => {
  const script = buildScrollScript(CUES);

  it("offers the next sentence when on track", () => {
    const fill = fillInFor(script, 1, false);
    expect(fill?.kind).toBe("next");
    expect(fill?.sentence.text).toContain("Retention");
  });

  it("offers a bridge back when off course, naming the missed point", () => {
    const fill = fillInFor(script, 4, true);
    expect(fill?.kind).toBe("bridge");
    expect(fill?.sentence.text).toContain("Onboarding");
  });

  it("returns null at the end of the script", () => {
    expect(fillInFor(script, script.sentences.length - 1, false)).toBeNull();
  });
});
