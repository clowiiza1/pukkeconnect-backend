-- DropForeignKey
ALTER TABLE "public"."society_interest" DROP CONSTRAINT "society_interest_society_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."society_score" DROP CONSTRAINT "society_score_society_id_fkey";

-- DropIndex
DROP INDEX "public"."idx_society_status";

-- AddForeignKey
ALTER TABLE "public"."society_interest" ADD CONSTRAINT "society_interest_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "public"."society"("society_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."society_score" ADD CONSTRAINT "society_score_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "public"."society"("society_id") ON DELETE CASCADE ON UPDATE CASCADE;
