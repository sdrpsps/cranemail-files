CREATE TABLE `web_uploads` (
	`userId` text NOT NULL,
	`requestId` text NOT NULL,
	`recordId` text NOT NULL,
	`fileName` text NOT NULL,
	`size` integer NOT NULL,
	`serverUrl` text NOT NULL,
	`fileId` text,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`userId`, `requestId`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
