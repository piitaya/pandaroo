CREATE TABLE `spools` (
	`tag_id` text PRIMARY KEY NOT NULL,
	`variant_id` text,
	`material` text,
	`product` text,
	`color_hex` text,
	`weight` real,
	`remain` integer,
	`last_used` text,
	`first_seen` text DEFAULT (datetime('now')) NOT NULL,
	`last_updated` text DEFAULT (datetime('now')) NOT NULL
);
