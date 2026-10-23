CREATE TABLE "demo_quota" (
	"day" date NOT NULL,
	"counter" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "demo_quota_day_counter_pk" PRIMARY KEY("day","counter")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_guest" boolean DEFAULT false NOT NULL;