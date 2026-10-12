import {
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  vector,
} from "drizzle-orm/pg-core";

/** Size of one embedding from all-MiniLM-L6-v2. */
export const EMBEDDING_DIMENSIONS = 384;

/** One row per ingested regulations document (one season). */
export const seasons = pgTable("seasons", {
  season: smallint("season").primaryKey(),
  issue: text("issue"),
  sourceFile: text("source_file").notNull(),
  articleCount: integer("article_count").notNull(),
  chunkCount: integer("chunk_count").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The document outline: one row per numbered heading
 * (e.g. "B5", "B5.14", "B5.14.2", "57", "57.2", "Appendix B1").
 */
export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    season: smallint("season")
      .notNull()
      .references(() => seasons.season, { onDelete: "cascade" }),
    articleId: text("article_id").notNull(),
    parentId: text("parent_id"),
    title: text("title"),
    level: smallint("level").notNull(),
    position: integer("position").notNull(),
    page: integer("page").notNull(),
    body: text("body").notNull().default(""),
  },
  (t) => [
    unique("articles_season_article_id_key").on(t.season, t.articleId),
    index("articles_season_parent_id_idx").on(t.season, t.parentId),
  ],
);

/** The search index: one row per searchable piece of an article, with its embedding. */
export const chunks = pgTable(
  "chunks",
  {
    id: serial("id").primaryKey(),
    season: smallint("season")
      .notNull()
      .references(() => seasons.season, { onDelete: "cascade" }),
    articleId: text("article_id").notNull(),
    chunkIndex: smallint("chunk_index").notNull(),
    parentId: text("parent_id"),
    articleTitle: text("article_title"),
    page: integer("page").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (t) => [
    unique("chunks_season_article_chunk_key").on(t.season, t.articleId, t.chunkIndex),
    index("chunks_season_idx").on(t.season),
    foreignKey({
      name: "chunks_article_fk",
      columns: [t.season, t.articleId],
      foreignColumns: [articles.season, articles.articleId],
    }).onDelete("cascade"),
  ],
);
