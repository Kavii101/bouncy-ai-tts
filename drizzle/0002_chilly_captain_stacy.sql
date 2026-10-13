CREATE TABLE `interview_audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`event` varchar(64) NOT NULL,
	`detail` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interview_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interview_briefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`briefJson` text NOT NULL,
	`approved` enum('draft','approved') NOT NULL DEFAULT 'draft',
	`model` varchar(80),
	`promptVersion` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `interview_briefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `interview_brief_workspace_unique` UNIQUE(`workspaceId`)
);
--> statement-breakpoint
CREATE TABLE `interview_materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialId` varchar(64) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('job_description','resume','project','notes') NOT NULL,
	`sourceType` enum('pasted','uploaded') NOT NULL DEFAULT 'pasted',
	`normalizedText` text,
	`contentHash` varchar(64) NOT NULL,
	`charCount` int NOT NULL,
	`status` enum('active','deleted') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `interview_materials_id` PRIMARY KEY(`id`),
	CONSTRAINT `interview_materials_materialId_unique` UNIQUE(`materialId`)
);
--> statement-breakpoint
CREATE TABLE `interview_practice_turns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`turnId` varchar(64) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`questionText` text NOT NULL,
	`category` varchar(48) NOT NULL,
	`answerHash` varchar(64) NOT NULL,
	`answerCharCount` int NOT NULL,
	`feedbackJson` text NOT NULL,
	`model` varchar(80),
	`promptVersion` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interview_practice_turns_id` PRIMARY KEY(`id`),
	CONSTRAINT `interview_practice_turns_turnId_unique` UNIQUE(`turnId`)
);
--> statement-breakpoint
CREATE TABLE `interview_sql_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` varchar(64) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`dialect` varchar(32) NOT NULL,
	`promptHash` varchar(64) NOT NULL,
	`solutionJson` text NOT NULL,
	`validationStatus` enum('not_run','passed','failed','skipped','rejected') NOT NULL DEFAULT 'not_run',
	`model` varchar(80),
	`promptVersion` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interview_sql_cases_id` PRIMARY KEY(`id`),
	CONSTRAINT `interview_sql_cases_caseId_unique` UNIQUE(`caseId`)
);
