import { describe, expect, it } from "vitest";
import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  it("returns empty for blank input", () => {
    expect(detectLanguage("")).toEqual({ code: "", label: "" });
    expect(detectLanguage("   ")).toEqual({ code: "", label: "" });
  });

  it("detects non-Latin scripts by a single character", () => {
    expect(detectLanguage("你好，请介绍一下你自己")).toMatchObject({ code: "zh" });
    expect(detectLanguage("こんにちは、自己紹介してください")).toMatchObject({ code: "ja" });
    expect(detectLanguage("자기소개 해주세요")).toMatchObject({ code: "ko" });
    expect(detectLanguage("حدثني عن خبرتك")).toMatchObject({ code: "ar" });
    expect(detectLanguage("Расскажите о своём опыте")).toMatchObject({ code: "ru" });
  });

  it("scores Latin-script languages by stop words", () => {
    expect(detectLanguage("¿Qué experiencia tienes con pruebas A/B?")).toMatchObject({ code: "es" });
    expect(detectLanguage("Quelle est votre expérience avec les tests A/B ?")).toMatchObject({ code: "fr" });
    expect(detectLanguage("Welche Erfahrung haben Sie mit A/B-Tests?")).toMatchObject({ code: "de" });
    expect(detectLanguage("What experience do you have with A/B testing?")).toMatchObject({ code: "en" });
  });

  it("defaults to English when there is no clear signal", () => {
    expect(detectLanguage("SQL Python dashboards")).toMatchObject({ code: "en" });
  });
});
