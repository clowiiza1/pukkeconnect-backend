-- RenameForeignKey
ALTER TABLE "public"."post_media" RENAME CONSTRAINT "fk_post_media_post" TO "post_media_post_id_fkey";
