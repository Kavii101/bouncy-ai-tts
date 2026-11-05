// Grounding enforcement.
//
// The model is told to cite evidence, but we never trust it to. After every
// generation we re-check the claimed evidence against the set of evidence ids
// the user actually approved. Evidence referencing an unknown id is dropped and
// surfaced as an unsupported claim, and `shouldVerify` is forced on whenever the
// answer leans on anything unverified. All functions here are pure.

import type { AnswerSuggestion, Brief } from "./schemas";

// The evidence ids a workspace's approved brief actually contains.
export function approvedEvidenceIds(brief: Brief): Set<string> {
  return new Set(brief.evidence.map(e => e.id));
}

export function groundSuggestion(
  suggestion: AnswerSuggestion,
  approvedIds: Set<string>,
): AnswerSuggestion {
  const kept: AnswerSuggestion["evidence"] = [];
  const droppedClaims: string[] = [];

  for (const ref of suggestion.evidence) {
    if (approvedIds.has(ref.evidenceId)) {
      kept.push(ref);
    } else if (ref.claim.trim().length > 0) {
      droppedClaims.push(ref.claim.trim());
    }
  }

  const unsupportedClaims = dedupe([...suggestion.unsupportedClaims, ...droppedClaims]);
  const leansOnUnverified = kept.some(e => !e.verified);
  const shouldVerify =
    suggestion.shouldVerify ||
    unsupportedClaims.length > 0 ||
    // Small talk has no bullets and needs no evidence, so there is nothing to verify.
    (kept.length === 0 && suggestion.bullets.length > 0) ||
    leansOnUnverified;

  return { ...suggestion, evidence: kept, unsupportedClaims, shouldVerify };
}

// Confidence can never read "high" once anything is unsupported or unverified.
export function cappedConfidence(suggestion: AnswerSuggestion): AnswerSuggestion["confidence"] {
  if (suggestion.unsupportedClaims.length > 0 || suggestion.shouldVerify) {
    return suggestion.confidence === "high" ? "medium" : suggestion.confidence;
  }
  return suggestion.confidence;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map(s => s.trim()).filter(Boolean)));
}
