CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" smallint NOT NULL,
	"article_id" text NOT NULL,
	"parent_id" text,
	"title" text,
	"level" smallint NOT NULL,
	"position" integer NOT NULL,
	"page" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	CONSTRAINT "articles_season_article_id_key" UNIQUE("season","article_id")
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" smallint NOT NULL,
	"article_id" text NOT NULL,
	"chunk_index" smallint NOT NULL,
	"parent_id" text,
	"article_title" text,
	"page" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(384) NOT NULL,
	CONSTRAINT "chunks_season_article_chunk_key" UNIQUE("season","article_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"season" smallint PRIMARY KEY NOT NULL,
	"issue" text,
	"source_file" text NOT NULL,
	"article_count" integer NOT NULL,
	"chunk_count" integer NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_season_seasons_season_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("season") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_season_seasons_season_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("season") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_article_fk" FOREIGN KEY ("season","article_id") REFERENCES "public"."articles"("season","article_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_season_parent_id_idx" ON "articles" USING btree ("season","parent_id");--> statement-breakpoint
CREATE INDEX "chunks_season_idx" ON "chunks" USING btree ("season");