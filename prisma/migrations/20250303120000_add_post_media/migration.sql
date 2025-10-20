-- Create post_media table for storing S3 object references attached to posts
CREATE TABLE "post_media" (
  "media_id" BIGSERIAL PRIMARY KEY,
  "post_id" BIGINT NOT NULL,
  "storage_key" VARCHAR(512) NOT NULL,
  "content_type" VARCHAR(120),
  "size_bytes" INTEGER,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_post_media_post" FOREIGN KEY ("post_id") REFERENCES "post"("post_id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "idx_post_media_post" ON "post_media" ("post_id");
CREATE UNIQUE INDEX "uq_post_media_storage_key" ON "post_media" ("storage_key");
