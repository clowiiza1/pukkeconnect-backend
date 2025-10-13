-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "public"."campus_type" AS ENUM ('Mafikeng', 'Potchefstroom', 'Vanderbijlpark');

-- CreateEnum
CREATE TYPE "public"."event_status_enum" AS ENUM ('scheduled', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "public"."membership_status_enum" AS ENUM ('pending', 'active', 'rejected', 'suspended', 'left');

-- CreateEnum
CREATE TYPE "public"."notification_type_enum" AS ENUM ('membership_update', 'event_created', 'event_reminder', 'announcement', 'post', 'general');

-- CreateEnum
CREATE TYPE "public"."report_status_enum" AS ENUM ('open', 'in_review', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "public"."rsvp_status_enum" AS ENUM ('interested', 'going', 'declined', 'waitlisted', 'attended');

-- CreateEnum
CREATE TYPE "public"."society_status_enum" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "public"."user_role" AS ENUM ('student', 'society_admin', 'university_admin');

-- CreateTable
CREATE TABLE "public"."announcement" (
    "announcement_id" BIGSERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("announcement_id")
);

-- CreateTable
CREATE TABLE "public"."app_user" (
    "user_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "role" "public"."user_role" NOT NULL,
    "email" CITEXT NOT NULL,
    "phone_number" VARCHAR(20),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "university_number" VARCHAR(10) NOT NULL,
    "major" TEXT,
    "campus" "public"."campus_type",
    "password_hash" TEXT,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."event" (
    "event_id" BIGSERIAL NOT NULL,
    "society_id" BIGINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "location" VARCHAR(200),
    "capacity" INTEGER,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "status" "public"."event_status_enum" NOT NULL DEFAULT 'scheduled',

    CONSTRAINT "event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "public"."event_like" (
    "student_id" UUID NOT NULL,
    "event_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_like_pkey" PRIMARY KEY ("student_id","event_id")
);

-- CreateTable
CREATE TABLE "public"."event_rsvp" (
    "student_id" UUID NOT NULL,
    "event_id" BIGINT NOT NULL,
    "status" "public"."rsvp_status_enum" NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_rsvp_pkey" PRIMARY KEY ("student_id","event_id")
);

-- CreateTable
CREATE TABLE "public"."interest" (
    "interest_id" BIGSERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "parent_id" BIGINT,

    CONSTRAINT "interest_pkey" PRIMARY KEY ("interest_id")
);

-- CreateTable
CREATE TABLE "public"."membership" (
    "student_id" UUID NOT NULL,
    "society_id" BIGINT NOT NULL,
    "status" "public"."membership_status_enum" NOT NULL DEFAULT 'pending',
    "join_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("student_id","society_id")
);

-- CreateTable
CREATE TABLE "public"."notification" (
    "notification_id" BIGSERIAL NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" "public"."notification_type_enum" NOT NULL,
    "message" TEXT NOT NULL,
    "link_url" TEXT,
    "seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "public"."password_reset_token" (
    "token_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "request_ip" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "public"."post" (
    "post_id" BIGSERIAL NOT NULL,
    "society_id" BIGINT NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_pkey" PRIMARY KEY ("post_id")
);

-- CreateTable
CREATE TABLE "public"."post_like" (
    "student_id" UUID NOT NULL,
    "post_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_like_pkey" PRIMARY KEY ("student_id","post_id")
);

-- CreateTable
CREATE TABLE "public"."quiz" (
    "quiz_id" BIGSERIAL NOT NULL,
    "society_id" BIGINT,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_pkey" PRIMARY KEY ("quiz_id")
);

-- CreateTable
CREATE TABLE "public"."quiz_option" (
    "option_id" BIGSERIAL NOT NULL,
    "question_id" BIGINT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "quiz_option_pkey" PRIMARY KEY ("option_id")
);

-- CreateTable
CREATE TABLE "public"."quiz_option_interest" (
    "option_id" BIGINT NOT NULL,
    "interest_id" BIGINT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "quiz_option_interest_pkey" PRIMARY KEY ("option_id","interest_id")
);

-- CreateTable
CREATE TABLE "public"."quiz_question" (
    "question_id" BIGSERIAL NOT NULL,
    "quiz_id" BIGINT NOT NULL,
    "prompt" TEXT NOT NULL,
    "kind" VARCHAR(20) NOT NULL,

    CONSTRAINT "quiz_question_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "public"."quiz_response" (
    "response_id" BIGSERIAL NOT NULL,
    "quiz_id" BIGINT NOT NULL,
    "student_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_response_pkey" PRIMARY KEY ("response_id")
);

-- CreateTable
CREATE TABLE "public"."quiz_response_answer" (
    "response_id" BIGINT NOT NULL,
    "question_id" BIGINT NOT NULL,
    "option_id" BIGINT,
    "free_text" TEXT,
    "answer_id" BIGSERIAL NOT NULL,

    CONSTRAINT "quiz_response_answer_pkey" PRIMARY KEY ("answer_id")
);

-- CreateTable
CREATE TABLE "public"."recommendation_event" (
    "event_id" BIGSERIAL NOT NULL,
    "student_id" UUID NOT NULL,
    "event" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "public"."report" (
    "report_id" BIGSERIAL NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "public"."report_status_enum" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "public"."society" (
    "society_id" BIGSERIAL NOT NULL,
    "society_name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "campus" "public"."campus_type",
    "created_by" UUID NOT NULL,
    "university_owner" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "society_admin_id" UUID,
    "status" "public"."society_status_enum" NOT NULL DEFAULT 'pending',

    CONSTRAINT "society_pkey" PRIMARY KEY ("society_id")
);

-- CreateTable
CREATE TABLE "public"."society_interest" (
    "society_id" BIGINT NOT NULL,
    "interest_id" BIGINT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "society_interest_pkey" PRIMARY KEY ("society_id","interest_id")
);

-- CreateTable
CREATE TABLE "public"."society_score" (
    "society_id" BIGINT NOT NULL,
    "popularity_score" INTEGER NOT NULL DEFAULT 0,
    "freshness_score" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "society_score_pkey" PRIMARY KEY ("society_id")
);

-- CreateTable
CREATE TABLE "public"."student_interest" (
    "student_id" UUID NOT NULL,
    "interest_id" BIGINT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "student_interest_pkey" PRIMARY KEY ("student_id","interest_id")
);

-- CreateTable
CREATE TABLE "public"."student_profile" (
    "student_id" UUID NOT NULL,
    "study_field" VARCHAR(100),
    "interests" TEXT[],
    "availability" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_profile_pkey" PRIMARY KEY ("student_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "public"."app_user"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_user_university_number" ON "public"."app_user"("university_number" ASC);

-- CreateIndex
CREATE INDEX "idx_event_society_time" ON "public"."event"("society_id" ASC, "starts_at" ASC);

-- CreateIndex
CREATE INDEX "idx_interest_parent" ON "public"."interest"("parent_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "interest_name_key" ON "public"."interest"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_interest_name" ON "public"."interest"("name" ASC);

-- CreateIndex
CREATE INDEX "idx_membership_society_status" ON "public"."membership"("society_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "idx_notification_recipient" ON "public"."notification"("recipient_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_password_reset_token_expiry" ON "public"."password_reset_token"("expires_at" ASC);

-- CreateIndex
CREATE INDEX "idx_password_reset_token_user" ON "public"."password_reset_token"("user_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_post_society_time" ON "public"."post"("society_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "idx_qoi_interest" ON "public"."quiz_option_interest"("interest_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "quiz_response_quiz_id_student_id_key" ON "public"."quiz_response"("quiz_id" ASC, "student_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "quiz_response_answer_unique" ON "public"."quiz_response_answer"("response_id" ASC, "question_id" ASC, "option_id" ASC);

-- CreateIndex
CREATE INDEX "idx_re_evt_student_time" ON "public"."recommendation_event"("student_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_report_status" ON "public"."report"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_society_status" ON "public"."society"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "society_society_name_key" ON "public"."society"("society_name" ASC);

-- CreateIndex
CREATE INDEX "idx_society_interest_interest" ON "public"."society_interest"("interest_id" ASC);

-- CreateIndex
CREATE INDEX "idx_society_score_freshness" ON "public"."society_score"("freshness_score" DESC);

-- CreateIndex
CREATE INDEX "idx_society_score_popularity" ON "public"."society_score"("popularity_score" DESC);

-- AddForeignKey
ALTER TABLE "public"."announcement" ADD CONSTRAINT "announcement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."announcement" ADD CONSTRAINT "fk_announcement_app_user" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."event" ADD CONSTRAINT "event_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."event" ADD CONSTRAINT "event_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "public"."society"("society_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."event" ADD CONSTRAINT "fk_event_created_by_app_user" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."event_like" ADD CONSTRAINT "event_like_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."event_like" ADD CONSTRAINT "event_like_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profile"("student_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."event_rsvp" ADD CONSTRAINT "event_rsvp_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."event_rsvp" ADD CONSTRAINT "event_rsvp_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profile"("student_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."interest" ADD CONSTRAINT "fk_interest_parent" FOREIGN KEY ("parent_id") REFERENCES "public"."interest"("interest_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."membership" ADD CONSTRAINT "membership_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "public"."society"("society_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."membership" ADD CONSTRAINT "membership_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profile"("student_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."notification" ADD CONSTRAINT "fk_notification_recipient_app_user" FOREIGN KEY ("recipient_id") REFERENCES "public"."app_user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."notification" ADD CONSTRAINT "notification_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."app_user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."post" ADD CONSTRAINT "fk_post_author_app_user" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."post" ADD CONSTRAINT "post_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."post" ADD CONSTRAINT "post_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "public"."society"("society_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."post_like" ADD CONSTRAINT "post_like_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."post"("post_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."post_like" ADD CONSTRAINT "post_like_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profile"("student_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz" ADD CONSTRAINT "fk_quiz_created_by_app_user" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz" ADD CONSTRAINT "quiz_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz" ADD CONSTRAINT "quiz_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "public"."society"("society_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz_option" ADD CONSTRAINT "quiz_option_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_question"("question_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz_option_interest" ADD CONSTRAINT "quiz_option_interest_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "public"."interest"("interest_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quiz_option_interest" ADD CONSTRAINT "quiz_option_interest_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."quiz_option"("option_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quiz_question" ADD CONSTRAINT "quiz_question_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("quiz_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz_response" ADD CONSTRAINT "quiz_response_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("quiz_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz_response" ADD CONSTRAINT "quiz_response_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profile"("student_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz_response_answer" ADD CONSTRAINT "quiz_response_answer_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."quiz_option"("option_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz_response_answer" ADD CONSTRAINT "quiz_response_answer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_question"("question_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quiz_response_answer" ADD CONSTRAINT "quiz_response_answer_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."quiz_response"("response_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."recommendation_event" ADD CONSTRAINT "recommendation_event_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profile"("student_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."report" ADD CONSTRAINT "fk_report_reporter_app_user" FOREIGN KEY ("reporter_id") REFERENCES "public"."app_user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."report" ADD CONSTRAINT "report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."app_user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."society" ADD CONSTRAINT "fk_society_admin" FOREIGN KEY ("society_admin_id") REFERENCES "public"."app_user"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."society" ADD CONSTRAINT "fk_society_created_by_app_user" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."society" ADD CONSTRAINT "fk_society_university_owner_app_user" FOREIGN KEY ("university_owner") REFERENCES "public"."app_user"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."society" ADD CONSTRAINT "society_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."society_interest" ADD CONSTRAINT "society_interest_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "public"."interest"("interest_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."society_interest" ADD CONSTRAINT "society_interest_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "public"."society"("society_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."society_score" ADD CONSTRAINT "society_score_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "public"."society"("society_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."student_interest" ADD CONSTRAINT "student_interest_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "public"."interest"("interest_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."student_interest" ADD CONSTRAINT "student_interest_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profile"("student_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."student_profile" ADD CONSTRAINT "fk_student_profile_user" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."student_profile" ADD CONSTRAINT "student_profile_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

