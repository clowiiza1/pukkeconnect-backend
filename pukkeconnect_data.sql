--
-- PostgreSQL database dump
--

\restrict Pj1K0Ms2Cc6YaOgMK5UsjOXEBXId4W6zJ4c1cRxaTg10LkXQHDE6FEWXi6vJFA8

-- Dumped from database version 14.19 (Homebrew)
-- Dumped by pg_dump version 14.19 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: campus_type; Type: TYPE; Schema: public; Owner: clowii
--

CREATE TYPE public.campus_type AS ENUM (
    'Mafikeng',
    'Potchefstroom',
    'Vanderbijlpark'
);


ALTER TYPE public.campus_type OWNER TO clowii;

--
-- Name: event_status_enum; Type: TYPE; Schema: public; Owner: clowii
--

CREATE TYPE public.event_status_enum AS ENUM (
    'scheduled',
    'cancelled',
    'completed'
);


ALTER TYPE public.event_status_enum OWNER TO clowii;

--
-- Name: membership_status_enum; Type: TYPE; Schema: public; Owner: clowii
--

CREATE TYPE public.membership_status_enum AS ENUM (
    'pending',
    'active',
    'rejected',
    'suspended',
    'left'
);


ALTER TYPE public.membership_status_enum OWNER TO clowii;

--
-- Name: notification_type_enum; Type: TYPE; Schema: public; Owner: clowii
--

CREATE TYPE public.notification_type_enum AS ENUM (
    'membership_update',
    'event_created',
    'event_reminder',
    'announcement',
    'post',
    'general'
);


ALTER TYPE public.notification_type_enum OWNER TO clowii;

--
-- Name: report_status_enum; Type: TYPE; Schema: public; Owner: clowii
--

CREATE TYPE public.report_status_enum AS ENUM (
    'open',
    'in_review',
    'resolved',
    'dismissed'
);


ALTER TYPE public.report_status_enum OWNER TO clowii;

--
-- Name: rsvp_status_enum; Type: TYPE; Schema: public; Owner: clowii
--

CREATE TYPE public.rsvp_status_enum AS ENUM (
    'interested',
    'going',
    'declined',
    'waitlisted',
    'attended'
);


ALTER TYPE public.rsvp_status_enum OWNER TO clowii;

--
-- Name: society_status_enum; Type: TYPE; Schema: public; Owner: clowii
--

CREATE TYPE public.society_status_enum AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE public.society_status_enum OWNER TO clowii;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: clowii
--

CREATE TYPE public.user_role AS ENUM (
    'student',
    'society_admin',
    'university_admin'
);


ALTER TYPE public.user_role OWNER TO clowii;

--
-- Name: refresh_student_profile_interests(uuid); Type: FUNCTION; Schema: public; Owner: clowii
--

