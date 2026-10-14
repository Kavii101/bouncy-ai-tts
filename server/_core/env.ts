export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Optional model overrides. Required-ish for plain OpenAI: when unset and the
  // base URL is api.openai.com, providerConfig picks a sensible default.
  llmModel: process.env.LLM_MODEL ?? "",
  transcriptionModel: process.env.TRANSCRIPTION_MODEL ?? "",
  // Interview Copilot feature flags. Both default OFF so the feature stays dark
  // until a deployment explicitly opts in. Live assist has its own flag because,
  // per the product plan, it must not be reachable until consent, retention, and
  // deletion controls are complete — enabling the copilot never enables capture.
  interviewCopilotEnabled: process.env.INTERVIEW_COPILOT_ENABLED === "true",
  interviewLiveAssistEnabled: process.env.INTERVIEW_LIVE_ASSIST_ENABLED === "true",
};
