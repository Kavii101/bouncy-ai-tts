CREATE TABLE `interview_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` integer NOT NULL,
	`event` text NOT NULL,
	`detail` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `interview_briefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` integer NOT NULL,
	`briefJson` text NOT NULL,
	`approved` text DEFAULT 'draft' NOT NULL,
	`model` text,
	`promptVersion` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_brief_workspace_unique` ON `interview_briefs` (`workspaceId`);--> statement-breakpoint
CREATE TABLE `interview_materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`materialId` text NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` integer NOT NULL,
	`kind` text NOT NULL,
	`sourceType` text DEFAULT 'pasted' NOT NULL,
	`normalizedText` text,
	`contentHash` text NOT NULL,
	`charCount` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_materials_materialId_unique` ON `interview_materials` (`materialId`);--> statement-breakpoint
CREATE TABLE `interview_practice_turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`turnId` text NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` integer NOT NULL,
	`questionText` text NOT NULL,
	`category` text NOT NULL,
	`answerHash` text NOT NULL,
	`answerCharCount` integer NOT NULL,
	`feedbackJson` text NOT NULL,
	`model` text,
	`promptVersion` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_practice_turns_turnId_unique` ON `interview_practice_turns` (`turnId`);--> statement-breakpoint
CREATE TABLE `interview_sql_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caseId` text NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` integer NOT NULL,
	`dialect` text NOT NULL,
	`promptHash` text NOT NULL,
	`solutionJson` text NOT NULL,
	`validationStatus` text DEFAULT 'not_run' NOT NULL,
	`model` text,
	`promptVersion` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_sql_cases_caseId_unique` ON `interview_sql_cases` (`caseId`);--> statement-breakpoint
CREATE TABLE `tts_artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jobId` text NOT NULL,
	`workspaceId` text NOT NULL,
	`storageKey` text NOT NULL,
	`mimeType` text NOT NULL,
	`byteSize` integer NOT NULL,
	`durationMs` integer,
	`checksum` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tts_artifacts_jobId_unique` ON `tts_artifacts` (`jobId`);--> statement-breakpoint
CREATE UNIQUE INDEX `tts_artifacts_storageKey_unique` ON `tts_artifacts` (`storageKey`);--> statement-breakpoint
CREATE TABLE `tts_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jobId` text NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` integer NOT NULL,
	`sourceType` text NOT NULL,
	`sourceId` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`textHash` text NOT NULL,
	`charCount` integer NOT NULL,
	`languageCode` text NOT NULL,
	`voiceId` text NOT NULL,
	`speed` text NOT NULL,
	`provider` text,
	`providerRequestId` text,
	`errorCode` text,
	`errorMessage` text,
	`idempotencyKey` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tts_jobs_jobId_unique` ON `tts_jobs` (`jobId`);--> statement-breakpoint
CREATE UNIQUE INDEX `tts_job_idempotency_unique` ON `tts_jobs` (`workspaceId`,`idempotencyKey`);--> statement-breakpoint
CREATE TABLE `tts_usage_quotas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspaceId` text NOT NULL,
	`periodStart` integer NOT NULL,
	`periodEnd` integer NOT NULL,
	`characterLimit` integer DEFAULT 100000 NOT NULL,
	`charactersUsed` integer DEFAULT 0 NOT NULL,
	`concurrentLimit` integer DEFAULT 2 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tts_quota_period_unique` ON `tts_usage_quotas` (`workspaceId`,`periodStart`);--> statement-breakpoint
CREATE TABLE `tts_voice_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` integer NOT NULL,
	`languageCode` text NOT NULL,
	`voiceId` text NOT NULL,
	`speed` text DEFAULT '1' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tts_voice_settings_unique` ON `tts_voice_settings` (`workspaceId`,`userId`);--> statement-breakpoint
CREATE TABLE `tts_workspace_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tts_workspace_user_unique` ON `tts_workspace_members` (`workspaceId`,`userId`);--> statement-breakpoint
CREATE TABLE `tts_workspaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspaceId` text NOT NULL,
	`displayName` text NOT NULL,
	`ownerUserId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tts_workspaces_workspaceId_unique` ON `tts_workspaces` (`workspaceId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);