CREATE FUNCTION public.refresh_student_profile_interests(p_student_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE student_profile sp
  SET interests = COALESCE(
        (
          SELECT array_agg(i.name ORDER BY si.weight DESC, i.name ASC)
          FROM student_interest si
          JOIN interest i ON i.interest_id = si.interest_id
          WHERE si.student_id = p_student_id
        ),
        ARRAY[]::text[]
      ),
      updated_at = CURRENT_TIMESTAMP
  WHERE sp.student_id = p_student_id;
END;
$$;


ALTER FUNCTION public.refresh_student_profile_interests(p_student_id uuid) OWNER TO clowii;

--
-- Name: trg_on_interest_name_change_row(); Type: FUNCTION; Schema: public; Owner: clowii
--

CREATE FUNCTION public.trg_on_interest_name_change_row() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    -- Refresh all students who have this interest_id
    UPDATE student_profile sp
    SET interests = COALESCE(
          (
            SELECT array_agg(i.name ORDER BY si.weight DESC, i.name ASC)
            FROM student_interest si
            JOIN interest i ON i.interest_id = si.interest_id
            WHERE si.student_id = sp.student_id
          ),
          ARRAY[]::text[]
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE EXISTS (
      SELECT 1 FROM student_interest si
      WHERE si.student_id = sp.student_id
        AND si.interest_id = NEW.interest_id
    );
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION public.trg_on_interest_name_change_row() OWNER TO clowii;

--
-- Name: trg_on_interest_name_change_stmt(); Type: FUNCTION; Schema: public; Owner: clowii
--

CREATE FUNCTION public.trg_on_interest_name_change_stmt() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Rebuild arrays for all students that reference any updated interest_id
  UPDATE student_profile sp
  SET interests = COALESCE(
        (
          SELECT array_agg(i.name ORDER BY si.weight DESC, i.name ASC)
          FROM student_interest si
          JOIN interest i ON i.interest_id = si.interest_id
          WHERE si.student_id = sp.student_id
        ),
        ARRAY[]::text[]
      ),
      updated_at = CURRENT_TIMESTAMP
  WHERE EXISTS (
    SELECT 1
    FROM student_interest si
    JOIN interest i ON i.interest_id = si.interest_id
    WHERE si.student_id = sp.student_id
      AND si.interest_id IN (
        SELECT DISTINCT NEW.interest_id
        FROM (
          SELECT DISTINCT interest_id
          FROM (
            -- refer to the transition table for updated rows (available in statement triggers)
            SELECT interest_id FROM interest WHERE false
          ) x
        ) y
      )
  );

  RETURN NULL;
END;
$$;


ALTER FUNCTION public.trg_on_interest_name_change_stmt() OWNER TO clowii;

--
-- Name: trg_on_student_interest_refresh(); Type: FUNCTION; Schema: public; Owner: clowii
--

CREATE FUNCTION public.trg_on_student_interest_refresh() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM refresh_student_profile_interests(NEW.student_id);
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM refresh_student_profile_interests(OLD.student_id);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION public.trg_on_student_interest_refresh() OWNER TO clowii;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO clowii;

--
-- Name: announcement; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.announcement (
    announcement_id bigint NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    created_by uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.announcement OWNER TO clowii;

--
-- Name: announcement_announcement_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.announcement_announcement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.announcement_announcement_id_seq OWNER TO clowii;

--
-- Name: announcement_announcement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.announcement_announcement_id_seq OWNED BY public.announcement.announcement_id;


--
-- Name: app_user; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.app_user (
    user_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    role public.user_role NOT NULL,
    email public.citext NOT NULL,
    phone_number character varying(20),
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    university_number character varying(10) NOT NULL,
    major text,
    campus public.campus_type,
    password_hash text
);


ALTER TABLE public.app_user OWNER TO clowii;

--
-- Name: event; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.event (
    event_id bigint NOT NULL,
    society_id bigint NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    starts_at timestamp(6) with time zone NOT NULL,
    ends_at timestamp(6) with time zone,
    location character varying(200),
    capacity integer,
    created_by uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(6) with time zone,
    status public.event_status_enum DEFAULT 'scheduled'::public.event_status_enum NOT NULL,
    poster_storage_key character varying(512)
);


ALTER TABLE public.event OWNER TO clowii;

--
-- Name: event_event_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.event_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.event_event_id_seq OWNER TO clowii;

--
-- Name: event_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.event_event_id_seq OWNED BY public.event.event_id;


--
-- Name: event_like; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.event_like (
    student_id uuid NOT NULL,
    event_id bigint NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.event_like OWNER TO clowii;

--
-- Name: event_rsvp; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.event_rsvp (
    student_id uuid NOT NULL,
    event_id bigint NOT NULL,
    status public.rsvp_status_enum NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.event_rsvp OWNER TO clowii;

--
-- Name: interest; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.interest (
    interest_id bigint NOT NULL,
    name character varying(80) NOT NULL,
    parent_id bigint
);


ALTER TABLE public.interest OWNER TO clowii;

--
-- Name: interest_interest_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.interest_interest_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.interest_interest_id_seq OWNER TO clowii;

--
-- Name: interest_interest_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.interest_interest_id_seq OWNED BY public.interest.interest_id;


--
-- Name: membership; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.membership (
    student_id uuid NOT NULL,
    society_id bigint NOT NULL,
    status public.membership_status_enum DEFAULT 'pending'::public.membership_status_enum NOT NULL,
    join_date timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.membership OWNER TO clowii;

--
-- Name: notification; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.notification (
    notification_id bigint NOT NULL,
    recipient_id uuid NOT NULL,
    type public.notification_type_enum NOT NULL,
    message text NOT NULL,
    link_url text,
    seen_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.notification OWNER TO clowii;

--
-- Name: notification_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.notification_notification_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notification_notification_id_seq OWNER TO clowii;

--
-- Name: notification_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.notification_notification_id_seq OWNED BY public.notification.notification_id;


--
-- Name: password_reset_token; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.password_reset_token (
    token_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    consumed_at timestamp(6) with time zone,
    request_ip character varying(45),
    user_agent character varying(255),
    created_at timestamp(6) with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_token OWNER TO clowii;

--
-- Name: post; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.post (
    post_id bigint NOT NULL,
    society_id bigint NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.post OWNER TO clowii;

--
-- Name: post_like; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.post_like (
    student_id uuid NOT NULL,
    post_id bigint NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.post_like OWNER TO clowii;

--
-- Name: post_media; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.post_media (
    media_id bigint NOT NULL,
    post_id bigint NOT NULL,
    storage_key character varying(512) NOT NULL,
    content_type character varying(120),
    size_bytes integer,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.post_media OWNER TO clowii;

--
-- Name: post_media_media_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.post_media_media_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.post_media_media_id_seq OWNER TO clowii;

--
-- Name: post_media_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.post_media_media_id_seq OWNED BY public.post_media.media_id;


--
-- Name: post_post_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.post_post_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.post_post_id_seq OWNER TO clowii;

--
-- Name: post_post_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.post_post_id_seq OWNED BY public.post.post_id;


--
-- Name: quiz; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.quiz (
    quiz_id bigint NOT NULL,
    society_id bigint,
    title character varying(200) NOT NULL,
    description text,
    due_at timestamp(6) with time zone,
    created_by uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.quiz OWNER TO clowii;

--
-- Name: quiz_option; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.quiz_option (
    option_id bigint NOT NULL,
    question_id bigint NOT NULL,
    label text NOT NULL,
    value text NOT NULL
);


ALTER TABLE public.quiz_option OWNER TO clowii;

--
-- Name: quiz_option_interest; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.quiz_option_interest (
    option_id bigint NOT NULL,
    interest_id bigint NOT NULL,
    weight integer DEFAULT 10 NOT NULL
);


ALTER TABLE public.quiz_option_interest OWNER TO clowii;

--
-- Name: quiz_option_option_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.quiz_option_option_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.quiz_option_option_id_seq OWNER TO clowii;

--
-- Name: quiz_option_option_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.quiz_option_option_id_seq OWNED BY public.quiz_option.option_id;


--
-- Name: quiz_question; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.quiz_question (
    question_id bigint NOT NULL,
    quiz_id bigint NOT NULL,
    prompt text NOT NULL,
    kind character varying(20) NOT NULL
);


ALTER TABLE public.quiz_question OWNER TO clowii;

--
-- Name: quiz_question_question_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.quiz_question_question_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.quiz_question_question_id_seq OWNER TO clowii;

--
-- Name: quiz_question_question_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.quiz_question_question_id_seq OWNED BY public.quiz_question.question_id;


--
-- Name: quiz_quiz_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.quiz_quiz_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.quiz_quiz_id_seq OWNER TO clowii;

--
-- Name: quiz_quiz_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.quiz_quiz_id_seq OWNED BY public.quiz.quiz_id;


--
-- Name: quiz_response; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.quiz_response (
    response_id bigint NOT NULL,
    quiz_id bigint NOT NULL,
    student_id uuid NOT NULL,
    submitted_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.quiz_response OWNER TO clowii;

--
-- Name: quiz_response_answer; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.quiz_response_answer (
    response_id bigint NOT NULL,
    question_id bigint NOT NULL,
    option_id bigint,
    free_text text,
    answer_id bigint NOT NULL
);


ALTER TABLE public.quiz_response_answer OWNER TO clowii;

--
-- Name: quiz_response_answer_answer_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.quiz_response_answer_answer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.quiz_response_answer_answer_id_seq OWNER TO clowii;

--
-- Name: quiz_response_answer_answer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.quiz_response_answer_answer_id_seq OWNED BY public.quiz_response_answer.answer_id;


--
-- Name: quiz_response_response_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.quiz_response_response_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.quiz_response_response_id_seq OWNER TO clowii;

--
-- Name: quiz_response_response_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.quiz_response_response_id_seq OWNED BY public.quiz_response.response_id;


--
-- Name: recommendation_event; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.recommendation_event (
    event_id bigint NOT NULL,
    student_id uuid NOT NULL,
    event character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(100) NOT NULL,
    payload jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.recommendation_event OWNER TO clowii;

--
-- Name: recommendation_event_event_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.recommendation_event_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.recommendation_event_event_id_seq OWNER TO clowii;

--
-- Name: recommendation_event_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.recommendation_event_event_id_seq OWNED BY public.recommendation_event.event_id;


--
-- Name: report; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.report (
    report_id bigint NOT NULL,
    reporter_id uuid NOT NULL,
    target_type character varying(30) NOT NULL,
    target_id text NOT NULL,
    reason text NOT NULL,
    status public.report_status_enum DEFAULT 'open'::public.report_status_enum NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.report OWNER TO clowii;

--
-- Name: report_report_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.report_report_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.report_report_id_seq OWNER TO clowii;

--
-- Name: report_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.report_report_id_seq OWNED BY public.report.report_id;


--
-- Name: society; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.society (
    society_id bigint NOT NULL,
    society_name character varying(150) NOT NULL,
    description text,
    category character varying(100),
    campus public.campus_type,
    created_by uuid NOT NULL,
    university_owner uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    society_admin_id uuid,
    status public.society_status_enum DEFAULT 'pending'::public.society_status_enum NOT NULL,
    logo_storage_key character varying(512)
);


ALTER TABLE public.society OWNER TO clowii;

--
-- Name: society_interest; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.society_interest (
    society_id bigint NOT NULL,
    interest_id bigint NOT NULL,
    weight integer DEFAULT 10 NOT NULL
);


ALTER TABLE public.society_interest OWNER TO clowii;

--
-- Name: society_score; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.society_score (
    society_id bigint NOT NULL,
    popularity_score integer DEFAULT 0 NOT NULL,
    freshness_score integer DEFAULT 0 NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.society_score OWNER TO clowii;

--
-- Name: society_society_id_seq; Type: SEQUENCE; Schema: public; Owner: clowii
--

CREATE SEQUENCE public.society_society_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.society_society_id_seq OWNER TO clowii;

--
-- Name: society_society_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clowii
--

ALTER SEQUENCE public.society_society_id_seq OWNED BY public.society.society_id;


--
-- Name: student_interest; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.student_interest (
    student_id uuid NOT NULL,
    interest_id bigint NOT NULL,
    weight integer DEFAULT 10 NOT NULL
);


ALTER TABLE public.student_interest OWNER TO clowii;

--
-- Name: student_profile; Type: TABLE; Schema: public; Owner: clowii
--

CREATE TABLE public.student_profile (
    student_id uuid NOT NULL,
    study_field character varying(100),
    interests text[],
    availability character varying(100),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.student_profile OWNER TO clowii;

--
-- Name: announcement announcement_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.announcement ALTER COLUMN announcement_id SET DEFAULT nextval('public.announcement_announcement_id_seq'::regclass);


--
-- Name: event event_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event ALTER COLUMN event_id SET DEFAULT nextval('public.event_event_id_seq'::regclass);


--
-- Name: interest interest_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.interest ALTER COLUMN interest_id SET DEFAULT nextval('public.interest_interest_id_seq'::regclass);


--
-- Name: notification notification_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.notification ALTER COLUMN notification_id SET DEFAULT nextval('public.notification_notification_id_seq'::regclass);


--
-- Name: post post_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post ALTER COLUMN post_id SET DEFAULT nextval('public.post_post_id_seq'::regclass);


--
-- Name: post_media media_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post_media ALTER COLUMN media_id SET DEFAULT nextval('public.post_media_media_id_seq'::regclass);


--
-- Name: quiz quiz_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz ALTER COLUMN quiz_id SET DEFAULT nextval('public.quiz_quiz_id_seq'::regclass);


--
-- Name: quiz_option option_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_option ALTER COLUMN option_id SET DEFAULT nextval('public.quiz_option_option_id_seq'::regclass);


--
-- Name: quiz_question question_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_question ALTER COLUMN question_id SET DEFAULT nextval('public.quiz_question_question_id_seq'::regclass);


--
-- Name: quiz_response response_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response ALTER COLUMN response_id SET DEFAULT nextval('public.quiz_response_response_id_seq'::regclass);


--
-- Name: quiz_response_answer answer_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response_answer ALTER COLUMN answer_id SET DEFAULT nextval('public.quiz_response_answer_answer_id_seq'::regclass);


--
-- Name: recommendation_event event_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.recommendation_event ALTER COLUMN event_id SET DEFAULT nextval('public.recommendation_event_event_id_seq'::regclass);


--
-- Name: report report_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.report ALTER COLUMN report_id SET DEFAULT nextval('public.report_report_id_seq'::regclass);


--
-- Name: society society_id; Type: DEFAULT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society ALTER COLUMN society_id SET DEFAULT nextval('public.society_society_id_seq'::regclass);


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
86123e7d-89d6-4249-b9c4-b7d3c38d1c37	baa0dca246e62d208f8e62795e54e0bcbb49769fa88f1adc11b9c47a811062c7	2025-10-20 15:01:15.944239+02	20241024120000_baseline		\N	2025-10-20 15:01:15.944239+02	0
2b94ec79-22d6-46da-925f-b890a3524cea	ed42d17dfca13b8c596d2bc33853c6c4a2a7ccb1eea942feff2e742d6be17aa4	2025-10-20 15:01:24.515262+02	20250303120000_add_post_media	\N	\N	2025-10-20 15:01:24.503942+02	1
ae1449c2-319e-4cec-ba54-4bea41df87ae	5f8cbb109ab5fc3b4b6446a82a91ffc14663c1eae261c2af250f98e75a740edc	2025-10-20 15:01:24.52245+02	20251013193236_add_password_reset_token	\N	\N	2025-10-20 15:01:24.515669+02	1
8329b8a9-7ba7-4584-943c-fd3cd5a694b8	54eee1023fcc3a2018809de5ea88470c674c7d6c2db8b2feb500023d54e4bf6d	2025-10-20 15:01:24.52457+02	20251020123418_add_post_media	\N	\N	2025-10-20 15:01:24.522992+02	1
cb8680d3-11ba-48c1-9057-a40c673ddfd5	27207bd216f8e61b4bebae473655bd5ff7bcc0148b33a802b59f16067f680faa	2025-10-20 15:29:06.107869+02	20250304100000_add_society_logo	\N	\N	2025-10-20 15:29:06.105337+02	1
13938405-6e93-4cd8-af27-ac42f19682b5	b65fe274ee0322dfb73574be26d868c03c52b22206b10d7605b249a47e501821	2025-10-21 09:59:26.713003+02	20250306093000_add_event_poster	\N	\N	2025-10-21 09:59:26.711208+02	1
\.


--
-- Data for Name: announcement; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.announcement (announcement_id, title, description, created_by, created_at) FROM stdin;
1	Welcome Week	Orientation and society stalls on the quad all week.	339c4e7d-3b94-404d-9351-314c18ad4c0d	2025-09-29 09:22:40.136284+02
2	Data Centre Maintenance	Brief outage Sunday 02:00–03:00 for upgrades.	eff08b69-0c11-46d6-86ca-3273605ac2cf	2025-09-29 09:22:40.136284+02
3	Safety Reminder	Keep valuables secure; report suspicious activity.	a1a3fd5b-f04a-4d35-b63b-c6a4849f2073	2025-09-29 09:22:40.136284+02
\.


--
-- Data for Name: app_user; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.app_user (user_id, role, email, phone_number, first_name, last_name, created_at, updated_at, university_number, major, campus, password_hash) FROM stdin;
339c4e7d-3b94-404d-9351-314c18ad4c0d	university_admin	90090001@nwu.ac.za	0829000001	Nomsa	Khoza	2025-09-29 09:12:48.146637+02	2025-09-29 09:12:48.146637+02	90090001	Admin	Potchefstroom	$2a$06$NdSJj/V4VgO6NNMQflWFMOdw0srCyYjtjI0PWwCghJAv18ez69AmS
eff08b69-0c11-46d6-86ca-3273605ac2cf	university_admin	90090002@nwu.ac.za	0829000002	Andre	Botha	2025-09-29 09:12:48.146637+02	2025-09-29 09:12:48.146637+02	90090002	Admin	Vanderbijlpark	$2a$06$5TLSjbcFFJC6aF/DGOy2PeEbBIlPg5ZQhJtgWKXmzR3vmxGQOQ4Kq
a1a3fd5b-f04a-4d35-b63b-c6a4849f2073	university_admin	90090003@nwu.ac.za	0829000003	Fatima	Mahomed	2025-09-29 09:12:48.146637+02	2025-09-29 09:12:48.146637+02	90090003	Admin	Mafikeng	$2a$06$DzIXAxrddLIce3r4H.j7MOOF/GqGGAPGVUvIeX3bFYd7bxx5gdJDC
d6e1267f-a268-4bd7-8c05-cbbf705e2956	society_admin	70010002@nwu.ac.za	0821000002	Lerato	Molefe	2025-09-29 09:12:48.146637+02	2025-09-29 09:12:48.146637+02	70010002	Marketing	Vanderbijlpark	$2a$06$LqCqQahO4R34/O7J0ZaT9Oa/Ll.qWR1fyVr7oC.nlEH/z93fmY3bq
a3ee1b06-a8a7-4a4a-9d45-104d6178b599	society_admin	70010003@nwu.ac.za	0821000003	Pieter	van Wyk	2025-09-29 09:12:48.146637+02	2025-09-29 09:12:48.146637+02	70010003	Finance	Mafikeng	$2a$06$bmuQa4cq60K0A/HCoROtfu3wrTdg3trqt13mwloquBuVswzTL5Xkm
3a71cf53-815b-47c0-80fb-5fcec24fc21e	student	40100001@nwu.ac.za	0820000001	Thandi	Mokoena	2025-09-29 09:12:48.146637+02	2025-09-29 09:12:48.146637+02	40100001	Information Technology	Potchefstroom	$2a$06$KzlfsIFksWGr8NHmpqge8ubyubVBUPbdh6GJjoTayrkUGa3s1YSPK
90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	student	40100002@nwu.ac.za	0820000002	Kabelo	Dlamini	2025-09-29 09:12:48.146637+02	2025-09-29 09:12:48.146637+02	40100002	Computer Science	Vanderbijlpark	$2a$06$NJ1w4cRyzMQ5uU.T0DRlye3VH08KQJBnqM96bjezYhulzt3a5UYQC
5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	student	40100003@nwu.ac.za	0820000003	Ayesha	Patel	2025-09-29 09:12:48.146637+02	2025-09-29 09:12:48.146637+02	40100003	Data Science	Mafikeng	$2a$06$DfO481WtaSeT3oM72oldJuuCWcY2AzAIwhVMqu592ko06P3vkJ3BC
ab547459-5a21-4e79-b490-843815a16acf	student	40100004@nwu.ac.za	0820000004	Sipho	Mabena	2025-09-29 16:35:13.218341+02	2025-09-29 16:35:13.218341+02	40100004	Software Engineering	Potchefstroom	$2a$06$KzlfsIFksWGr8NHmpqge8ubSeedHash0004
4bc88101-a30e-44dc-8fc3-6fe94b334ff1	society_admin	70010001@nwu.ac.za	0821000000	Sibusiso	Nkosi	2025-09-29 09:12:48.146637+02	2025-09-29 09:12:48.146637+02	70010001	Management	Potchefstroom	$2a$06$9D9XrznG/QaIeW73QuhF7ucVrq0RtnI1dlouE2TnsMl.jFATn0G7O
49d0f960-98d9-4a8f-b748-b9944f2bfc6b	society_admin	40100006@nwu.ac.za	0820000009	Neo	Molefe	2025-09-29 16:35:13.218341+02	2025-10-05 21:26:13.816+02	40100006	Finance	Mafikeng	$2a$06$KzlfsIFksWGr8NHmpqge8ubSeedHash0006
9b1d223f-c58f-42ef-b3a7-ca66063c34fc	society_admin	40100005@nwu.ac.za	0820000005	Zanele	Ndlovu	2025-09-29 16:35:13.218341+02	2025-10-05 21:32:46.648+02	40100005	Marketing	Vanderbijlpark	$2a$06$KzlfsIFksWGr8NHmpqge8ubSeedHash0005
9f26521c-c449-4d77-a6f9-3d2fa74c64ba	student	1234567@mynwu.ac.za	0720000000	Ella	Brown	2025-09-30 15:24:05.76+02	2025-09-30 15:24:05.76+02	1234567	Computer Science	Mafikeng	$2b$10$SxRrLqxb3E4wYo3i08DoluVrYK33MoxjpwZEZJ1dfbJrAqCTzRbM6
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	student	00000000@mynwu.ac.za	0879998765	Chris	Neuhoff	2025-09-30 16:11:34.829+02	2025-09-30 16:11:34.829+02	00000000	Robotics	Vanderbijlpark	$2b$10$X44XoKOcMavw58Ho7X80Ke/ICtf/eS15pGf9U3JX5RLJ0VddyJNTq
774b5bbe-5f4f-4258-a0da-b3890d02b6e9	society_admin	40100007@nwu.ac.za	0820000007	Carla	Botha	2025-09-29 16:35:13.218341+02	2025-10-02 15:12:24.275+02	40100007	Data Science	Potchefstroom	$2a$06$KzlfsIFksWGr8NHmpqge8ubSeedHash0007
c1bfd4a5-671f-458e-8e3d-aebf6a09e5f2	society_admin	70010004@mynwu.ac.za	0897675546	Olivia	Jaquard	2025-10-04 21:02:46.563+02	2025-10-04 21:02:46.563+02	70010004	Education	Potchefstroom	$2b$10$WpGkw/ZWcNIiApan.qRieulppoGe6LwtYsG7uepv3AZBXNGExcIYC
328d16d9-d992-4911-8a52-d5bdf2c2971e	society_admin	55555555@mynwu.ac.za	0988786679	Test	Test	2025-10-04 20:39:30.851+02	2025-10-04 20:39:30.851+02	55555555	Education	Potchefstroom	$2b$10$At9o9gZpKM2No8prmKnLvOH.4XXEzpUb.hY5u1peKQMmqc7OPciMO
76247a86-8ae2-4f5d-944e-8301b861e460	student	66666666@mynwu.ac.za	0876765445	Ingrid	Lombard	2025-10-04 21:08:38.823+02	2025-10-04 21:08:38.823+02	66666666	Photography	Mafikeng	$2b$10$En3h3norpB2nkj5G7TYPneW4KVDzPQkCiH0C/zHywNq8tRAsE29WK
bcefdb7b-6b62-4816-874d-9d20841ec7f0	society_admin	49869019@mynwu.ac.za	0876565567	Ariella	Stander	2025-10-05 15:29:23.927+02	2025-10-05 15:39:17.59+02	49869019	Business	Vanderbijlpark	$2b$10$Juqcst59Z547QYgIUQaWnunNBH90WGXlbO44MTTI0y7OshFmYPaTe
1351356d-02df-4077-8f9f-db3d8ddc90b6	society_admin	88888888@mynwu.ac.za	0887675568	Lisa	Ophelia	2025-10-05 21:04:52.44+02	2025-10-05 21:34:27.595+02	88888888	Education	Vanderbijlpark	$2b$10$c2pcJB3rcrxpNWDjl9CyM.5yVZlNxLWAq.CC8eujky5K4DSCK74la
68321c6a-9eca-4075-a006-9bcf514b7360	student	chloewilson1909@gmail.com	0823456789	Chloe	Wilson	2025-09-29 09:03:23.567+02	2025-09-29 09:03:23.567+02	12345678	Computer Science	Potchefstroom	$2b$12$cfSHDQPMFTK18RMWrKrX8epUS9iJnxv58/a5KWoDS84ooU0giHxwW
\.


--
-- Data for Name: event; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.event (event_id, society_id, title, description, starts_at, ends_at, location, capacity, created_by, created_at, updated_at, deleted_at, status, poster_storage_key) FROM stdin;
10	27	Intro to AI Workshop	Hands-on session for beginners.	2025-10-06 09:13:30.148061+02	2025-10-06 11:13:30.148061+02	Engineering Building Lab 2	60	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	2025-09-29 09:13:30.148061+02	2025-10-01 06:52:45.15+02	\N	cancelled	\N
15	16	Photography Workshop	Hey all, let's get together for our very first photography workshop session. Can't wait to see you there! P.S. Location will be moving, more communication to come soon.	2025-10-10 06:15:00+02	2025-10-10 12:15:00+02	E7-G02	20	328d16d9-d992-4911-8a52-d5bdf2c2971e	2025-10-04 21:13:46.734+02	2025-10-04 21:34:39.867+02	\N	scheduled	\N
16	27	Tech Workshop 	Hey everyone, lets collaborate and build some tech!	2025-10-15 07:00:00+02	2025-10-15 11:00:00+02	E07_G02	25	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	2025-10-05 21:13:16.389+02	2025-10-05 21:27:44.119+02	\N	scheduled	\N
11	28	Social Soccer Night	Friendly games and team selection.	2025-10-16 09:13:30.148061+02	2025-10-16 12:13:30.148061+02	Main Sports Field	40	d6e1267f-a268-4bd7-8c05-cbbf705e2956	2025-09-29 09:13:30.148061+02	2025-09-29 09:13:30.148061+02	\N	scheduled	\N
14	27	New Tech Presentations	Lets see what our bright minds have to offer	2025-10-25 09:16:00+02	2025-10-25 13:16:00+02	E7-G02	100	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	2025-10-01 07:16:35.215+02	2025-10-01 07:16:35.215+02	2025-10-02 18:47:36.214+02	scheduled	\N
17	27	AWS Summit	Very exciting opportunity!!! Please RSVP so we can properly organize buses to the AWS summit in Johannesburg. The university was kind enough to sponsor this trip.	2025-10-26 09:00:00+02	2025-10-26 14:00:00+02	A18G05	20	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	2025-10-21 10:06:34.503+02	2025-10-21 10:06:34.503+02	\N	scheduled	events/posters/society-27/4bc88101-a30e-44dc-8fc3-6fe94b334ff1/9eaf4874-1b8f-492d-b838-00ec19ebc05d.jpeg
13	27	Tech Meet & Greet	Let's get to know each other as a community.	2025-10-25 04:00:00+02	2025-10-25 09:00:00+02	A18-G05	20	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	2025-10-01 06:23:29.385+02	2025-10-21 16:03:38.77+02	\N	scheduled	events/posters/admin/339c4e7d-3b94-404d-9351-314c18ad4c0d/54339c67-84dc-44fa-9441-49328aa2205e.jpg
12	29	Startup 101	From idea to MVP.	2025-10-25 09:15:00+02	2025-10-09 11:13:30.148061+02	Business School Auditorium	100	a3ee1b06-a8a7-4a4a-9d45-104d6178b599	2025-09-29 09:13:30.148061+02	2025-10-21 16:53:27.427+02	\N	scheduled	events/posters/admin/339c4e7d-3b94-404d-9351-314c18ad4c0d/5a96510b-6b4d-484b-b3d1-e2cb8148f611.jpg
\.


--
-- Data for Name: event_like; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.event_like (student_id, event_id, created_at) FROM stdin;
3a71cf53-815b-47c0-80fb-5fcec24fc21e	10	2025-09-29 09:22:40.136284+02
90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	11	2025-09-29 09:22:40.136284+02
68321c6a-9eca-4075-a006-9bcf514b7360	10	2025-09-29 16:41:42.410256+02
\.


--
-- Data for Name: event_rsvp; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.event_rsvp (student_id, event_id, status, updated_at) FROM stdin;
3a71cf53-815b-47c0-80fb-5fcec24fc21e	10	going	2025-09-29 09:14:40.266341+02
5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	10	going	2025-09-29 09:14:40.266341+02
90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	11	going	2025-09-29 09:14:40.266341+02
68321c6a-9eca-4075-a006-9bcf514b7360	11	interested	2025-09-29 16:41:42.410256+02
68321c6a-9eca-4075-a006-9bcf514b7360	12	going	2025-09-29 16:41:42.410256+02
76247a86-8ae2-4f5d-944e-8301b861e460	15	going	2025-10-04 21:25:37.72+02
68321c6a-9eca-4075-a006-9bcf514b7360	10	going	2025-10-05 15:37:14.316+02
1351356d-02df-4077-8f9f-db3d8ddc90b6	16	going	2025-10-05 21:18:12.799+02
68321c6a-9eca-4075-a006-9bcf514b7360	17	going	2025-10-21 12:58:43.393+02
\.


--
-- Data for Name: interest; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.interest (interest_id, name, parent_id) FROM stdin;
29	Artificial Intelligence	\N
30	Sports	\N
33	Entrepreneurship	\N
34	Art & Design	\N
36	Gaming	\N
28	Technology	\N
38	Arts & Culture	\N
39	Sports & Fitness	\N
40	Outdoors & Adventure	\N
41	Volunteering & Community	\N
42	Entrepreneurship & Business	\N
43	Wellness & Faith	\N
44	AI	28
45	Coding	28
46	Cybersecurity	28
47	Robotics	28
48	Data Science	28
49	Cloud	28
50	Game Dev	28
51	UI/UX	28
52	Photography	38
31	Music	38
54	Drama	38
55	Visual Arts	38
56	Literature	38
57	Film	38
58	Dance	38
35	Debate	38
60	Running	39
61	Gym & Fitness	39
62	Football	39
63	Netball	39
64	Cricket	39
65	Basketball	39
66	Rugby	39
67	Hiking	40
69	Camping	40
70	Climbing	40
71	Cycling	40
72	Stargazing	40
73	Nature Conservation	40
74	Tutoring	41
32	Community Service	41
76	Fundraising	41
77	Animal Welfare	41
78	Sustainability	41
79	Startups	42
80	Investing	42
81	Marketing	42
82	Product Management	42
83	Consulting	42
84	Finance	42
85	Mental Wellness	43
86	Mindfulness	43
87	Yoga	43
88	Faith & Fellowship	43
89	Health & Nutrition	43
90	AI & Machine Learning	\N
91	Web Development	\N
92	Athletics	\N
93	Arts	\N
94	Design	\N
95	Business	\N
96	Environment	\N
97	Health & Wellness	\N
98	Esports	\N
99	Board Games	\N
100	Culture	\N
101	Public Speaking	\N
102	Writing	\N
\.


--
-- Data for Name: membership; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.membership (student_id, society_id, status, join_date, updated_at) FROM stdin;
328d16d9-d992-4911-8a52-d5bdf2c2971e	15	pending	2025-10-04 20:58:43.644+02	2025-10-04 20:58:43.644+02
76247a86-8ae2-4f5d-944e-8301b861e460	16	active	2025-10-04 21:11:14.669+02	2025-10-04 21:11:53.002+02
bcefdb7b-6b62-4816-874d-9d20841ec7f0	21	pending	2025-10-05 15:32:56.748+02	2025-10-05 15:32:56.748+02
1351356d-02df-4077-8f9f-db3d8ddc90b6	10	pending	2025-10-05 21:08:13.507+02	2025-10-05 21:08:13.507+02
1351356d-02df-4077-8f9f-db3d8ddc90b6	27	active	2025-10-05 21:09:02.383+02	2025-10-05 21:11:32.502+02
90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	28	active	2025-09-29 09:13:12.830975+02	2025-09-29 09:13:12.830975+02
5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	29	pending	2025-09-29 09:13:12.830975+02	2025-09-29 09:13:12.830975+02
3a71cf53-815b-47c0-80fb-5fcec24fc21e	1	pending	2025-09-30 07:24:49.952+02	2025-09-30 07:24:49.952+02
68321c6a-9eca-4075-a006-9bcf514b7360	6	pending	2025-09-30 07:26:41.925+02	2025-09-30 07:26:41.925+02
3a71cf53-815b-47c0-80fb-5fcec24fc21e	6	pending	2025-09-30 08:35:14.985+02	2025-09-30 08:35:14.985+02
68321c6a-9eca-4075-a006-9bcf514b7360	1	pending	2025-09-30 08:36:39.683+02	2025-09-30 08:36:39.683+02
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	9	pending	2025-09-30 16:13:58.59+02	2025-09-30 16:13:58.59+02
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	27	active	2025-09-30 16:14:55.022+02	2025-10-01 06:01:07.841+02
3a71cf53-815b-47c0-80fb-5fcec24fc21e	27	suspended	2025-09-30 08:33:11.826+02	2025-10-01 06:03:58.3+02
68321c6a-9eca-4075-a006-9bcf514b7360	27	active	2025-09-08 16:41:42.410256+02	2025-10-01 06:04:28.775+02
5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	27	suspended	2025-09-29 09:13:12.830975+02	2025-10-01 15:47:39.565+02
68321c6a-9eca-4075-a006-9bcf514b7360	29	left	2025-09-08 16:41:42.410256+02	2025-10-21 13:20:48.318+02
68321c6a-9eca-4075-a006-9bcf514b7360	28	left	2025-09-30 08:37:27.825+02	2025-10-21 13:44:33.859+02
\.


--
-- Data for Name: notification; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.notification (notification_id, recipient_id, type, message, link_url, seen_at, created_at) FROM stdin;
2	68321c6a-9eca-4075-a006-9bcf514b7360	announcement	Welcome Week is live — come say hi at the quad!	/announcements	2025-09-30 08:49:29.699+02	2025-09-29 09:22:40.136284+02
7	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	membership_update	Your membership status for society 1001 is now suspended	\N	\N	2025-10-01 06:00:59.872+02
8	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	membership_update	Your membership status for society 1001 is now active	\N	\N	2025-10-01 06:01:07.844+02
10	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	membership_update	Your membership status for society 1001 is now suspended	\N	\N	2025-10-01 06:03:58.308+02
12	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	membership_update	Your membership status for society 1001 is now active	\N	\N	2025-10-01 06:04:24.595+02
14	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	membership_update	Your membership status for society 1001 is now suspended	\N	\N	2025-10-01 15:47:39.572+02
15	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	event_reminder	Hey everyone, just testing	\N	\N	2025-10-01 17:13:02.696+02
18	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	event_reminder	Hey everyone, just testing	\N	\N	2025-10-01 17:13:02.696+02
19	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	general	Hey Everyone just testing again	\N	\N	2025-10-01 17:18:22.796+02
22	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	general	Hey Everyone just testing again	\N	\N	2025-10-01 17:18:22.796+02
13	68321c6a-9eca-4075-a006-9bcf514b7360	membership_update	Your membership status for society 1001 is now active	\N	2025-10-01 17:19:24.758+02	2025-10-01 06:04:28.778+02
21	68321c6a-9eca-4075-a006-9bcf514b7360	general	Hey Everyone just testing again	\N	2025-10-01 17:19:30.307+02	2025-10-01 17:18:22.796+02
17	68321c6a-9eca-4075-a006-9bcf514b7360	event_reminder	Hey everyone, just testing	\N	2025-10-01 17:19:30.307+02	2025-10-01 17:13:02.696+02
9	68321c6a-9eca-4075-a006-9bcf514b7360	membership_update	Your membership status for society 1001 is now suspended	\N	2025-10-01 17:19:30.308+02	2025-10-01 06:03:58.304+02
23	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	announcement	Hey All. A new hackathon is coming up at NWU. Please prepare appropriately.	\N	\N	2025-10-02 19:42:23.14+02
29	c1bfd4a5-671f-458e-8e3d-aebf6a09e5f2	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
30	328d16d9-d992-4911-8a52-d5bdf2c2971e	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
31	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
33	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
34	49d0f960-98d9-4a8f-b748-b9944f2bfc6b	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
35	ab547459-5a21-4e79-b490-843815a16acf	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
36	9b1d223f-c58f-42ef-b3a7-ca66063c34fc	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
37	774b5bbe-5f4f-4258-a0da-b3890d02b6e9	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
38	a1a3fd5b-f04a-4d35-b63b-c6a4849f2073	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
39	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
40	339c4e7d-3b94-404d-9351-314c18ad4c0d	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
41	90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
43	a3ee1b06-a8a7-4a4a-9d45-104d6178b599	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
44	eff08b69-0c11-46d6-86ca-3273605ac2cf	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
45	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
46	d6e1267f-a268-4bd7-8c05-cbbf705e2956	announcement	Testing	\N	\N	2025-10-04 21:34:02.088+02
28	76247a86-8ae2-4f5d-944e-8301b861e460	announcement	Testing	\N	2025-10-04 21:35:15.73+02	2025-10-04 21:34:02.088+02
26	76247a86-8ae2-4f5d-944e-8301b861e460	general	Hey all, there is a new event coming up. Remember to RSVP.	\N	2025-10-04 21:35:15.73+02	2025-10-04 21:15:04.414+02
27	76247a86-8ae2-4f5d-944e-8301b861e460	announcement	Hey all. The upcoming workshop will be moved to A18, since the original venue will be under construction then.	\N	2025-10-04 21:35:15.73+02	2025-10-04 21:33:54.594+02
25	76247a86-8ae2-4f5d-944e-8301b861e460	membership_update	Your membership status for society 16 is now active	\N	2025-10-04 21:35:15.73+02	2025-10-04 21:11:53.007+02
48	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	announcement	Hi All, please remember to pitch up for the weekly meetings.	\N	\N	2025-10-05 15:34:55.038+02
51	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	announcement	Hi All, please remember to pitch up for the weekly meetings.	\N	\N	2025-10-05 15:34:55.038+02
24	68321c6a-9eca-4075-a006-9bcf514b7360	announcement	Hey All. A new hackathon is coming up at NWU. Please prepare appropriately.	\N	2025-10-05 15:36:24.151+02	2025-10-02 19:42:23.14+02
47	68321c6a-9eca-4075-a006-9bcf514b7360	announcement	Testing	\N	2025-10-05 15:36:24.864+02	2025-10-04 21:34:02.088+02
50	68321c6a-9eca-4075-a006-9bcf514b7360	announcement	Hi All, please remember to pitch up for the weekly meetings.	\N	2025-10-05 15:36:25.651+02	2025-10-05 15:34:55.038+02
54	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	event_created	Hey everyone. New event, please RSVP.	\N	\N	2025-10-05 21:15:46.696+02
57	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	event_created	Hey everyone. New event, please RSVP.	\N	\N	2025-10-05 21:15:46.696+02
53	1351356d-02df-4077-8f9f-db3d8ddc90b6	event_created	Hey everyone. New event, please RSVP.	\N	2025-10-05 21:18:56.309+02	2025-10-05 21:15:46.696+02
52	1351356d-02df-4077-8f9f-db3d8ddc90b6	membership_update	Your membership status for society 27 is now active	\N	2025-10-05 21:18:57.29+02	2025-10-05 21:11:32.513+02
58	1351356d-02df-4077-8f9f-db3d8ddc90b6	announcement	Hey all. The location of the upcoming event will be changed to E07_G02.	\N	\N	2025-10-05 21:21:10.496+02
59	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	announcement	Hey all. The location of the upcoming event will be changed to E07_G02.	\N	\N	2025-10-05 21:21:10.496+02
60	68321c6a-9eca-4075-a006-9bcf514b7360	announcement	Hey all. The location of the upcoming event will be changed to E07_G02.	\N	\N	2025-10-05 21:21:10.496+02
61	1351356d-02df-4077-8f9f-db3d8ddc90b6	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
62	bcefdb7b-6b62-4816-874d-9d20841ec7f0	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
63	76247a86-8ae2-4f5d-944e-8301b861e460	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
64	c1bfd4a5-671f-458e-8e3d-aebf6a09e5f2	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
65	328d16d9-d992-4911-8a52-d5bdf2c2971e	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
66	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
68	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
69	774b5bbe-5f4f-4258-a0da-b3890d02b6e9	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
70	9b1d223f-c58f-42ef-b3a7-ca66063c34fc	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
71	49d0f960-98d9-4a8f-b748-b9944f2bfc6b	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
72	ab547459-5a21-4e79-b490-843815a16acf	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
73	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
20	3a71cf53-815b-47c0-80fb-5fcec24fc21e	general	Hey Everyone just testing again	\N	2025-10-20 18:42:20.9+02	2025-10-01 17:18:22.796+02
42	3a71cf53-815b-47c0-80fb-5fcec24fc21e	announcement	Testing	\N	2025-10-20 18:42:20.899+02	2025-10-04 21:34:02.088+02
16	3a71cf53-815b-47c0-80fb-5fcec24fc21e	event_reminder	Hey everyone, just testing	\N	2025-10-20 18:42:20.9+02	2025-10-01 17:13:02.696+02
49	3a71cf53-815b-47c0-80fb-5fcec24fc21e	announcement	Hi All, please remember to pitch up for the weekly meetings.	\N	2025-10-20 18:42:20.904+02	2025-10-05 15:34:55.038+02
6	3a71cf53-815b-47c0-80fb-5fcec24fc21e	membership_update	Your membership status for society 1001 is now active	\N	2025-10-20 18:42:20.903+02	2025-10-01 05:58:59.453+02
4	3a71cf53-815b-47c0-80fb-5fcec24fc21e	membership_update	Your membership status for society 1001 is now active	\N	2025-10-20 18:42:20.913+02	2025-10-01 05:57:31.898+02
3	3a71cf53-815b-47c0-80fb-5fcec24fc21e	membership_update	Your membership status for society 1001 is now active	\N	2025-10-20 18:42:20.913+02	2025-10-01 05:56:54.151+02
1	3a71cf53-815b-47c0-80fb-5fcec24fc21e	event_reminder	Reminder: Intro to AI Workshop in 7 days.	/events	2025-10-20 18:42:20.914+02	2025-09-29 09:22:40.136284+02
56	68321c6a-9eca-4075-a006-9bcf514b7360	event_created	Hey everyone. New event, please RSVP.	\N	2025-10-21 17:33:44.789+02	2025-10-05 21:15:46.696+02
74	eff08b69-0c11-46d6-86ca-3273605ac2cf	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
75	a1a3fd5b-f04a-4d35-b63b-c6a4849f2073	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
76	d6e1267f-a268-4bd7-8c05-cbbf705e2956	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
77	a3ee1b06-a8a7-4a4a-9d45-104d6178b599	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
79	90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
80	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
81	339c4e7d-3b94-404d-9351-314c18ad4c0d	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
82	68321c6a-9eca-4075-a006-9bcf514b7360	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	\N	2025-10-05 21:21:50.441+02
5	3a71cf53-815b-47c0-80fb-5fcec24fc21e	membership_update	Your membership status for society 1001 is now suspended	\N	2025-10-20 18:42:20.89+02	2025-10-01 05:57:53.827+02
11	3a71cf53-815b-47c0-80fb-5fcec24fc21e	membership_update	Your membership status for society 1001 is now suspended	\N	2025-10-20 18:42:20.889+02	2025-10-01 06:03:58.31+02
55	3a71cf53-815b-47c0-80fb-5fcec24fc21e	event_created	Hey everyone. New event, please RSVP.	\N	2025-10-20 18:42:20.889+02	2025-10-05 21:15:46.696+02
78	3a71cf53-815b-47c0-80fb-5fcec24fc21e	announcement	Hey everyone, please remember to prioritize the health and safety of others.	\N	2025-10-20 18:42:20.9+02	2025-10-05 21:21:50.441+02
\.


--
-- Data for Name: password_reset_token; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.password_reset_token (token_id, user_id, token_hash, expires_at, consumed_at, request_ip, user_agent, created_at) FROM stdin;
cd97a467-f708-45db-8a99-3b6d2bdab1a8	68321c6a-9eca-4075-a006-9bcf514b7360	$2b$12$8LX3Gs.e.UQb.DBhTr/fDeE55rCqqFVsm2u6evTndr8Xl8.Fms1Ky	2025-10-13 20:44:04.056+02	2025-10-13 20:26:07.022+02	::ffff:127.0.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0	2025-10-13 20:14:04.063+02
89dbcca3-ef95-41cd-a571-eb72d1646a37	68321c6a-9eca-4075-a006-9bcf514b7360	$2b$12$.6MRlAqoWi.tjOf11jFEPOi4vCOqlbJyD/I1ITVREd5xDte9kdCcO	2025-10-13 20:56:07.019+02	2025-10-13 20:28:41.017+02	::ffff:127.0.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0	2025-10-13 20:26:07.03+02
\.


--
-- Data for Name: post; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.post (post_id, society_id, author_id, content, created_at, updated_at) FROM stdin;
12	29	a3ee1b06-a8a7-4a4a-9d45-104d6178b599	💡 Pitch Night on Thursday — prizes for top 3 ideas.	2025-09-29 09:13:19.114029+02	2025-09-29 09:13:19.114029+02
11	28	d6e1267f-a268-4bd7-8c05-cbbf705e2956	Five-a-side! Everyone welcome!	2025-09-29 09:13:19.114029+02	2025-09-29 09:13:19.114029+02
10	27	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	Welcome to NWU Tech Society! Hackathon next month. Rsvp please!	2025-09-29 09:13:19.114029+02	2025-10-01 15:53:05.74+02
15	16	328d16d9-d992-4911-8a52-d5bdf2c2971e	Hey all, a new event is coming up. Make sure to RSVP!	2025-10-04 21:14:37.754+02	2025-10-04 21:14:37.754+02
16	27	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	Hey everyone. There is a new workshop up and coming, please RSVP.	2025-10-05 21:14:52.728+02	2025-10-05 21:28:40.632+02
\.


--
-- Data for Name: post_like; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.post_like (student_id, post_id, created_at) FROM stdin;
3a71cf53-815b-47c0-80fb-5fcec24fc21e	10	2025-09-29 09:13:24.864883+02
1351356d-02df-4077-8f9f-db3d8ddc90b6	16	2025-10-05 21:17:53.809+02
68321c6a-9eca-4075-a006-9bcf514b7360	10	2025-10-13 12:27:27.481+02
\.


--
-- Data for Name: post_media; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.post_media (media_id, post_id, storage_key, content_type, size_bytes, "position", created_at) FROM stdin;
\.


--
-- Data for Name: quiz; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.quiz (quiz_id, society_id, title, description, due_at, created_by, created_at) FROM stdin;
2	\N	Find Your Perfect Society Match	Answer these questions to discover societies that align with your interests and availability.	\N	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	2025-09-30 15:24:23.617+02
1	27	Find Your Tech Tribe	Short quiz to match you with sub-clubs.	2025-10-13 09:22:40.136284+02	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	2025-09-29 09:22:40.136284+02
\.


--
-- Data for Name: quiz_option; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.quiz_option (option_id, question_id, label, value) FROM stdin;
1	1	Build things	build
2	1	Compete in hackathons	hack
3	1	Attend talks	talks
4	2	AI/ML	ai
5	2	Cybersecurity	security
6	2	Gaming	gaming
7	3	Technology & Coding	tech
8	3	AI & Robotics	ai
9	3	Sports & Fitness	sports
10	3	Arts & Culture	arts
11	3	Business & Entrepreneurship	business
12	3	Gaming & Esports	gaming
13	3	Community Service	community
14	4	Weekday mornings	weekday_morning
15	4	Weekday afternoons	weekday_afternoon
16	4	Weekday evenings	weekday_evening
17	4	Weekends	weekend
18	4	Flexible schedule	flexible
19	5	Small intimate groups (5-15 people)	small
20	5	Medium groups (15-30 people)	medium
21	5	Large communities (30+ people)	large
22	5	No preference	any
23	6	Learn new skills	skills
24	6	Make friends & network	social
25	6	Career development	career
26	6	Fun & relaxation	fun
27	6	Make a difference	impact
\.


--
-- Data for Name: quiz_option_interest; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.quiz_option_interest (option_id, interest_id, weight) FROM stdin;
1	28	10
2	29	10
3	35	10
4	29	10
5	28	10
6	36	10
7	28	15
7	45	15
7	91	15
8	90	15
8	47	15
8	28	15
9	30	15
9	62	15
9	65	15
9	97	15
10	93	15
10	31	15
10	54	15
10	52	15
10	94	15
11	95	15
11	33	15
11	84	15
11	81	15
12	36	15
12	98	15
12	99	15
13	32	15
13	96	15
23	28	10
23	95	10
23	93	10
24	32	10
24	100	10
25	95	10
25	33	10
25	28	10
26	36	10
26	30	10
26	93	10
27	32	10
27	96	10
\.


--
-- Data for Name: quiz_question; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.quiz_question (question_id, quiz_id, prompt, kind) FROM stdin;
1	1	Which activity do you prefer?	single
2	1	Pick your favorite theme:	single
3	2	Which activities interest you most?	multi
4	2	When are you usually available for society activities?	single
5	2	What size of group do you prefer?	single
6	2	What do you hope to gain from joining a society?	multi
7	2	Tell us about any other interests or hobbies you have (optional)	text
\.


--
-- Data for Name: quiz_response; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.quiz_response (response_id, quiz_id, student_id, submitted_at) FROM stdin;
1	1	3a71cf53-815b-47c0-80fb-5fcec24fc21e	2025-09-29 09:22:40.136284+02
5	2	3a71cf53-815b-47c0-80fb-5fcec24fc21e	2025-09-30 15:46:39.797+02
7	2	f51aa29e-f4c9-4300-9b0f-0fe4506e0597	2025-09-30 16:12:52.333+02
9	2	328d16d9-d992-4911-8a52-d5bdf2c2971e	2025-10-04 20:50:19.704+02
10	2	76247a86-8ae2-4f5d-944e-8301b861e460	2025-10-04 21:11:06.822+02
11	2	bcefdb7b-6b62-4816-874d-9d20841ec7f0	2025-10-05 15:31:47.902+02
12	2	1351356d-02df-4077-8f9f-db3d8ddc90b6	2025-10-05 21:07:21.275+02
\.


--
-- Data for Name: quiz_response_answer; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.quiz_response_answer (response_id, question_id, option_id, free_text, answer_id) FROM stdin;
1	1	1	\N	1
1	2	4	\N	2
5	3	10	\N	3
5	3	11	\N	4
5	4	17	\N	5
5	5	21	\N	6
5	6	26	\N	7
7	3	7	\N	14
7	3	8	\N	15
7	4	17	\N	16
7	5	19	\N	17
7	6	23	\N	18
7	6	24	\N	19
9	3	10	\N	25
9	4	17	\N	26
9	5	20	\N	27
9	6	24	\N	28
10	3	10	\N	29
10	4	17	\N	30
10	5	20	\N	31
10	6	24	\N	32
11	3	9	\N	33
11	3	11	\N	34
11	4	17	\N	35
11	5	20	\N	36
11	6	24	\N	37
11	6	23	\N	38
12	3	9	\N	39
12	4	15	\N	40
12	5	19	\N	41
12	6	23	\N	42
\.


--
-- Data for Name: recommendation_event; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.recommendation_event (event_id, student_id, event, entity_type, entity_id, payload, created_at) FROM stdin;
1	3a71cf53-815b-47c0-80fb-5fcec24fc21e	view	post	10	{"source": "feed"}	2025-09-29 09:22:40.136284+02
2	5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	click	event	10	{"source": "calendar"}	2025-09-29 09:22:40.136284+02
\.


--
-- Data for Name: report; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.report (report_id, reporter_id, target_type, target_id, reason, status, created_at, updated_at) FROM stdin;
1	90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	post	12	Spam / off-topic	resolved	2025-09-29 09:22:40.136284+02	2025-09-29 09:22:40.136284+02
\.


--
-- Data for Name: society; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.society (society_id, society_name, description, category, campus, created_by, university_owner, created_at, updated_at, society_admin_id, status, logo_storage_key) FROM stdin;
1	AI & Robotics Club	Workshops and projects in AI, ML, and robotics.	Technology	Potchefstroom	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	\N	2025-09-29 20:58:13.435464+02	2025-09-29 20:58:13.435464+02	\N	approved	\N
2	Cybersecurity Society	Ethical hacking, CTFs, and cyber defense training.	Technology	Vanderbijlpark	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	\N	2025-09-29 20:58:13.435464+02	2025-09-29 20:58:13.435464+02	\N	approved	\N
3	Data Science Guild	Data analysis, Kaggle challenges, and competitions.	Technology	Mafikeng	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	\N	2025-09-29 20:58:13.435464+02	2025-09-29 20:58:13.435464+02	\N	approved	\N
4	Cloud & DevOps Society	AWS, GCP, Docker, and modern infrastructure.	Technology	Potchefstroom	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	\N	2025-09-29 20:58:13.435464+02	2025-09-29 20:58:13.435464+02	\N	approved	\N
28	Campus Sports Club	Social sports and inter-faculty leagues.	Sports	Vanderbijlpark	d6e1267f-a268-4bd7-8c05-cbbf705e2956	\N	2025-09-29 09:13:03.196632+02	2025-09-29 09:13:03.196632+02	\N	approved	\N
29	Entrepreneurship Hub	Pitch nights, startup workshops, and networking.	Business	Mafikeng	a3ee1b06-a8a7-4a4a-9d45-104d6178b599	\N	2025-09-29 09:13:03.196632+02	2025-09-29 09:13:03.196632+02	\N	approved	\N
33	Logistics	Welcome to the society. This is a great place for people studying logistics and who want to experience more of it.	Logistics	Vanderbijlpark	bcefdb7b-6b62-4816-874d-9d20841ec7f0	\N	2025-10-05 15:40:56.824+02	2025-10-05 21:24:40.164+02	49d0f960-98d9-4a8f-b748-b9944f2bfc6b	approved	\N
5	Game Development League	Unity/Unreal projects, jams, and esports collab.	Technology	Vanderbijlpark	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	\N	2025-09-29 20:58:13.435464+02	2025-09-29 20:58:13.435464+02	\N	approved	\N
6	UI/UX Design Circle	Design thinking, prototyping, and usability testing.	Technology	Potchefstroom	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	\N	2025-09-29 20:58:13.435464+02	2025-09-29 20:58:13.435464+02	\N	approved	\N
7	AI & Machine Learning Society	Exploring artificial intelligence, neural networks, and machine learning algorithms through workshops and projects.	Technology	Potchefstroom	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.285+02	2025-09-30 15:57:36.285+02	\N	approved	\N
8	Web Developers Guild	Build amazing web applications using modern frameworks like React, Vue, and Node.js.	Technology	Mafikeng	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.292+02	2025-09-30 15:57:36.292+02	\N	approved	\N
9	Robotics Club	Design, build, and program robots for competitions and real-world applications.	Technology	Vanderbijlpark	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.296+02	2025-09-30 15:57:36.296+02	\N	approved	\N
10	NWU Football Club	Competitive football training and inter-campus matches. All skill levels welcome!	Sports	Potchefstroom	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.299+02	2025-09-30 15:57:36.299+02	\N	approved	\N
11	Basketball Society	Weekly training sessions, friendly matches, and tournament participation.	Sports	Mafikeng	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.302+02	2025-09-30 15:57:36.302+02	\N	approved	\N
12	Rugby Eagles	Join our proud rugby tradition with professional coaching and competitive play.	Sports	Vanderbijlpark	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.306+02	2025-09-30 15:57:36.306+02	\N	approved	\N
13	Athletics & Track Club	Training for sprints, distance running, and field events with certified coaches.	Sports	Potchefstroom	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.309+02	2025-09-30 15:57:36.309+02	\N	approved	\N
14	Music Society	For musicians of all genres - from classical to contemporary. Jam sessions, concerts, and collaborations.	Arts	Mafikeng	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.312+02	2025-09-30 15:57:36.312+02	\N	approved	\N
15	Drama & Theatre Club	Perform in plays, musicals, and experimental theatre. Acting workshops included.	Arts	Potchefstroom	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.314+02	2025-09-30 15:57:36.314+02	\N	approved	\N
17	Design Collective	Graphic design, UI/UX, and digital art. Collaborate on creative projects.	Arts	Mafikeng	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.32+02	2025-09-30 15:57:36.32+02	\N	approved	\N
18	Finance & Investment Club	Learn about stocks, crypto, and personal finance through real trading simulations.	Business	Mafikeng	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.322+02	2025-09-30 15:57:36.322+02	\N	approved	\N
19	Community Outreach Program	Make a difference through volunteering, tutoring, and community development projects.	Community Service	Mafikeng	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.328+02	2025-09-30 15:57:36.328+02	\N	approved	\N
20	Environmental Action Group	Sustainability initiatives, tree planting, and environmental advocacy campaigns.	Community Service	Potchefstroom	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.33+02	2025-09-30 15:57:36.33+02	\N	approved	\N
21	Health & Wellness Society	Promote mental and physical health through yoga, meditation, and wellness workshops.	Community Service	Vanderbijlpark	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.332+02	2025-09-30 15:57:36.332+02	\N	approved	\N
22	Esports Arena	Competitive gaming tournaments in League, Valorant, CS2, and more. Join our esports teams!	Gaming	Potchefstroom	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.334+02	2025-09-30 15:57:36.334+02	\N	approved	\N
23	Board Game Guild	Weekly game nights featuring strategy games, D&D campaigns, and card games.	Gaming	Mafikeng	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.337+02	2025-09-30 15:57:36.337+02	\N	approved	\N
16	Photography Society	Learn photography techniques, participate in photo walks, and showcase your work.	Arts	Vanderbijlpark	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.317+02	2025-10-04 21:06:44.225+02	328d16d9-d992-4911-8a52-d5bdf2c2971e	approved	\N
24	Debate Society	Sharpen your argumentation skills through competitive debates and public speaking.	Culture	Vanderbijlpark	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.339+02	2025-09-30 15:57:36.339+02	\N	approved	\N
25	Writers Circle	Creative writing workshops, poetry readings, and publishing opportunities.	Culture	Mafikeng	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.341+02	2025-10-02 15:12:38.802+02	774b5bbe-5f4f-4258-a0da-b3890d02b6e9	approved	\N
26	Public Speaking Club	Develop confidence and presentation skills through Toastmasters-style meetings.	Culture	Potchefstroom	9f26521c-c449-4d77-a6f9-3d2fa74c64ba	\N	2025-09-30 15:57:36.343+02	2025-10-02 14:37:01.713+02	\N	approved	\N
27	NWU Tech Society	Tech talks, hackathons, and tech projects!	Technology	Potchefstroom	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	\N	2025-09-29 09:13:03.196632+02	2025-10-20 17:36:25.594+02	4bc88101-a30e-44dc-8fc3-6fe94b334ff1	approved	societies/logos/27/339c4e7d-3b94-404d-9351-314c18ad4c0d/db3af578-f392-4f04-8123-60c811053c57.png
34	Music & Arts Society	Open to all that like to dabble in Music and Arts.	Arts	Mafikeng	1351356d-02df-4077-8f9f-db3d8ddc90b6	\N	2025-10-05 21:35:45.18+02	2025-10-20 17:45:30.994+02	1351356d-02df-4077-8f9f-db3d8ddc90b6	approved	societies/logos/34/339c4e7d-3b94-404d-9351-314c18ad4c0d/24391a45-c224-433b-bd0d-da39927d751e.jpeg
35	Gaming Society	Society for Gamers	Gaming	Vanderbijlpark	339c4e7d-3b94-404d-9351-314c18ad4c0d	\N	2025-10-20 18:30:28.939+02	2025-10-20 18:30:36.338+02	c1bfd4a5-671f-458e-8e3d-aebf6a09e5f2	approved	societies/logos/35/339c4e7d-3b94-404d-9351-314c18ad4c0d/a4826b78-32e9-44a9-9825-6e3a3297660a.png
\.


--
-- Data for Name: society_interest; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.society_interest (society_id, interest_id, weight) FROM stdin;
1	47	12
1	45	9
1	44	12
2	46	12
2	45	12
3	48	12
3	45	9
3	44	12
4	49	12
4	45	12
4	44	9
5	50	12
5	45	12
5	44	9
6	51	12
6	45	9
7	47	15
7	45	15
7	28	15
7	90	15
8	94	15
8	45	15
8	28	15
8	91	15
9	45	15
9	90	15
9	28	15
9	47	15
10	92	15
10	97	15
10	30	15
10	62	15
11	92	15
11	97	15
11	30	15
11	65	15
12	92	15
12	97	15
12	30	15
12	66	15
13	97	15
13	30	15
13	92	15
14	100	15
14	93	15
14	31	15
15	101	15
15	100	15
15	93	15
15	54	15
16	94	15
16	93	15
16	52	15
17	91	15
17	28	15
17	93	15
17	94	15
18	33	15
18	95	15
18	84	15
19	97	15
19	96	15
19	32	15
20	32	15
20	96	15
21	30	15
21	32	15
21	97	15
22	28	15
22	36	15
22	98	15
23	100	15
23	36	15
23	99	15
24	100	15
24	101	15
24	35	15
25	93	15
25	100	15
25	102	15
26	95	15
26	100	15
26	35	15
26	101	15
27	36	10
27	29	10
27	28	10
28	32	10
28	30	10
29	35	10
29	34	10
29	33	10
\.


--
-- Data for Name: society_score; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.society_score (society_id, popularity_score, freshness_score, updated_at) FROM stdin;
1	5	9	2025-09-29 20:58:13.435464+02
2	13	11	2025-09-29 20:58:13.435464+02
3	5	11	2025-09-29 20:58:13.435464+02
4	13	14	2025-09-29 20:58:13.435464+02
5	9	13	2025-09-29 20:58:13.435464+02
6	12	12	2025-09-29 20:58:13.435464+02
27	28	12	2025-09-29 16:41:42.410256+02
28	18	14	2025-09-29 09:22:40.136284+02
29	15	10	2025-09-29 16:41:42.410256+02
\.


--
-- Data for Name: student_interest; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.student_interest (student_id, interest_id, weight) FROM stdin;
3a71cf53-815b-47c0-80fb-5fcec24fc21e	28	12
3a71cf53-815b-47c0-80fb-5fcec24fc21e	29	12
90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	30	10
90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	36	10
5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	31	11
5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	33	11
68321c6a-9eca-4075-a006-9bcf514b7360	28	9
68321c6a-9eca-4075-a006-9bcf514b7360	36	9
ab547459-5a21-4e79-b490-843815a16acf	44	12
ab547459-5a21-4e79-b490-843815a16acf	45	11
ab547459-5a21-4e79-b490-843815a16acf	50	10
9b1d223f-c58f-42ef-b3a7-ca66063c34fc	52	9
9b1d223f-c58f-42ef-b3a7-ca66063c34fc	81	9
9b1d223f-c58f-42ef-b3a7-ca66063c34fc	54	9
49d0f960-98d9-4a8f-b748-b9944f2bfc6b	79	11
49d0f960-98d9-4a8f-b748-b9944f2bfc6b	84	10
49d0f960-98d9-4a8f-b748-b9944f2bfc6b	83	9
774b5bbe-5f4f-4258-a0da-b3890d02b6e9	48	9
774b5bbe-5f4f-4258-a0da-b3890d02b6e9	67	10
774b5bbe-5f4f-4258-a0da-b3890d02b6e9	60	10
68321c6a-9eca-4075-a006-9bcf514b7360	44	12
68321c6a-9eca-4075-a006-9bcf514b7360	45	11
68321c6a-9eca-4075-a006-9bcf514b7360	47	11
68321c6a-9eca-4075-a006-9bcf514b7360	48	12
68321c6a-9eca-4075-a006-9bcf514b7360	52	9
68321c6a-9eca-4075-a006-9bcf514b7360	67	10
68321c6a-9eca-4075-a006-9bcf514b7360	79	11
68321c6a-9eca-4075-a006-9bcf514b7360	84	10
3a71cf53-815b-47c0-80fb-5fcec24fc21e	93	15
3a71cf53-815b-47c0-80fb-5fcec24fc21e	31	15
3a71cf53-815b-47c0-80fb-5fcec24fc21e	54	15
3a71cf53-815b-47c0-80fb-5fcec24fc21e	52	15
3a71cf53-815b-47c0-80fb-5fcec24fc21e	94	15
3a71cf53-815b-47c0-80fb-5fcec24fc21e	95	15
3a71cf53-815b-47c0-80fb-5fcec24fc21e	33	15
3a71cf53-815b-47c0-80fb-5fcec24fc21e	84	15
3a71cf53-815b-47c0-80fb-5fcec24fc21e	81	15
3a71cf53-815b-47c0-80fb-5fcec24fc21e	36	10
3a71cf53-815b-47c0-80fb-5fcec24fc21e	30	10
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	28	15
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	45	15
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	91	15
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	90	15
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	47	15
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	95	10
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	93	10
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	32	10
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	100	10
328d16d9-d992-4911-8a52-d5bdf2c2971e	93	15
328d16d9-d992-4911-8a52-d5bdf2c2971e	31	15
328d16d9-d992-4911-8a52-d5bdf2c2971e	54	15
328d16d9-d992-4911-8a52-d5bdf2c2971e	52	15
328d16d9-d992-4911-8a52-d5bdf2c2971e	94	15
328d16d9-d992-4911-8a52-d5bdf2c2971e	32	10
328d16d9-d992-4911-8a52-d5bdf2c2971e	100	10
76247a86-8ae2-4f5d-944e-8301b861e460	93	15
76247a86-8ae2-4f5d-944e-8301b861e460	31	15
76247a86-8ae2-4f5d-944e-8301b861e460	54	15
76247a86-8ae2-4f5d-944e-8301b861e460	52	15
76247a86-8ae2-4f5d-944e-8301b861e460	94	15
76247a86-8ae2-4f5d-944e-8301b861e460	32	10
76247a86-8ae2-4f5d-944e-8301b861e460	100	10
bcefdb7b-6b62-4816-874d-9d20841ec7f0	30	15
bcefdb7b-6b62-4816-874d-9d20841ec7f0	62	15
bcefdb7b-6b62-4816-874d-9d20841ec7f0	65	15
bcefdb7b-6b62-4816-874d-9d20841ec7f0	97	15
bcefdb7b-6b62-4816-874d-9d20841ec7f0	95	15
bcefdb7b-6b62-4816-874d-9d20841ec7f0	33	15
bcefdb7b-6b62-4816-874d-9d20841ec7f0	84	15
bcefdb7b-6b62-4816-874d-9d20841ec7f0	81	15
bcefdb7b-6b62-4816-874d-9d20841ec7f0	28	10
bcefdb7b-6b62-4816-874d-9d20841ec7f0	93	10
bcefdb7b-6b62-4816-874d-9d20841ec7f0	32	10
bcefdb7b-6b62-4816-874d-9d20841ec7f0	100	10
1351356d-02df-4077-8f9f-db3d8ddc90b6	30	15
1351356d-02df-4077-8f9f-db3d8ddc90b6	62	15
1351356d-02df-4077-8f9f-db3d8ddc90b6	65	15
1351356d-02df-4077-8f9f-db3d8ddc90b6	97	15
1351356d-02df-4077-8f9f-db3d8ddc90b6	28	10
1351356d-02df-4077-8f9f-db3d8ddc90b6	95	10
1351356d-02df-4077-8f9f-db3d8ddc90b6	93	10
\.


--
-- Data for Name: student_profile; Type: TABLE DATA; Schema: public; Owner: clowii
--

COPY public.student_profile (student_id, study_field, interests, availability, created_at, updated_at) FROM stdin;
5d1441c6-40eb-4bbb-b4ff-8db39dbd0701	Data Science	{Entrepreneurship,Music}	Evenings	2025-09-29 09:13:03.196632+02	2025-09-29 17:26:55.551226+02
3a71cf53-815b-47c0-80fb-5fcec24fc21e	Information Technology	{"Artificial Intelligence",Arts,Business,Design,Drama,Entrepreneurship,Finance,Gaming,Marketing,Music,Photography,Sports,Technology}	\N	2025-09-29 09:13:03.196632+02	2025-09-30 15:46:39.872+02
9b1d223f-c58f-42ef-b3a7-ca66063c34fc	Marketing	{Drama,Marketing,Photography}	Weekends	2025-09-29 16:35:13.218341+02	2025-09-29 17:26:55.551226+02
ab547459-5a21-4e79-b490-843815a16acf	Software Engineering	{AI,Coding,"Game Dev"}	Weeknights	2025-09-29 16:35:13.218341+02	2025-09-29 17:26:55.551226+02
49d0f960-98d9-4a8f-b748-b9944f2bfc6b	Finance	{Startups,Finance,Consulting}	Evenings	2025-09-29 16:35:13.218341+02	2025-09-29 17:26:55.551226+02
90e155ab-d2de-46e6-a1ca-0c5ba7243ca7	Computer Science	{Gaming,Sports}	Weekends	2025-09-29 09:13:03.196632+02	2025-09-29 17:26:55.551226+02
774b5bbe-5f4f-4258-a0da-b3890d02b6e9	Data Science	{Hiking,Running,"Data Science"}	Mornings	2025-09-29 16:35:13.218341+02	2025-09-29 17:26:55.551226+02
68321c6a-9eca-4075-a006-9bcf514b7360	Computer Science	{AI,"Data Science",Coding,Robotics,Startups,Finance,Hiking,Gaming,Photography,Technology,Film,Cloud}	\N	2025-09-29 09:03:23.579+02	2025-09-29 18:24:53.612+02
1351356d-02df-4077-8f9f-db3d8ddc90b6	Education	{Basketball,Business,Football,"Health & Wellness",Sports,Technology}	\N	2025-10-05 21:04:52.454+02	2025-10-05 21:08:35.61+02
f51aa29e-f4c9-4300-9b0f-0fe4506e0597	Robotics	{"AI & Machine Learning",Coding,"Community Service",Culture,Robotics,Technology,"Web Development"}	\N	2025-09-30 16:11:34.84+02	2025-09-30 16:13:35.159+02
9f26521c-c449-4d77-a6f9-3d2fa74c64ba	Computer Science	{}	\N	2025-09-30 15:24:23.571+02	2025-09-30 15:24:23.571+02
76247a86-8ae2-4f5d-944e-8301b861e460	Photography	{Arts,"Community Service",Culture,Design,Drama,Music,Photography}	\N	2025-10-04 21:08:38.833+02	2025-10-04 21:11:06.871+02
bcefdb7b-6b62-4816-874d-9d20841ec7f0	Business	{Arts,Basketball,Business,"Community Service",Culture,Entrepreneurship,Finance,Football,"Health & Wellness",Marketing,Sports,Technology}	\N	2025-10-05 15:29:23.951+02	2025-10-05 15:31:47.967+02
328d16d9-d992-4911-8a52-d5bdf2c2971e	Education	{Arts,"Community Service",Culture,Design,Drama,Music,Photography}	\N	2025-10-04 20:39:30.875+02	2025-10-04 20:50:19.779+02
c1bfd4a5-671f-458e-8e3d-aebf6a09e5f2	Education	{}	\N	2025-10-04 21:02:46.572+02	2025-10-04 21:02:46.572+02
\.


--
-- Name: announcement_announcement_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.announcement_announcement_id_seq', 3, true);


--
-- Name: event_event_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.event_event_id_seq', 17, true);


--
-- Name: interest_interest_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.interest_interest_id_seq', 102, true);


--
-- Name: notification_notification_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.notification_notification_id_seq', 82, true);


--
-- Name: post_media_media_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.post_media_media_id_seq', 1, false);


--
-- Name: post_post_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.post_post_id_seq', 16, true);


--
-- Name: quiz_option_option_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.quiz_option_option_id_seq', 27, true);


--
-- Name: quiz_question_question_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.quiz_question_question_id_seq', 7, true);


--
-- Name: quiz_quiz_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.quiz_quiz_id_seq', 2, true);


--
-- Name: quiz_response_answer_answer_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.quiz_response_answer_answer_id_seq', 42, true);


--
-- Name: quiz_response_response_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.quiz_response_response_id_seq', 12, true);


--
-- Name: recommendation_event_event_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.recommendation_event_event_id_seq', 2, true);


--
-- Name: report_report_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.report_report_id_seq', 1, true);


--
-- Name: society_society_id_seq; Type: SEQUENCE SET; Schema: public; Owner: clowii
--

SELECT pg_catalog.setval('public.society_society_id_seq', 35, true);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: announcement announcement_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_pkey PRIMARY KEY (announcement_id);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (user_id);


--
-- Name: event_like event_like_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event_like
    ADD CONSTRAINT event_like_pkey PRIMARY KEY (student_id, event_id);


--
-- Name: event event_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_pkey PRIMARY KEY (event_id);


--
-- Name: event_rsvp event_rsvp_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event_rsvp
    ADD CONSTRAINT event_rsvp_pkey PRIMARY KEY (student_id, event_id);


--
-- Name: interest interest_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.interest
    ADD CONSTRAINT interest_pkey PRIMARY KEY (interest_id);


--
-- Name: membership membership_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_pkey PRIMARY KEY (student_id, society_id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (notification_id);


--
-- Name: password_reset_token password_reset_token_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_pkey PRIMARY KEY (token_id);


--
-- Name: post_like post_like_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post_like
    ADD CONSTRAINT post_like_pkey PRIMARY KEY (student_id, post_id);


--
-- Name: post_media post_media_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_pkey PRIMARY KEY (media_id);


--
-- Name: post post_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_pkey PRIMARY KEY (post_id);


--
-- Name: quiz_option_interest quiz_option_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_option_interest
    ADD CONSTRAINT quiz_option_interest_pkey PRIMARY KEY (option_id, interest_id);


--
-- Name: quiz_option quiz_option_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_option
    ADD CONSTRAINT quiz_option_pkey PRIMARY KEY (option_id);


--
-- Name: quiz quiz_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz
    ADD CONSTRAINT quiz_pkey PRIMARY KEY (quiz_id);


--
-- Name: quiz_question quiz_question_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_question
    ADD CONSTRAINT quiz_question_pkey PRIMARY KEY (question_id);


--
-- Name: quiz_response_answer quiz_response_answer_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response_answer
    ADD CONSTRAINT quiz_response_answer_pkey PRIMARY KEY (answer_id);


--
-- Name: quiz_response_answer quiz_response_answer_unique; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response_answer
    ADD CONSTRAINT quiz_response_answer_unique UNIQUE (response_id, question_id, option_id);


--
-- Name: quiz_response quiz_response_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response
    ADD CONSTRAINT quiz_response_pkey PRIMARY KEY (response_id);


--
-- Name: recommendation_event recommendation_event_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.recommendation_event
    ADD CONSTRAINT recommendation_event_pkey PRIMARY KEY (event_id);


--
-- Name: report report_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT report_pkey PRIMARY KEY (report_id);


--
-- Name: society_interest society_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society_interest
    ADD CONSTRAINT society_interest_pkey PRIMARY KEY (society_id, interest_id);


--
-- Name: society society_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society
    ADD CONSTRAINT society_pkey PRIMARY KEY (society_id);


--
-- Name: society_score society_score_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society_score
    ADD CONSTRAINT society_score_pkey PRIMARY KEY (society_id);


--
-- Name: student_interest student_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.student_interest
    ADD CONSTRAINT student_interest_pkey PRIMARY KEY (student_id, interest_id);


--
-- Name: student_profile student_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.student_profile
    ADD CONSTRAINT student_profile_pkey PRIMARY KEY (student_id);


--
-- Name: app_user_email_key; Type: INDEX; Schema: public; Owner: clowii
--

CREATE UNIQUE INDEX app_user_email_key ON public.app_user USING btree (email);


--
-- Name: idx_event_society_time; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_event_society_time ON public.event USING btree (society_id, starts_at);


--
-- Name: idx_interest_parent; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_interest_parent ON public.interest USING btree (parent_id);


--
-- Name: idx_membership_society_status; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_membership_society_status ON public.membership USING btree (society_id, status);


--
-- Name: idx_notification_recipient; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_notification_recipient ON public.notification USING btree (recipient_id, created_at DESC);


--
-- Name: idx_password_reset_token_expiry; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_password_reset_token_expiry ON public.password_reset_token USING btree (expires_at);


--
-- Name: idx_password_reset_token_user; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_password_reset_token_user ON public.password_reset_token USING btree (user_id, created_at DESC);


--
-- Name: idx_post_media_post; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_post_media_post ON public.post_media USING btree (post_id);


--
-- Name: idx_post_society_time; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_post_society_time ON public.post USING btree (society_id, created_at);


--
-- Name: idx_qoi_interest; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_qoi_interest ON public.quiz_option_interest USING btree (interest_id);


--
-- Name: idx_re_evt_student_time; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_re_evt_student_time ON public.recommendation_event USING btree (student_id, created_at DESC);


--
-- Name: idx_report_status; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_report_status ON public.report USING btree (status);


--
-- Name: idx_society_interest_interest; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_society_interest_interest ON public.society_interest USING btree (interest_id);


--
-- Name: idx_society_score_freshness; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_society_score_freshness ON public.society_score USING btree (freshness_score DESC);


--
-- Name: idx_society_score_popularity; Type: INDEX; Schema: public; Owner: clowii
--

CREATE INDEX idx_society_score_popularity ON public.society_score USING btree (popularity_score DESC);


--
-- Name: interest_name_key; Type: INDEX; Schema: public; Owner: clowii
--

CREATE UNIQUE INDEX interest_name_key ON public.interest USING btree (name);


--
-- Name: quiz_response_quiz_id_student_id_key; Type: INDEX; Schema: public; Owner: clowii
--

CREATE UNIQUE INDEX quiz_response_quiz_id_student_id_key ON public.quiz_response USING btree (quiz_id, student_id);


--
-- Name: society_society_name_key; Type: INDEX; Schema: public; Owner: clowii
--

CREATE UNIQUE INDEX society_society_name_key ON public.society USING btree (society_name);


--
-- Name: uq_app_user_university_number; Type: INDEX; Schema: public; Owner: clowii
--

CREATE UNIQUE INDEX uq_app_user_university_number ON public.app_user USING btree (university_number);


--
-- Name: uq_interest_name; Type: INDEX; Schema: public; Owner: clowii
--

CREATE UNIQUE INDEX uq_interest_name ON public.interest USING btree (name);


--
-- Name: uq_post_media_storage_key; Type: INDEX; Schema: public; Owner: clowii
--

CREATE UNIQUE INDEX uq_post_media_storage_key ON public.post_media USING btree (storage_key);


--
-- Name: interest tg_interest_name_change_row; Type: TRIGGER; Schema: public; Owner: clowii
--

CREATE TRIGGER tg_interest_name_change_row AFTER UPDATE OF name ON public.interest FOR EACH ROW EXECUTE FUNCTION public.trg_on_interest_name_change_row();


--
-- Name: student_interest tg_student_interest_refresh; Type: TRIGGER; Schema: public; Owner: clowii
--

CREATE TRIGGER tg_student_interest_refresh AFTER INSERT OR DELETE OR UPDATE ON public.student_interest FOR EACH ROW EXECUTE FUNCTION public.trg_on_student_interest_refresh();


--
-- Name: announcement announcement_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id);


--
-- Name: event event_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id);


--
-- Name: event_like event_like_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event_like
    ADD CONSTRAINT event_like_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(event_id) ON DELETE CASCADE;


--
-- Name: event_like event_like_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event_like
    ADD CONSTRAINT event_like_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profile(student_id) ON DELETE CASCADE;


--
-- Name: event_rsvp event_rsvp_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event_rsvp
    ADD CONSTRAINT event_rsvp_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(event_id) ON DELETE CASCADE;


--
-- Name: event_rsvp event_rsvp_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event_rsvp
    ADD CONSTRAINT event_rsvp_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profile(student_id) ON DELETE CASCADE;


--
-- Name: event event_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON DELETE CASCADE;


--
-- Name: announcement fk_announcement_app_user; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT fk_announcement_app_user FOREIGN KEY (created_by) REFERENCES public.app_user(user_id);


--
-- Name: event fk_event_created_by_app_user; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT fk_event_created_by_app_user FOREIGN KEY (created_by) REFERENCES public.app_user(user_id);


--
-- Name: interest fk_interest_parent; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.interest
    ADD CONSTRAINT fk_interest_parent FOREIGN KEY (parent_id) REFERENCES public.interest(interest_id) ON DELETE SET NULL;


--
-- Name: notification fk_notification_recipient_app_user; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT fk_notification_recipient_app_user FOREIGN KEY (recipient_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE;


--
-- Name: post fk_post_author_app_user; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post
    ADD CONSTRAINT fk_post_author_app_user FOREIGN KEY (author_id) REFERENCES public.app_user(user_id);


--
-- Name: quiz fk_quiz_created_by_app_user; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz
    ADD CONSTRAINT fk_quiz_created_by_app_user FOREIGN KEY (created_by) REFERENCES public.app_user(user_id);


--
-- Name: report fk_report_reporter_app_user; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT fk_report_reporter_app_user FOREIGN KEY (reporter_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE;


--
-- Name: society fk_society_admin; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society
    ADD CONSTRAINT fk_society_admin FOREIGN KEY (society_admin_id) REFERENCES public.app_user(user_id) ON DELETE SET NULL;


--
-- Name: society fk_society_created_by_app_user; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society
    ADD CONSTRAINT fk_society_created_by_app_user FOREIGN KEY (created_by) REFERENCES public.app_user(user_id);


--
-- Name: society fk_society_university_owner_app_user; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society
    ADD CONSTRAINT fk_society_university_owner_app_user FOREIGN KEY (university_owner) REFERENCES public.app_user(user_id) ON DELETE SET NULL;


--
-- Name: student_profile fk_student_profile_user; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.student_profile
    ADD CONSTRAINT fk_student_profile_user FOREIGN KEY (student_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE;


--
-- Name: membership membership_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON DELETE CASCADE;


--
-- Name: membership membership_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profile(student_id) ON DELETE CASCADE;


--
-- Name: notification notification_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE;


--
-- Name: password_reset_token password_reset_token_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE;


--
-- Name: post post_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.app_user(user_id);


--
-- Name: post_like post_like_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post_like
    ADD CONSTRAINT post_like_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.post(post_id) ON DELETE CASCADE;


--
-- Name: post_like post_like_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post_like
    ADD CONSTRAINT post_like_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profile(student_id) ON DELETE CASCADE;


--
-- Name: post_media post_media_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.post(post_id) ON DELETE CASCADE;


--
-- Name: post post_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON DELETE CASCADE;


--
-- Name: quiz quiz_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz
    ADD CONSTRAINT quiz_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id);


--
-- Name: quiz_option_interest quiz_option_interest_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_option_interest
    ADD CONSTRAINT quiz_option_interest_interest_id_fkey FOREIGN KEY (interest_id) REFERENCES public.interest(interest_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quiz_option_interest quiz_option_interest_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_option_interest
    ADD CONSTRAINT quiz_option_interest_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.quiz_option(option_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quiz_option quiz_option_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_option
    ADD CONSTRAINT quiz_option_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.quiz_question(question_id) ON DELETE CASCADE;


--
-- Name: quiz_question quiz_question_quiz_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_question
    ADD CONSTRAINT quiz_question_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quiz(quiz_id) ON DELETE CASCADE;


--
-- Name: quiz_response_answer quiz_response_answer_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response_answer
    ADD CONSTRAINT quiz_response_answer_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.quiz_option(option_id) ON DELETE CASCADE;


--
-- Name: quiz_response_answer quiz_response_answer_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response_answer
    ADD CONSTRAINT quiz_response_answer_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.quiz_question(question_id) ON DELETE CASCADE;


--
-- Name: quiz_response_answer quiz_response_answer_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response_answer
    ADD CONSTRAINT quiz_response_answer_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.quiz_response(response_id) ON DELETE CASCADE;


--
-- Name: quiz_response quiz_response_quiz_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response
    ADD CONSTRAINT quiz_response_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quiz(quiz_id) ON DELETE CASCADE;


--
-- Name: quiz_response quiz_response_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz_response
    ADD CONSTRAINT quiz_response_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profile(student_id) ON DELETE CASCADE;


--
-- Name: quiz quiz_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.quiz
    ADD CONSTRAINT quiz_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON DELETE CASCADE;


--
-- Name: recommendation_event recommendation_event_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.recommendation_event
    ADD CONSTRAINT recommendation_event_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profile(student_id) ON DELETE CASCADE;


--
-- Name: report report_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT report_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE;


--
-- Name: society society_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society
    ADD CONSTRAINT society_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id);


--
-- Name: society_interest society_interest_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society_interest
    ADD CONSTRAINT society_interest_interest_id_fkey FOREIGN KEY (interest_id) REFERENCES public.interest(interest_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: society_interest society_interest_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society_interest
    ADD CONSTRAINT society_interest_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: society_score society_score_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.society_score
    ADD CONSTRAINT society_score_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: student_interest student_interest_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.student_interest
    ADD CONSTRAINT student_interest_interest_id_fkey FOREIGN KEY (interest_id) REFERENCES public.interest(interest_id) ON DELETE CASCADE;


--
-- Name: student_interest student_interest_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.student_interest
    ADD CONSTRAINT student_interest_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profile(student_id) ON DELETE CASCADE;


--
-- Name: student_profile student_profile_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clowii
--

ALTER TABLE ONLY public.student_profile
    ADD CONSTRAINT student_profile_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Pj1K0Ms2Cc6YaOgMK5UsjOXEBXId4W6zJ4c1cRxaTg10LkXQHDE6FEWXi6vJFA8

