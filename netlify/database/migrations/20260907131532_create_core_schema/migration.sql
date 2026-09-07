CREATE TABLE "hotels" (
	"id" serial PRIMARY KEY,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY,
	"filename" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"media_count" integer DEFAULT 0 NOT NULL,
	"default_hotel_id" integer,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_entries" (
	"id" serial PRIMARY KEY,
	"batch_id" integer NOT NULL,
	"sort_index" integer DEFAULT 0 NOT NULL,
	"reported_at" timestamp with time zone,
	"raw_timestamp" text,
	"sender" text,
	"rawText" text DEFAULT '' NOT NULL,
	"hotel_id" integer,
	"area" text,
	"room_number" text,
	"title" text,
	"description" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"media_keys" jsonb,
	"include" boolean DEFAULT true NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"ticket_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL,
	"token_hash" text NOT NULL,
	"role" text DEFAULT 'rezeption' NOT NULL,
	"hotel_id" integer,
	"label" text,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"ticket_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" serial PRIMARY KEY,
	"hotel_id" integer NOT NULL,
	"number" text NOT NULL,
	"floor" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" serial PRIMARY KEY,
	"ticket_id" integer NOT NULL,
	"user_id" integer,
	"author_name" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" serial PRIMARY KEY,
	"ticket_id" integer NOT NULL,
	"user_id" integer,
	"actor_name" text,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_photos" (
	"id" serial PRIMARY KEY,
	"ticket_id" integer NOT NULL,
	"blob_key" text NOT NULL,
	"phase" text DEFAULT 'before' NOT NULL,
	"mime_type" text DEFAULT 'image/jpeg' NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"original_name" text,
	"uploaded_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY,
	"hotel_id" integer NOT NULL,
	"area" text NOT NULL,
	"room_number" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'offen' NOT NULL,
	"created_by_id" integer,
	"assigned_to_id" integer,
	"source" text DEFAULT 'app' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"external_author" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'rezeption' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"hotel_id" integer,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "hotels_slug_key" ON "hotels" ("slug");--> statement-breakpoint
CREATE INDEX "import_entries_batch_idx" ON "import_entries" ("batch_id","sort_index");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites" ("token_hash");--> statement-breakpoint
CREATE INDEX "invites_code_idx" ON "invites" ("code");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_hotel_number_key" ON "rooms" ("hotel_id","number");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_idx" ON "ticket_comments" ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_photos_ticket_idx" ON "ticket_photos" ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_hotel_idx" ON "tickets" ("hotel_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" ("status");--> statement-breakpoint
CREATE INDEX "tickets_room_idx" ON "tickets" ("hotel_id","room_number");--> statement-breakpoint
CREATE INDEX "tickets_reported_idx" ON "tickets" ("reported_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_default_hotel_id_hotels_id_fkey" FOREIGN KEY ("default_hotel_id") REFERENCES "hotels"("id");--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "import_entries" ADD CONSTRAINT "import_entries_batch_id_import_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "import_entries" ADD CONSTRAINT "import_entries_hotel_id_hotels_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id");--> statement-breakpoint
ALTER TABLE "import_entries" ADD CONSTRAINT "import_entries_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_hotel_id_hotels_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id");--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hotel_id_hotels_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "ticket_photos" ADD CONSTRAINT "ticket_photos_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ticket_photos" ADD CONSTRAINT "ticket_photos_uploaded_by_id_users_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_hotel_id_hotels_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_id_users_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hotel_id_hotels_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id");