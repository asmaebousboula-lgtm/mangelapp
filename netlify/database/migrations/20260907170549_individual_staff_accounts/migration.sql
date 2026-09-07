ALTER TABLE "invites" ADD COLUMN "purpose" text DEFAULT 'signup' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "invites_user_idx" ON "invites" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" ("username");--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Deactivated accounts used to be stored as 'blocked'. One canonical value from here on:
-- active | inactive (deactivated by an admin) | deleted (archived, keeps ticket attribution).
UPDATE "users" SET "status" = 'inactive' WHERE "status" = 'blocked';
