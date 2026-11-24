ALTER TABLE `uploaded_files` ADD `shortCode` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uploaded_files_shortCode_unique` ON `uploaded_files` (`shortCode`);