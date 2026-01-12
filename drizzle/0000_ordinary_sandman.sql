CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'LOBBY',
	`turn_player_index` integer DEFAULT 0,
	`current_phase` text DEFAULT 'SETUP',
	`combat_state` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text,
	`message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text,
	`name` text,
	`color` text,
	`gold` integer DEFAULT 0,
	`prestige` integer DEFAULT 0,
	`is_eliminated` integer DEFAULT 0,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `territories` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text,
	`owner_id` text,
	`location` text DEFAULT 'DECK',
	`terrain_type` text,
	`fortification_level` integer DEFAULT 0,
	`settlement_type` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `things` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text,
	`owner_id` text,
	`location` text,
	`territory_id` text,
	`template_id` text,
	`is_face_up` integer DEFAULT 0,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`territory_id`) REFERENCES `territories`(`id`) ON UPDATE no action ON DELETE no action
);
