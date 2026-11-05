import { flagPhrases } from "@shared/interview/flagged";

// Marks phrases the evidence does not support, inside the sentence the candidate is reading.
export function Flagged({ text, phrases, markClassName }: { text: string; phrases: string[]; markClassName: string }) {
  return (
    <>
      {flagPhrases(text, phrases).map((part, i) =>
        part.flagged ? <mark key={i} className={markClassName} title="Not in your evidence">{part.text}</mark> : <span key={i}>{part.text}</span>,
      )}
    </>
  );
}
