import { describe, expect, it } from "vitest";
import { pickBestVoice } from "@shared/speechVoice";

const v = (name: string, lang = "en-US") => ({ name, lang });

describe("pickBestVoice", () => {
  it("prefers a natural/neural voice over the robotic defaults", () => {
    const voices = [v("Microsoft David"), v("Google US English"), v("Microsoft Zira")];
    expect(pickBestVoice(voices, "en-US")?.name).toBe("Google US English");
  });

  it("prefers explicit Natural voices", () => {
    const voices = [v("Samantha"), v("Microsoft Aria Online (Natural)")];
    expect(pickBestVoice(voices, "en-US")?.name).toBe("Microsoft Aria Online (Natural)");
  });

  it("matches the requested language family first", () => {
    const voices = [v("Google US English", "en-US"), v("Thomas", "fr-FR"), v("Google français", "fr-FR")];
    expect(pickBestVoice(voices, "fr-FR")?.lang).toBe("fr-FR");
  });

  it("falls back to any English voice, then to null when empty", () => {
    expect(pickBestVoice([v("Thomas", "fr-FR"), v("Daniel", "en-GB")], "en-US")?.name).toBe("Daniel");
    expect(pickBestVoice([], "en-US")).toBeNull();
  });

  it("penalises known robotic voices", () => {
    const voices = [v("eSpeak English"), v("Alex")];
    expect(pickBestVoice(voices, "en-US")?.name).toBe("Alex");
  });
});
