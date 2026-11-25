CREATE TABLE `telegram_bindings` (
	`botId` text NOT NULL,
	`telegramUserId` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` text DEFAULT (CURRENT_TIMESTAMP),
	PRIMARY KEY(`botId`, `telegramUserId`, `userId`)
);
--> statement-breakpoint
CREATE TABLE `telegram_bot_accounts` (
	`botId` text NOT NULL,
	`userId` text NOT NULL,
	PRIMARY KEY(`botId`, `userId`)
);
--> statement-breakpoint
CREATE TABLE `telegram_bots` (
	`id` text PRIMARY KEY NOT NULL,
	`telegramId` text NOT NULL,
	`username` text NOT NULL,
	`firstName` text NOT NULL,
	`botInfo` text NOT NULL,
	`encryptedToken` text NOT NULL,
	`webhookSecret` text NOT NULL,
	`createdAt` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_bots_telegramId_unique` ON `telegram_bots` (`telegramId`);--> statement-breakpoint
CREATE TABLE `telegram_selections` (
	`botId` text NOT NULL,
	`telegramUserId` text NOT NULL,
	`userId` text NOT NULL,
	PRIMARY KEY(`botId`, `telegramUserId`)
);
--> statement-breakpoint
CREATE TABLE `telegram_updates` (
	`botId` text NOT NULL,
	`updateId` integer NOT NULL,
	`processed` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (CURRENT_TIMESTAMP),
	PRIMARY KEY(`botId`, `updateId`)
);
--> statement-breakpoint
CREATE TABLE `__new_bind_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`botId` text NOT NULL,
	`expiresAt` text,
	`createdAt` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
DROP TABLE `bind_tokens`;
--> statement-breakpoint
ALTER TABLE `__new_bind_tokens` RENAME TO `bind_tokens`;
--> statement-breakpoint
DROP INDEX `users_telegramUserId_unique`;
--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `telegramUserId`;
