CREATE TABLE `tts_artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(64) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`byteSize` int NOT NULL,
	`durationMs` int,
	`checksum` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tts_artifacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `tts_artifacts_jobId_unique` UNIQUE(`jobId`),
	CONSTRAINT `tts_artifacts_storageKey_unique` UNIQUE(`storageKey`)
);
--> statement-breakpoint
CREATE TABLE `tts_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(64) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`sourceType` enum('insight','report','user_text') NOT NULL,
	`sourceId` varchar(160),
	`status` enum('queued','processing','ready','failed','cancelled','expired') NOT NULL DEFAULT 'queued',
	`textHash` varchar(64) NOT NULL,
	`charCount` int NOT NULL,
	`languageCode` varchar(16) NOT NULL,
	`voiceId` varchar(64) NOT NULL,
	`speed` varchar(8) NOT NULL,
	`provider` varchar(64),
	`providerRequestId` varchar(160),
	`errorCode` varchar(80),
	`errorMessage` text,
	`idempotencyKey` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tts_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `tts_jobs_jobId_unique` UNIQUE(`jobId`),
	CONSTRAINT `tts_job_idempotency_unique` UNIQUE(`workspaceId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `tts_usage_quotas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`characterLimit` int NOT NULL DEFAULT 100000,
	`charactersUsed` int NOT NULL DEFAULT 0,
	`concurrentLimit` int NOT NULL DEFAULT 2,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tts_usage_quotas_id` PRIMARY KEY(`id`),
	CONSTRAINT `tts_quota_period_unique` UNIQUE(`workspaceId`,`periodStart`)
);
--> statement-breakpoint
CREATE TABLE `tts_voice_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`languageCode` varchar(16) NOT NULL,
	`voiceId` varchar(64) NOT NULL,
	`speed` varchar(8) NOT NULL DEFAULT '1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tts_voice_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `tts_voice_settings_unique` UNIQUE(`workspaceId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `tts_workspace_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','member') NOT NULL DEFAULT 'member',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tts_workspace_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `tts_workspace_user_unique` UNIQUE(`workspaceId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `tts_workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`ownerUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tts_workspaces_id` PRIMARY KEY(`id`),
	CONSTRAINT `tts_workspaces_workspaceId_unique` UNIQUE(`workspaceId`)
);
