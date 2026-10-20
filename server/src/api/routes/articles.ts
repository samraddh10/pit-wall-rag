import { and, asc, eq, like, or } from "drizzle-orm";
import { Router } from "express";
import { db } from "../../db/client.ts";
import { articles } from "../../db/schema.ts";
import type { ArticleResponse, ErrorResponse } from "../../shared/api-types.ts";
import { articleParamsSchema } from "../schemas.ts";

export const articlesRouter = Router();

/**
 * Returns one article plus everything numbered under it, in document order:
 * "B5.14" gives B5.14, B5.14.1, B5.14.2, ...
 *
 * An article's children always have its ID plus a dot in front ("B5.14" → "B5.14.2"),
 * because the chunker builds each parent ID from the article ID. So one query with
 * `LIKE 'B5.14.%'` finds the whole branch.
 */
articlesRouter.get("/:season/:articleId", async (req, res) => {
  // A bad season or article ID throws here, and the error handler turns it into a 400.
  const { season, articleId } = articleParamsSchema.parse(req.params);

  const rows = await db
    .select({
      articleId: articles.articleId,
      parentId: articles.parentId,
      title: articles.title,
      page: articles.page,
      body: articles.body,
    })
    .from(articles)
    .where(
      and(
        eq(articles.season, season),
        or(eq(articles.articleId, articleId), like(articles.articleId, `${articleId}.%`)),
      ),
    )
    .orderBy(asc(articles.position));

  const article = rows.find((row) => row.articleId === articleId);
  if (!article) {
    const body: ErrorResponse = { error: `Article ${articleId} not found in the ${season} regulations` };
    res.status(404).json(body);
    return;
  }

  const body: ArticleResponse = {
    season,
    articleId: article.articleId,
    title: article.title,
    parentId: article.parentId,
    page: article.page,
    sections: rows.map(({ articleId, title, body, page }) => ({ articleId, title, body, page })),
  };
  res.json(body);
});
