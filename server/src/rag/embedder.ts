import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

/**
 * The embedding model. Ingestion and questions must use the same model and settings,
 * or their vectors can't be compared, so both go through this file.
 */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

let extractor: Promise<FeatureExtractionPipeline> | undefined;

/** Loads the model once (downloaded on first use, then read from the cache) and reuses it. */
function getExtractor(): Promise<FeatureExtractionPipeline> {
  // The 8-bit (q8) weights are about 4× smaller than the full ones, with near-identical results.
  extractor ??= pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
  return extractor;
}

/**
 * Turns each text into an embedding: 384 numbers that capture its meaning.
 * Mean pooling averages the model's per-token vectors into one vector per text,
 * and normalize scales it to length 1, so cosine similarity compares direction only.
 *
 * Texts go through the model one at a time, never in batches. The 8-bit model scales its
 * numbers using everything in the batch, so a batched text would get a slightly different
 * vector than the same text on its own (the way a question is embedded).
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const extract = await getExtractor();
  const vectors: number[][] = [];
  for (const text of texts) {
    const output = await extract(text, { pooling: "mean", normalize: true });
    vectors.push((output.tolist() as number[][])[0]!);
  }
  return vectors;
}
