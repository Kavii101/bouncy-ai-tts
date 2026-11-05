// What the Live session is actually doing, in words a nervous candidate can trust.
//
// A single "Ready" badge can mean the model is up, the audio is connected, or
// transcription is running. Each stage here means exactly one thing, and it is
// never "listening" unless the interviewer's audio is really connected.

export type SessionStage = "not_connected" | "mic_only" | "listening" | "hearing" | "waiting_for_you" | "writing" | "answer_ready";
export type StageTone = "idle" | "warn" | "live" | "busy" | "done";

export type StageInput = {
  micOn: boolean;
  tabOn: boolean;
  /** The interviewer is mid-sentence: an interim transcript exists. */
  hearing: boolean;
  /** Manual mode has a heard question nobody has answered yet. */
  pendingQuestion: boolean;
  writing: boolean;
  hasAnswer: boolean;
};

export type StageView = { stage: SessionStage; label: string; detail: string; tone: StageTone };

export function sessionStage(input: StageInput): StageView {
  // An answer in progress outranks everything, including a manual test with no audio.
  if (input.writing) return { stage: "writing", label: "Writing your answer", detail: "Words appear as they are written.", tone: "busy" };
  if (!input.tabOn && !input.micOn) {
    return input.hasAnswer
      ? { stage: "answer_ready", label: "Answer ready", detail: "Not listening. Share the interview tab to go live.", tone: "done" }
      : { stage: "not_connected", label: "Not connected", detail: "Share the interview tab and turn on your mic.", tone: "idle" };
  }
  if (!input.tabOn) return { stage: "mic_only", label: "Can't hear the interviewer", detail: "Your mic is on. Share the interview tab with its audio.", tone: "warn" };
  if (input.hearing) return { stage: "hearing", label: "Hearing the question", detail: "Waiting for the interviewer to finish.", tone: "live" };
  if (input.pendingQuestion) return { stage: "waiting_for_you", label: "Question heard", detail: "Press Answer now when you want help.", tone: "warn" };
  if (input.hasAnswer) return { stage: "answer_ready", label: "Answer ready", detail: "Still listening for the next question.", tone: "done" };
  return { stage: "listening", label: "Listening", detail: input.micOn ? "Waiting for the interviewer's question." : "Waiting for a question. Your mic is off.", tone: "live" };
}

export type NotesTurn = { question: string; directAnswer: string; bullets: string[]; unsupportedClaims: string[]; addYourOwn?: string };
export type NotesLine = { source: "candidate" | "interviewer"; text: string };

// A private record of the session, built in the browser. Nothing is uploaded.
export function buildSessionNotes(params: { title: string; durationLabel: string; turns: NotesTurn[]; transcript: NotesLine[] }): string {
  const { title, durationLabel, turns, transcript } = params;
  const out = [`# ${title}`, "", `Duration: ${durationLabel}. Questions answered: ${turns.length}.`, ""];
  if (turns.length) {
    out.push("## Questions and suggested answers", "");
    turns.forEach((turn, i) => {
      out.push(`### ${i + 1}. ${turn.question}`, "", turn.directAnswer, "");
      turn.bullets.forEach(bullet => out.push(`- ${bullet}`));
      if (turn.bullets.length) out.push("");
      if (turn.addYourOwn) out.push(`Add in your own words: ${turn.addYourOwn}`, "");
      if (turn.unsupportedClaims.length) out.push(`Not in your evidence: ${turn.unsupportedClaims.join("; ")}`, "");
    });
  }
  if (transcript.length) {
    out.push("## Transcript", "");
    transcript.forEach(line => out.push(`**${line.source === "interviewer" ? "Interviewer" : "You"}:** ${line.text}`, ""));
  }
  return out.join("\n").trimEnd() + "\n";
}
