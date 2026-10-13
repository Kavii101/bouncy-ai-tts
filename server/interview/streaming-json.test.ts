import { describe, expect, it } from "vitest";
import { extractStreamingFields } from "@shared/interview/streamingJson";

describe("extractStreamingFields", () => {
  it("returns empty fields for an empty or field-less start", () => {
    expect(extractStreamingFields("")).toEqual({ directAnswer: "", bullets: [] });
    expect(extractStreamingFields('{"confidence":')).toEqual({ directAnswer: "", bullets: [] });
  });

  it("extracts a complete object", () => {
    const json = JSON.stringify({
      directAnswer: "Lead with the churn dashboard.",
      bullets: ["Owned it end to end", "Cut reporting time 40%"],
      confidence: "high",
    });
    expect(extractStreamingFields(json)).toEqual({
      directAnswer: "Lead with the churn dashboard.",
      bullets: ["Owned it end to end", "Cut reporting time 40%"],
    });
  });

  it("shows a directAnswer that is still streaming (unterminated string)", () => {
    const partial = '{"directAnswer":"Start with the dashb';
    expect(extractStreamingFields(partial).directAnswer).toBe("Start with the dashb");
  });

  it("shows completed bullets and the in-progress one", () => {
    const partial = '{"directAnswer":"x","bullets":["first bullet","second bul';
    expect(extractStreamingFields(partial).bullets).toEqual(["first bullet", "second bul"]);
  });

  it("stops the array cleanly at the closing bracket", () => {
    const partial = '{"bullets":["a","b"],"assumptions":["later"]}';
    expect(extractStreamingFields(partial).bullets).toEqual(["a", "b"]);
  });

  it("is order-independent (bullets before directAnswer)", () => {
    const partial = '{"bullets":["a"],"directAnswer":"answer text"}';
    expect(extractStreamingFields(partial)).toEqual({ directAnswer: "answer text", bullets: ["a"] });
  });

  it("unescapes quotes and newlines in the answer", () => {
    const partial = '{"directAnswer":"He said \\"hi\\"\\nthen left"}';
    expect(extractStreamingFields(partial).directAnswer).toBe('He said "hi"\nthen left');
  });
});
