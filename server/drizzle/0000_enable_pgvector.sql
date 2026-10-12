-- Custom migration: turn on the pgvector extension.
-- It adds the `vector` column type and the distance operators (<=> for cosine distance).
-- This must run before any table that has a vector column is created.
CREATE EXTENSION IF NOT EXISTS vector;
