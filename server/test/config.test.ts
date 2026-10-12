import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const DATABASE_URL = "postgres://pitwall:pitwall@localhost:5432/pitwall";

describe("loadConfig", () => {
  it("fills in defaults when only the database URL is given", () => {
    const config = loadConfig({ DATABASE_URL });

    expect(config.PORT).toBe(3001);
    expect(config.LLM_PROVIDER).toBe("groq");
    expect(config.RATE_LIMIT_PER_MIN).toBe(5);
    expect(config.GROQ_API_KEY).toBeUndefined();
  });

  it("turns number strings from .env into numbers", () => {
    const config = loadConfig({ DATABASE_URL, PORT: "8080" });
    expect(config.PORT).toBe(8080);
  });

  it("treats empty values as not set", () => {
    const config = loadConfig({ DATABASE_URL, GROQ_API_KEY: "", PORT: "" });
    expect(config.GROQ_API_KEY).toBeUndefined();
    expect(config.PORT).toBe(3001);
  });

  it("rejects a missing database URL with a readable message", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("rejects an unknown LLM provider", () => {
    expect(() => loadConfig({ DATABASE_URL, LLM_PROVIDER: "openai" })).toThrow(/LLM_PROVIDER/);
  });

  it("rejects a database URL that is not Postgres", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://localhost/db" })).toThrow(/DATABASE_URL/);
  });
});
