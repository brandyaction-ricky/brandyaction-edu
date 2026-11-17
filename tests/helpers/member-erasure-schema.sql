-- Schema-only regression fixture for local erasure paths; no member data.
create table private.campus_student_connections(
 "id" text,
 "owner_id" uuid,
 "enrollment_id" uuid,
 "employee_id" text,
 "telegram_url" text,
 "verifier" text,
 "confirmation" text,
 "pair_until" timestamp with time zone,
 "confirmed_at" timestamp with time zone,
 "revoked_at" timestamp with time zone
);
create table private.campus_student_reporting_enabled(
 "enabled" boolean
);
create table private.edu_campus_community_flow_receipts(
 "actor_id" uuid,
 "request_id" uuid,
 "command" jsonb,
 "result" jsonb
);
create table private.edu_campus_community_receipts(
 "actor_id" uuid,
 "request_id" uuid,
 "command" jsonb,
 "result" jsonb,
 "created_at" timestamp with time zone
);
create table private.edu_campus_office_connectors(
 "connector_id" text,
 "owner_id" uuid,
 "key_version" text,
 "enabled" boolean,
 "created_at" timestamp with time zone
);
create table private.edu_campus_office_dispatch_receipts(
 "owner_id" uuid,
 "request_id" uuid,
 "command" jsonb,
 "result" jsonb
);
create table private.edu_campus_office_dispatches(
 "id" uuid,
 "owner_id" uuid,
 "enrollment_id" uuid,
 "job_id" uuid,
 "job_revision" integer,
 "connector_id" text,
 "key_version" text,
 "payload" jsonb,
 "operation" text,
 "status" text,
 "revision" integer,
 "attempts" integer,
 "operation_attempts" integer,
 "cancel_requested" boolean,
 "lease_id" uuid,
 "lease_expires_at" timestamp with time zone,
 "available_at" timestamp with time zone,
 "last_code" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table private.edu_campus_office_events(
 "connector_id" text,
 "event_id" uuid,
 "job_id" uuid,
 "payload_hash" text,
 "result" jsonb,
 "created_at" timestamp with time zone
);
create table private.edu_campus_office_receipts(
 "actor_id" uuid,
 "request_id" uuid,
 "command" jsonb,
 "result" jsonb,
 "created_at" timestamp with time zone
);
create table public.course_content_claims(
 "id" uuid,
 "user_id" uuid,
 "lesson_id" uuid,
 "source" text,
 "medium" text,
 "campaign" text,
 "claimed_at" timestamp with time zone
);
create table public.crm_member_tags(
 "member_id" uuid,
 "tag_id" uuid,
 "assigned_by" uuid,
 "assigned_at" timestamp with time zone,
 "assignment_source" text,
 "rule_key" text
);
create table public.customer_journey_events(
 "id" uuid,
 "session_id" text,
 "user_id" uuid,
 "event_name" text,
 "path" text,
 "target_path" text,
 "element_label" text,
 "metadata" jsonb,
 "occurred_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
create table public.edu_ai_calls(
 "request_id" uuid,
 "attempt" integer,
 "model" text,
 "status" text,
 "input_tokens" bigint,
 "cached_tokens" bigint,
 "output_tokens" bigint,
 "estimated_usd" numeric(16,8),
 "rates" jsonb,
 "created_at" timestamp with time zone,
 "finished_at" timestamp with time zone
);
create table public.edu_ai_cohort_settings(
 "cohort_id" uuid,
 "enabled" boolean,
 "daily_limit" integer,
 "student_daily_limit" integer,
 "updated_at" timestamp with time zone
);
create table public.edu_ai_conversation_turns(
 "request_id" uuid,
 "conversation_id" uuid,
 "question" text,
 "image_id" uuid,
 "answer" jsonb,
 "status" text,
 "error" text,
 "created_at" timestamp with time zone,
 "helpful" boolean,
 "incorrect" boolean
);
create table public.edu_ai_conversations(
 "id" uuid,
 "actor_id" uuid,
 "enrollment_id" uuid,
 "lesson_id" uuid,
 "last_question" text,
 "updated_at" timestamp with time zone
);
create table public.edu_ai_requests(
 "id" uuid,
 "actor_id" uuid,
 "cohort_id" uuid,
 "enrollment_id" uuid,
 "lesson_id" uuid,
 "question_id" uuid,
 "mode" text,
 "fingerprint" text,
 "status" text,
 "created_at" timestamp with time zone,
 "finished_at" timestamp with time zone
);
create table public.edu_campus_activity_batches(
 "id" uuid,
 "session_id" uuid,
 "scope" text,
 "user_id" uuid,
 "events" jsonb,
 "dwell" jsonb,
 "occurred_at" timestamp with time zone
);
create table public.edu_campus_analytics_settings(
 "id" boolean,
 "enabled" boolean,
 "updated_at" timestamp with time zone,
 "updated_by" uuid
);
create table public.edu_campus_archive_commands(
 "request_id" uuid,
 "actor_id" uuid,
 "entry_id" uuid,
 "command_hash" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_archive_entries(
 "id" uuid,
 "user_id" uuid,
 "enrollment_id" uuid,
 "kind" text,
 "title" text,
 "body" text,
 "url" text,
 "source_kind" text,
 "source_id" uuid,
 "source_revision" integer,
 "source_snapshot" jsonb,
 "revision" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_blocks(
 "owner_id" uuid,
 "target_id" uuid,
 "cohort_id" uuid,
 "created_at" timestamp with time zone
);
create table public.edu_campus_business_case_events(
 "id" uuid,
 "case_id" uuid,
 "actor_id" uuid,
 "action" text,
 "command_hash" text,
 "purposes" text[],
 "decision" text,
 "note" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_business_cases(
 "id" uuid,
 "user_id" uuid,
 "enrollment_id" uuid,
 "title" text,
 "industry" text,
 "summary" text,
 "limits" text,
 "evidence" jsonb,
 "granted_purposes" text[],
 "allowed_purposes" text[],
 "status" text,
 "revision" integer,
 "reviewed_revision" integer,
 "reviewer_note" text,
 "reviewed_at" timestamp with time zone,
 "consent_version" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_business_records(
 "id" uuid,
 "user_id" uuid,
 "enrollment_id" uuid,
 "kind" text,
 "title" text,
 "payload" jsonb,
 "revision" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "archived_at" timestamp with time zone,
 "last_command_id" uuid,
 "creation_fingerprint" text
);
create table public.edu_campus_business_review_links(
 "id" uuid,
 "user_id" uuid,
 "enrollment_id" uuid,
 "token_hash" text,
 "title" text,
 "artifact_url" text,
 "question" text,
 "public_consent" boolean,
 "created_at" timestamp with time zone,
 "expires_at" timestamp with time zone,
 "revoked_at" timestamp with time zone,
 "response_count" integer,
 "last_response_at" timestamp with time zone,
 "revision" integer
);
create table public.edu_campus_business_review_replies(
 "id" uuid,
 "link_id" uuid,
 "clarity" integer,
 "answer" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_comments(
 "id" uuid,
 "post_id" uuid,
 "author_id" uuid,
 "alias" text,
 "body" text,
 "post_revision" integer,
 "hidden" boolean,
 "created_at" timestamp with time zone
);
create table public.edu_campus_community_flow_history(
 "id" uuid,
 "post_id" uuid,
 "entity_id" uuid,
 "kind" text,
 "actor_id" uuid,
 "action" text,
 "status" text,
 "note" text,
 "revision" integer,
 "created_at" timestamp with time zone
);
create table public.edu_campus_demo_questions(
 "id" uuid,
 "slot_id" uuid,
 "author_id" uuid,
 "alias" text,
 "body" text,
 "answer" text,
 "revision" integer,
 "created_at" timestamp with time zone,
 "answered_at" timestamp with time zone
);
create table public.edu_campus_demo_slots(
 "id" uuid,
 "post_id" uuid,
 "cohort_id" uuid,
 "presenter_id" uuid,
 "starts_at" timestamp with time zone,
 "minutes" integer,
 "status" text,
 "revision" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_exchanges(
 "id" uuid,
 "post_id" uuid,
 "cohort_id" uuid,
 "proposer_id" uuid,
 "recipient_id" uuid,
 "alias" text,
 "proposal" text,
 "status" text,
 "result_note" text,
 "revision" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_feedback_acknowledgments(
 "comment_id" uuid,
 "owner_id" uuid,
 "useful" boolean,
 "decision" text,
 "reason" text,
 "applied_revision" integer,
 "revision" integer,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_focus_sessions(
 "id" uuid,
 "user_id" uuid,
 "enrollment_id" uuid,
 "lesson_id" uuid,
 "lesson_version" text,
 "action_text" text,
 "result_note" text,
 "next_step" text,
 "status" text,
 "elapsed_seconds" integer,
 "running_since" timestamp with time zone,
 "revision" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_launches(
 "id" uuid,
 "owner_id" uuid,
 "enrollment_id" uuid,
 "cohort_id" uuid,
 "rule_version" text,
 "evidence" jsonb,
 "created_at" timestamp with time zone
);
create table public.edu_campus_moderation_log(
 "id" uuid,
 "actor_id" uuid,
 "post_id" uuid,
 "comment_id" uuid,
 "action" text,
 "reason" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_office_bookings(
 "id" uuid,
 "session_id" uuid,
 "user_id" uuid,
 "status" text,
 "checked_in_at" timestamp with time zone,
 "queue_status" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_office_employees(
 "owner_id" uuid,
 "employee_id" text,
 "profile" jsonb
);
create table public.edu_campus_office_history(
 "id" uuid,
 "job_id" uuid,
 "revision" integer,
 "actor_type" text,
 "action" text,
 "status" text,
 "note" text,
 "draft_text" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_office_inbox_signals(
 "enrollment_id" uuid,
 "owner_id" uuid,
 "version" bigint
);
create table public.edu_campus_office_jobs(
 "id" uuid,
 "owner_id" uuid,
 "enrollment_id" uuid,
 "objective" text,
 "material_urls" text[],
 "output_type" text,
 "status" text,
 "revision" integer,
 "draft_text" text,
 "draft_url" text,
 "review_note" text,
 "error_note" text,
 "connector_id" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "employee_id" text
);
create table public.edu_campus_office_sessions(
 "id" uuid,
 "cohort_id" uuid,
 "title" text,
 "kind" text,
 "starts_at" timestamp with time zone,
 "ends_at" timestamp with time zone,
 "capacity" integer,
 "location_url" text,
 "student_created" boolean,
 "shared_goal" text,
 "live_until" timestamp with time zone,
 "status" text,
 "created_by" uuid,
 "created_at" timestamp with time zone
);
create table public.edu_campus_personal_offices(
 "owner_id" uuid,
 "document" jsonb,
 "revision" uuid,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_portfolio_file_access_log(
 "id" uuid,
 "file_id" uuid,
 "owner_id" uuid,
 "actor_id" uuid,
 "visibility" text,
 "revision" integer,
 "reason" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_portfolio_files(
 "id" uuid,
 "owner_id" uuid,
 "post_id" uuid,
 "post_revision" integer,
 "name" text,
 "size" integer,
 "content_type" text,
 "path" text,
 "state" text,
 "sha256" text,
 "created_at" timestamp with time zone,
 "ready_at" timestamp with time zone,
 "visibility" text,
 "revision" integer,
 "shared_at" timestamp with time zone
);
create table public.edu_campus_post_revisions(
 "id" uuid,
 "post_id" uuid,
 "revision" integer,
 "title" text,
 "body" text,
 "url" text,
 "image_urls" text[],
 "visibility" text,
 "change_note" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_posts(
 "id" uuid,
 "owner_id" uuid,
 "enrollment_id" uuid,
 "cohort_id" uuid,
 "alias" text,
 "kind" text,
 "title" text,
 "body" text,
 "url" text,
 "image_urls" text[],
 "lesson_id" uuid,
 "visibility" text,
 "revision" integer,
 "hidden" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_preferences(
 "user_id" uuid,
 "mode" text,
 "reminders" boolean,
 "alumni" boolean,
 "known_lessons" jsonb,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_reports(
 "id" uuid,
 "reporter_id" uuid,
 "post_id" uuid,
 "comment_id" uuid,
 "reason" text,
 "status" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_review_windows(
 "id" uuid,
 "cohort_id" uuid,
 "mission_id" uuid,
 "planned_at" timestamp with time zone,
 "status" text,
 "revision" integer,
 "created_by" uuid,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_reward_rules(
 "version" text,
 "mission_xp" integer,
 "useful_xp" integer,
 "useful_required" integer,
 "revisions_required" integer,
 "cohort_goal" integer,
 "created_at" timestamp with time zone
);
create table public.edu_campus_space_chat(
 "id" uuid,
 "cohort_id" uuid,
 "user_id" uuid,
 "session_id" uuid,
 "nickname" text,
 "body" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_space_controls(
 "cohort_id" uuid,
 "announcement" text,
 "paused" boolean,
 "closed_zones" text[],
 "revision" integer,
 "updated_by" uuid,
 "updated_at" timestamp with time zone
);
create table public.edu_campus_space_http_metrics(
 "cohort_id" uuid,
 "bucket_at" timestamp with time zone,
 "requests" bigint,
 "client_errors" bigint,
 "server_errors" bigint,
 "slow_requests" bigint,
 "total_ms" bigint,
 "max_ms" integer
);
create table public.edu_campus_space_presence(
 "cohort_id" uuid,
 "user_id" uuid,
 "session_id" uuid,
 "nickname" text,
 "gender" text,
 "coat" text,
 "status" text,
 "photo_opt_in" boolean,
 "focus_until" timestamp with time zone,
 "focus_mode" integer,
 "touched_at" timestamp with time zone,
 "expires_at" timestamp with time zone,
 "accessory" text,
 "avatar_model" smallint,
 "hair_color" text,
 "skin_color" text,
 "pants_color" text,
 "held_item" text
);
create table public.edu_campus_space_profiles(
 "user_id" uuid,
 "nickname" text,
 "gender" text,
 "coat" text,
 "status" text,
 "low_motion" boolean,
 "photo_opt_in" boolean,
 "note" text,
 "desk" text,
 "accessory" text,
 "desk_theme" text,
 "avatar_model" smallint,
 "hair_color" text,
 "skin_color" text,
 "pants_color" text,
 "held_item" text
);
create table public.edu_campus_space_seats(
 "cohort_id" uuid,
 "seat_id" text,
 "user_id" uuid,
 "session_id" uuid,
 "expires_at" timestamp with time zone
);
create table public.edu_campus_support_actions(
 "id" uuid,
 "request_id" uuid,
 "actor_id" uuid,
 "kind" text,
 "content" text,
 "destination_status" text,
 "created_at" timestamp with time zone
);
create table public.edu_campus_support_requests(
 "id" uuid,
 "user_id" uuid,
 "enrollment_id" uuid,
 "lesson_id" uuid,
 "lesson_version" text,
 "category" text,
 "title" text,
 "tried" text,
 "question" text,
 "context_url" text,
 "status" text,
 "revision" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "tool_kind" text,
 "tool_name" text
);
create table public.edu_diagnosis_attempts(
 "id" uuid,
 "user_id" uuid,
 "diagnosis_code" text,
 "offer_id" uuid,
 "state" text,
 "remote_response_id" uuid,
 "remote_revision" bigint,
 "report_id" uuid,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "is_current" boolean,
 "admin_test" boolean,
 "replaces_attempt_id" uuid
);
create table public.edu_diagnosis_outbox(
 "id" uuid,
 "attempt_id" uuid,
 "kind" text,
 "state" text,
 "tries" integer,
 "available_at" timestamp with time zone,
 "lease" uuid,
 "lease_until" timestamp with time zone,
 "last_code" text,
 "created_at" timestamp with time zone
);
create table public.edu_event_actions(
 "id" bigint,
 "zone_id" uuid,
 "user_id" uuid,
 "action" text,
 "target" text,
 "created_at" timestamp with time zone
);
create table public.edu_event_awards(
 "zone_id" uuid,
 "user_id" uuid,
 "wallet_id" uuid,
 "created_at" timestamp with time zone
);
create table public.edu_event_invites(
 "id" uuid,
 "zone_id" uuid,
 "token_hash" text,
 "label" text,
 "user_id" uuid,
 "claimed_at" timestamp with time zone,
 "revoked_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
create table public.edu_lesson_answer_files(
 "id" uuid,
 "owner_id" uuid,
 "enrollment_id" uuid,
 "lesson_id" uuid,
 "revision" uuid,
 "block_id" text,
 "kind" text,
 "name" text,
 "size" integer,
 "content_type" text,
 "extension" text,
 "path" text,
 "sha256" text,
 "created_at" timestamp with time zone,
 "ready_at" timestamp with time zone
);
create table public.edu_lesson_author_heads(
 "lesson_id" uuid,
 "revision" uuid,
 "published_revision" uuid,
 "published_stamp" text
);
create table public.edu_lesson_author_publications(
 "id" uuid,
 "lesson_id" uuid,
 "revision" uuid,
 "created_by" uuid,
 "created_at" timestamp with time zone
);
create table public.edu_lesson_author_save_notes(
 "revision" uuid,
 "source" text,
 "note" text
);
create table public.edu_lesson_author_versions(
 "id" uuid,
 "lesson_id" uuid,
 "payload" jsonb,
 "base_stamp" text,
 "created_by" uuid,
 "created_at" timestamp with time zone,
 "kind" text
);
create table public.edu_lesson_block_drafts(
 "enrollment_id" uuid,
 "revision" uuid,
 "values" jsonb,
 "write_id" uuid,
 "updated_at" timestamp with time zone
);
create table public.edu_lesson_block_feedback(
 "id" uuid,
 "sequence" bigint,
 "submission_id" uuid,
 "actor_id" uuid,
 "source" text,
 "expected_state" uuid,
 "expected_feedback" uuid,
 "feedback" text,
 "created_at" timestamp with time zone
);
create table public.edu_lesson_block_heads(
 "lesson_id" uuid,
 "revision" uuid
);
create table public.edu_lesson_block_reviews(
 "id" uuid,
 "sequence" bigint,
 "submission_id" uuid,
 "actor_id" uuid,
 "expected_state" uuid,
 "decision" text,
 "feedback" text,
 "created_at" timestamp with time zone
);
create table public.edu_lesson_block_submissions(
 "id" uuid,
 "enrollment_id" uuid,
 "lesson_id" uuid,
 "revision" uuid,
 "draft_write_id" uuid,
 "values" jsonb,
 "assessment" jsonb,
 "outcome" text,
 "created_at" timestamp with time zone,
 "sequence" bigint
);
create table public.edu_lesson_block_versions(
 "id" uuid,
 "lesson_id" uuid,
 "document" jsonb,
 "created_by" uuid,
 "created_at" timestamp with time zone
);
create table public.edu_lesson_media(
 "id" uuid,
 "owner_id" uuid,
 "course_id" uuid,
 "kind" text,
 "name" text,
 "size" integer,
 "content_type" text,
 "extension" text,
 "path" text,
 "sha256" text,
 "created_at" timestamp with time zone,
 "ready_at" timestamp with time zone,
 "source_asset_id" uuid
);
create table public.edu_lesson_qa_plans(
 "id" uuid,
 "lesson_id" uuid,
 "question_id" uuid,
 "created_by" uuid,
 "created_at" timestamp with time zone,
 "question_stamp" text,
 "public_stamp" text,
 "cohort_stamp" text,
 "author_head" uuid,
 "expected_answer" uuid,
 "anchor_block" text,
 "anchor_node" integer,
 "title" text,
 "answer" text,
 "payload" jsonb,
 "answer_id" uuid,
 "author_revision" uuid,
 "publication_id" uuid,
 "digest" text,
 "applied_at" timestamp with time zone,
 "result" jsonb
);
create table public.edu_member_encouragements(
 "user_id" uuid,
 "id" uuid,
 "public_name" text,
 "message" text,
 "revision" uuid,
 "updated_at" timestamp with time zone
);
create table public.edu_member_messages(
 "id" uuid,
 "sequence" bigint,
 "sender_id" uuid,
 "recipient_id" uuid,
 "request_id" uuid,
 "content" text,
 "reply_to" uuid,
 "created_at" timestamp with time zone,
 "read_at" timestamp with time zone,
 "is_notice" boolean,
 "notice_source" text,
 "target_path" text,
 "deleted_at" timestamp with time zone,
 "deleted_by" uuid
);
create table public.edu_member_mvp(
 "user_id" uuid,
 "is_mvp" boolean,
 "border_color" text,
 "revision" uuid,
 "updated_by" uuid,
 "updated_at" timestamp with time zone
);
create table public.edu_member_visits(
 "user_id" uuid,
 "visit_day" date,
 "first_seen_at" timestamp with time zone,
 "last_seen_at" timestamp with time zone
);
create table public.edu_mission_drafts(
 "id" uuid,
 "user_id" uuid,
 "enrollment_id" uuid,
 "mission_id" uuid,
 "content" text,
 "url" text,
 "updated_at" timestamp with time zone,
 "response" jsonb,
 "revision" uuid
);
create table public.edu_mutation_receipts(
 "actor_id" uuid,
 "request_id" uuid,
 "target_table" text,
 "fingerprint" text,
 "result" jsonb,
 "created_at" timestamp with time zone
);
create table public.edu_onboarding_steps(
 "order_id" uuid,
 "user_id" uuid,
 "step" text,
 "confirmation_value" text,
 "comment" text,
 "confirmed_at" timestamp with time zone
);
create table public.edu_purchase_onboarding(
 "order_id" uuid,
 "user_id" uuid,
 "survey_room" text,
 "survey_answered_at" timestamp with time zone,
 "tg_path" text,
 "tg_link_clicked_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.edu_push_events(
 "id" uuid,
 "user_id" uuid,
 "kind" text,
 "source" text,
 "path" text,
 "created_at" timestamp with time zone
);
create table public.edu_push_subscriptions(
 "id" uuid,
 "user_id" uuid,
 "endpoint" text,
 "p256dh" text,
 "auth" text,
 "binding" uuid,
 "enabled" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.edu_question_answer_images(
 "id" uuid,
 "owner_id" uuid,
 "question_id" uuid,
 "answer_id" uuid,
 "name" text,
 "size" integer,
 "extension" text,
 "content_type" text,
 "path" text,
 "created_at" timestamp with time zone,
 "ready_at" timestamp with time zone,
 "sha256" text
);
create table public.edu_question_answers(
 "id" uuid,
 "sequence" bigint,
 "question_id" uuid,
 "actor_id" uuid,
 "author_name" text,
 "source" text,
 "expected_head" uuid,
 "content" text,
 "created_at" timestamp with time zone,
 "deleted_at" timestamp with time zone,
 "deleted_by" uuid,
 "learner_read_at" timestamp with time zone
);
create table public.edu_question_assist_jobs(
 "id" uuid,
 "question_id" uuid,
 "requested_by" uuid,
 "expected_head" uuid,
 "lesson_revision" uuid,
 "question_fingerprint" text,
 "status" text,
 "draft" text,
 "created_at" timestamp with time zone,
 "answer_id" uuid
);
create table public.edu_question_images(
 "id" uuid,
 "owner_id" uuid,
 "enrollment_id" uuid,
 "lesson_id" uuid,
 "name" text,
 "size" integer,
 "extension" text,
 "content_type" text,
 "path" text,
 "created_at" timestamp with time zone,
 "ready_at" timestamp with time zone,
 "sha256" text
);
create table public.edu_questions(
 "id" uuid,
 "user_id" uuid,
 "course_id" uuid,
 "title" text,
 "content" text,
 "answer" text,
 "status" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "is_archived" boolean,
 "archived_at" timestamp with time zone,
 "mission_id" uuid,
 "enrollment_id" uuid,
 "lesson_id" uuid,
 "learning_context" text,
 "answer_head_id" uuid,
 "is_resolved" boolean,
 "image_id" uuid,
 "sharing_requested" boolean,
 "category" text,
 "visibility" text,
 "shared_cohort_id" uuid,
 "deleted_at" timestamp with time zone
);
create table public.edu_shared_answers(
 "id" uuid,
 "source_question_id" uuid,
 "title" text,
 "answer" text,
 "cohort_id" uuid,
 "lesson_id" uuid,
 "lesson_revision" uuid,
 "approved_by" uuid,
 "published" boolean,
 "updated_at" timestamp with time zone
);
create table public.enrollments(
 "id" uuid,
 "user_id" uuid,
 "course_id" uuid,
 "cohort_id" uuid,
 "order_item_id" uuid,
 "status" text,
 "access_starts_at" timestamp with time zone,
 "access_ends_at" timestamp with time zone,
 "revoked_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "source" text,
 "granted_by" uuid
);
create table public.kakao_sync_members(
 "user_id" uuid,
 "app_id" text,
 "kakao_user_id" text,
 "policy_version" text,
 "terms" jsonb,
 "channel_id" text,
 "channel_relation" text,
 "checked_at" timestamp with time zone
);
create table public.lesson_progress(
 "id" uuid,
 "enrollment_id" uuid,
 "lesson_id" uuid,
 "progress_percent" integer,
 "last_position_seconds" integer,
 "completed_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
create table public.member_group_members(
 "group_id" uuid,
 "member_id" uuid,
 "added_at" timestamp with time zone
);
create table public.mission_submissions(
 "id" uuid,
 "enrollment_id" uuid,
 "mission_id" uuid,
 "attempt_number" integer,
 "status" text,
 "response" jsonb,
 "submitted_at" timestamp with time zone,
 "reviewed_at" timestamp with time zone,
 "reviewed_by" uuid,
 "reviewer_feedback" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "quiz_required" boolean,
 "quiz_passed" boolean
);
alter table private.campus_student_connections add constraint fixture_campus_student_connections_2 PRIMARY KEY (id);
alter table private.campus_student_connections add constraint fixture_campus_student_connections_3 CHECK ((verifier ~ '^[0-9a-f]{64}$'::text));
alter table private.campus_student_connections add constraint fixture_campus_student_connections_4 UNIQUE (verifier);
alter table private.campus_student_reporting_enabled add constraint fixture_campus_student_reporting_enabled_0 CHECK (enabled);
alter table private.campus_student_reporting_enabled add constraint fixture_campus_student_reporting_enabled_1 PRIMARY KEY (enabled);
alter table private.edu_campus_community_flow_receipts add constraint fixture_edu_campus_community_flow_receipts_0 PRIMARY KEY (actor_id, request_id);
alter table private.edu_campus_community_receipts add constraint fixture_edu_campus_community_receipts_1 PRIMARY KEY (actor_id, request_id);
alter table private.edu_campus_office_connectors add constraint fixture_edu_campus_office_connectors_0 CHECK ((connector_id ~ '^[a-z0-9_-]{1,40}$'::text));
alter table private.edu_campus_office_connectors add constraint fixture_edu_campus_office_connectors_2 PRIMARY KEY (connector_id, owner_id);
alter table private.edu_campus_office_dispatch_receipts add constraint fixture_edu_campus_office_dispatch_receipts_0 PRIMARY KEY (owner_id, request_id);
alter table private.edu_campus_office_dispatches add constraint fixture_edu_campus_office_dispatches_0 CHECK (((attempts >= 0) AND (attempts <= 12)));
alter table private.edu_campus_office_dispatches add constraint fixture_edu_campus_office_dispatches_3 UNIQUE (job_id, job_revision);
alter table private.edu_campus_office_dispatches add constraint fixture_edu_campus_office_dispatches_4 CHECK ((job_revision > 0));
alter table private.edu_campus_office_dispatches add constraint fixture_edu_campus_office_dispatches_5 CHECK (((operation_attempts >= 0) AND (operation_attempts <= 4)));
alter table private.edu_campus_office_dispatches add constraint fixture_edu_campus_office_dispatches_6 CHECK ((operation = ANY (ARRAY['submit'::text, 'status'::text, 'cancel'::text])));
alter table private.edu_campus_office_dispatches add constraint fixture_edu_campus_office_dispatches_8 CHECK ((octet_length((payload)::text) <= 24000));
alter table private.edu_campus_office_dispatches add constraint fixture_edu_campus_office_dispatches_9 PRIMARY KEY (id);
alter table private.edu_campus_office_dispatches add constraint fixture_edu_campus_office_dispatches_10 CHECK ((status = ANY (ARRAY['queued'::text, 'leased'::text, 'accepted'::text, 'uncertain'::text, 'rejected'::text, 'cancelled'::text])));
alter table private.edu_campus_office_events add constraint fixture_edu_campus_office_events_1 CHECK ((payload_hash ~ '^[a-f0-9]{64}$'::text));
alter table private.edu_campus_office_events add constraint fixture_edu_campus_office_events_2 PRIMARY KEY (connector_id, event_id);
alter table private.edu_campus_office_receipts add constraint fixture_edu_campus_office_receipts_1 PRIMARY KEY (actor_id, request_id);
alter table public.course_content_claims add constraint fixture_course_content_claims_0 CHECK ((length(campaign) <= 200));
alter table public.course_content_claims add constraint fixture_course_content_claims_2 CHECK ((length(medium) <= 200));
alter table public.course_content_claims add constraint fixture_course_content_claims_3 PRIMARY KEY (id);
alter table public.course_content_claims add constraint fixture_course_content_claims_4 CHECK ((length(source) <= 200));
alter table public.course_content_claims add constraint fixture_course_content_claims_6 UNIQUE (user_id, lesson_id);
alter table public.crm_member_tags add constraint fixture_crm_member_tags_1 CHECK ((assignment_source = ANY (ARRAY['manual'::text, 'automatic'::text])));
alter table public.crm_member_tags add constraint fixture_crm_member_tags_3 PRIMARY KEY (member_id, tag_id);
alter table public.customer_journey_events add constraint fixture_customer_journey_events_0 CHECK ((event_name = ANY (ARRAY['page_view'::text, 'click'::text, 'article_view'::text, 'article_click'::text, 'class_view'::text, 'checkout_view'::text, 'application_click'::text, 'order_complete'::text])));
alter table public.customer_journey_events add constraint fixture_customer_journey_events_1 PRIMARY KEY (id);
alter table public.customer_journey_events add constraint fixture_customer_journey_events_2 CHECK (((char_length(session_id) >= 8) AND (char_length(session_id) <= 80)));
alter table public.edu_ai_calls add constraint fixture_edu_ai_calls_0 CHECK (((attempt >= 1) AND (attempt <= 2)));
alter table public.edu_ai_calls add constraint fixture_edu_ai_calls_1 CHECK (((cached_tokens >= 0) AND (cached_tokens <= input_tokens)));
alter table public.edu_ai_calls add constraint fixture_edu_ai_calls_2 CHECK ((estimated_usd >= (0)::numeric));
alter table public.edu_ai_calls add constraint fixture_edu_ai_calls_3 CHECK (((input_tokens >= 0) AND (input_tokens <= 10000000)));
alter table public.edu_ai_calls add constraint fixture_edu_ai_calls_4 CHECK (((length(model) >= 1) AND (length(model) <= 100)));
alter table public.edu_ai_calls add constraint fixture_edu_ai_calls_5 CHECK (((output_tokens >= 0) AND (output_tokens <= 10000000)));
alter table public.edu_ai_calls add constraint fixture_edu_ai_calls_6 PRIMARY KEY (request_id, attempt);
alter table public.edu_ai_calls add constraint fixture_edu_ai_calls_8 CHECK ((status = ANY (ARRAY['started'::text, 'succeeded'::text, 'failed'::text, 'unknown'::text])));
alter table public.edu_ai_cohort_settings add constraint fixture_edu_ai_cohort_settings_1 CHECK (((daily_limit >= 1) AND (daily_limit <= 10000)));
alter table public.edu_ai_cohort_settings add constraint fixture_edu_ai_cohort_settings_2 PRIMARY KEY (cohort_id);
alter table public.edu_ai_cohort_settings add constraint fixture_edu_ai_cohort_settings_3 CHECK (((student_daily_limit >= 1) AND (student_daily_limit <= 100)));
alter table public.edu_ai_conversation_turns add constraint fixture_edu_ai_conversation_turns_0 CHECK (((answer IS NULL) OR COALESCE(((jsonb_typeof(answer) = 'object'::text) AND (jsonb_typeof((answer -> 'answer'::text)) = 'string'::text) AND ((length((answer ->> 'answer'::text)) >= 1) AND (length((answer ->> 'answer'::text)) <= 4000)) AND (jsonb_typeof((answer -> 'sources'::text)) = 'array'::text) AND (jsonb_typeof((answer -> 'needsMentor'::text)) = 'boolean'::text) AND (pg_column_size(answer) < 40000)), false)));
alter table public.edu_ai_conversation_turns add constraint fixture_edu_ai_conversation_turns_1 CHECK (((status = 'succeeded'::text) = (answer IS NOT NULL)));
alter table public.edu_ai_conversation_turns add constraint fixture_edu_ai_conversation_turns_3 CHECK ((length(error) <= 500));
alter table public.edu_ai_conversation_turns add constraint fixture_edu_ai_conversation_turns_5 PRIMARY KEY (request_id);
alter table public.edu_ai_conversation_turns add constraint fixture_edu_ai_conversation_turns_6 CHECK (((length(question) >= 1) AND (length(question) <= 2000)));
alter table public.edu_ai_conversation_turns add constraint fixture_edu_ai_conversation_turns_8 CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])));
alter table public.edu_ai_conversations add constraint fixture_edu_ai_conversations_0 UNIQUE (actor_id, enrollment_id, lesson_id);
alter table public.edu_ai_conversations add constraint fixture_edu_ai_conversations_3 CHECK (((length(last_question) >= 1) AND (length(last_question) <= 2000)));
alter table public.edu_ai_conversations add constraint fixture_edu_ai_conversations_5 PRIMARY KEY (id);
alter table public.edu_ai_requests add constraint fixture_edu_ai_requests_3 CHECK ((fingerprint ~ '^[a-f0-9]{64}$'::text));
alter table public.edu_ai_requests add constraint fixture_edu_ai_requests_5 CHECK ((mode = ANY (ARRAY['student'::text, 'mentor'::text, 'batch'::text])));
alter table public.edu_ai_requests add constraint fixture_edu_ai_requests_6 PRIMARY KEY (id);
alter table public.edu_ai_requests add constraint fixture_edu_ai_requests_8 CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])));
alter table public.edu_campus_activity_batches add constraint fixture_edu_campus_activity_batches_0 CHECK ((jsonb_typeof(dwell) = 'object'::text));
alter table public.edu_campus_activity_batches add constraint fixture_edu_campus_activity_batches_1 CHECK (((jsonb_typeof(events) = 'array'::text) AND (jsonb_array_length(events) <= 32)));
alter table public.edu_campus_activity_batches add constraint fixture_edu_campus_activity_batches_2 PRIMARY KEY (id);
alter table public.edu_campus_activity_batches add constraint fixture_edu_campus_activity_batches_3 CHECK ((scope ~ '^[a-z0-9][a-z0-9-]{2,59}$'::text));
alter table public.edu_campus_analytics_settings add constraint fixture_edu_campus_analytics_settings_0 CHECK (id);
alter table public.edu_campus_analytics_settings add constraint fixture_edu_campus_analytics_settings_1 PRIMARY KEY (id);
alter table public.edu_campus_archive_commands add constraint fixture_edu_campus_archive_commands_2 PRIMARY KEY (request_id);
alter table public.edu_campus_archive_entries add constraint fixture_edu_campus_archive_entries_0 CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 40000)));
alter table public.edu_campus_archive_entries add constraint fixture_edu_campus_archive_entries_1 CHECK ((((source_kind IS NULL) AND (source_id IS NULL) AND (source_revision IS NULL) AND (source_snapshot IS NULL)) OR ((source_kind IS NOT NULL) AND (source_id IS NOT NULL) AND (source_revision > 0) AND (source_snapshot IS NOT NULL))));
alter table public.edu_campus_archive_entries add constraint fixture_edu_campus_archive_entries_3 CHECK ((kind = ANY (ARRAY['plan'::text, 'recipe'::text, 'artifact'::text, 'note'::text])));
alter table public.edu_campus_archive_entries add constraint fixture_edu_campus_archive_entries_4 PRIMARY KEY (id);
alter table public.edu_campus_archive_entries add constraint fixture_edu_campus_archive_entries_5 CHECK ((revision > 0));
alter table public.edu_campus_archive_entries add constraint fixture_edu_campus_archive_entries_6 CHECK ((source_kind = ANY (ARRAY['business'::text, 'post'::text])));
alter table public.edu_campus_archive_entries add constraint fixture_edu_campus_archive_entries_7 CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 120)));
alter table public.edu_campus_archive_entries add constraint fixture_edu_campus_archive_entries_8 CHECK (((char_length(url) <= 500) AND ((url = ''::text) OR (url ~ '^https?://[^[:space:]@]+[.][^[:space:]]+'::text))));
alter table public.edu_campus_archive_entries add constraint fixture_edu_campus_archive_entries_9 UNIQUE (user_id, enrollment_id, source_kind, source_id);
alter table public.edu_campus_blocks add constraint fixture_edu_campus_blocks_0 CHECK ((owner_id <> target_id));
alter table public.edu_campus_blocks add constraint fixture_edu_campus_blocks_3 PRIMARY KEY (owner_id, target_id, cohort_id);
alter table public.edu_campus_business_case_events add constraint fixture_edu_campus_business_case_events_0 CHECK ((action = ANY (ARRAY['submit'::text, 'withdraw'::text, 'review'::text])));
alter table public.edu_campus_business_case_events add constraint fixture_edu_campus_business_case_events_3 PRIMARY KEY (id);
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_0 CHECK ((allowed_purposes <@ granted_purposes));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_1 CHECK (((reviewed_revision IS NULL) OR ((reviewed_revision > 0) AND (reviewed_revision <= revision))));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_2 CHECK ((consent_version = 'moonshot-case-selection-v2'::text));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_4 CHECK (((jsonb_typeof(evidence) = 'array'::text) AND ((jsonb_array_length(evidence) >= 1) AND (jsonb_array_length(evidence) <= 5))));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_5 CHECK ((((cardinality(granted_purposes) >= 1) AND (cardinality(granted_purposes) <= 3)) AND (granted_purposes <@ ARRAY['cohort_learning'::text, 'website'::text, 'sales_material'::text])));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_6 CHECK ((industry = ANY (ARRAY['온라인 상품'::text, '전문 서비스'::text, '교육·콘텐츠'::text])));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_7 CHECK (((char_length(btrim(limits)) >= 1) AND (char_length(btrim(limits)) <= 2000)));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_8 PRIMARY KEY (id);
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_9 CHECK ((char_length(reviewer_note) <= 2000));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_10 CHECK ((revision > 0));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_11 CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'changes_requested'::text, 'rejected'::text, 'withdrawn'::text])));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_12 CHECK (((char_length(btrim(summary)) >= 1) AND (char_length(btrim(summary)) <= 2000)));
alter table public.edu_campus_business_cases add constraint fixture_edu_campus_business_cases_13 CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 120)));
alter table public.edu_campus_business_records add constraint fixture_edu_campus_business_records_1 CHECK ((creation_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table public.edu_campus_business_records add constraint fixture_edu_campus_business_records_3 PRIMARY KEY (id);
alter table public.edu_campus_business_records add constraint fixture_edu_campus_business_records_4 CHECK ((revision > 0));
alter table public.edu_campus_business_records add constraint fixture_edu_campus_business_records_5 CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 120)));
alter table public.edu_campus_business_review_links add constraint fixture_edu_campus_business_review_links_0 CHECK (((char_length(artifact_url) <= 500) AND (artifact_url ~ '^https?://[^[:space:]@]+[.][^[:space:]]+'::text)));
alter table public.edu_campus_business_review_links add constraint fixture_edu_campus_business_review_links_2 PRIMARY KEY (id);
alter table public.edu_campus_business_review_links add constraint fixture_edu_campus_business_review_links_3 CHECK (public_consent);
alter table public.edu_campus_business_review_links add constraint fixture_edu_campus_business_review_links_4 CHECK (((char_length(btrim(question)) >= 1) AND (char_length(btrim(question)) <= 500)));
alter table public.edu_campus_business_review_links add constraint fixture_edu_campus_business_review_links_5 CHECK (((response_count >= 0) AND (response_count <= 50)));
alter table public.edu_campus_business_review_links add constraint fixture_edu_campus_business_review_links_6 CHECK ((revision > 0));
alter table public.edu_campus_business_review_links add constraint fixture_edu_campus_business_review_links_7 CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 120)));
alter table public.edu_campus_business_review_links add constraint fixture_edu_campus_business_review_links_8 CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text));
alter table public.edu_campus_business_review_links add constraint fixture_edu_campus_business_review_links_9 UNIQUE (token_hash);
alter table public.edu_campus_business_review_replies add constraint fixture_edu_campus_business_review_replies_0 CHECK (((char_length(btrim(answer)) >= 1) AND (char_length(btrim(answer)) <= 2000)));
alter table public.edu_campus_business_review_replies add constraint fixture_edu_campus_business_review_replies_1 CHECK (((clarity >= 1) AND (clarity <= 5)));
alter table public.edu_campus_business_review_replies add constraint fixture_edu_campus_business_review_replies_3 PRIMARY KEY (id);
alter table public.edu_campus_comments add constraint fixture_edu_campus_comments_0 CHECK (((length(alias) >= 2) AND (length(alias) <= 24)));
alter table public.edu_campus_comments add constraint fixture_edu_campus_comments_2 CHECK (((length(body) >= 10) AND (length(body) <= 2000)));
alter table public.edu_campus_comments add constraint fixture_edu_campus_comments_3 PRIMARY KEY (id);
alter table public.edu_campus_community_flow_history add constraint fixture_edu_campus_community_flow_history_1 CHECK ((kind = ANY (ARRAY['exchange'::text, 'demo'::text])));
alter table public.edu_campus_community_flow_history add constraint fixture_edu_campus_community_flow_history_2 PRIMARY KEY (id);
alter table public.edu_campus_demo_questions add constraint fixture_edu_campus_demo_questions_0 CHECK (((length(alias) >= 2) AND (length(alias) <= 24)));
alter table public.edu_campus_demo_questions add constraint fixture_edu_campus_demo_questions_2 CHECK (((length(body) >= 5) AND (length(body) <= 2000)));
alter table public.edu_campus_demo_questions add constraint fixture_edu_campus_demo_questions_3 PRIMARY KEY (id);
alter table public.edu_campus_demo_slots add constraint fixture_edu_campus_demo_slots_1 CHECK (((minutes >= 5) AND (minutes <= 30)));
alter table public.edu_campus_demo_slots add constraint fixture_edu_campus_demo_slots_2 PRIMARY KEY (id);
alter table public.edu_campus_demo_slots add constraint fixture_edu_campus_demo_slots_5 CHECK ((status = ANY (ARRAY['scheduled'::text, 'presenting'::text, 'finished'::text, 'canceled'::text])));
alter table public.edu_campus_exchanges add constraint fixture_edu_campus_exchanges_0 CHECK (((length(alias) >= 2) AND (length(alias) <= 24)));
alter table public.edu_campus_exchanges add constraint fixture_edu_campus_exchanges_1 CHECK ((proposer_id <> recipient_id));
alter table public.edu_campus_exchanges add constraint fixture_edu_campus_exchanges_3 PRIMARY KEY (id);
alter table public.edu_campus_exchanges add constraint fixture_edu_campus_exchanges_5 CHECK (((length(proposal) >= 10) AND (length(proposal) <= 2000)));
alter table public.edu_campus_exchanges add constraint fixture_edu_campus_exchanges_8 CHECK ((status = ANY (ARRAY['proposed'::text, 'accepted'::text, 'declined'::text, 'submitted'::text, 'completed'::text, 'canceled'::text])));
alter table public.edu_campus_feedback_acknowledgments add constraint fixture_edu_campus_feedback_acknowledgments_0 CHECK ((((decision = 'apply'::text) AND (applied_revision >= 2) AND (length(reason) >= 5)) OR ((decision = 'keep'::text) AND (applied_revision IS NULL) AND (length(reason) >= 5)) OR ((decision = 'pending'::text) AND (applied_revision IS NULL))));
alter table public.edu_campus_feedback_acknowledgments add constraint fixture_edu_campus_feedback_acknowledgments_2 CHECK ((decision = ANY (ARRAY['pending'::text, 'apply'::text, 'keep'::text])));
alter table public.edu_campus_feedback_acknowledgments add constraint fixture_edu_campus_feedback_acknowledgments_4 PRIMARY KEY (comment_id);
alter table public.edu_campus_feedback_acknowledgments add constraint fixture_edu_campus_feedback_acknowledgments_5 CHECK ((length(reason) <= 1000));
alter table public.edu_campus_feedback_acknowledgments add constraint fixture_edu_campus_feedback_acknowledgments_6 CHECK ((revision > 0));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_0 CHECK (((char_length(btrim(action_text)) >= 1) AND (char_length(btrim(action_text)) <= 300)));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_1 CHECK ((updated_at >= created_at));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_2 CHECK ((((status = 'running'::text) AND (running_since IS NOT NULL) AND ((running_since >= created_at) AND (running_since <= updated_at))) OR ((status <> 'running'::text) AND (running_since IS NULL))));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_3 CHECK (((status <> 'finished'::text) OR ((char_length(btrim(result_note)) > 0) AND (char_length(btrim(next_step)) > 0))));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_4 CHECK (((elapsed_seconds >= 0) AND (elapsed_seconds <= 900)));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_6 CHECK (((char_length(btrim(lesson_version)) >= 1) AND (char_length(btrim(lesson_version)) <= 160)));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_7 CHECK ((char_length(next_step) <= 500));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_8 PRIMARY KEY (id);
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_9 CHECK ((char_length(result_note) <= 1000));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_10 CHECK ((revision >= 1));
alter table public.edu_campus_focus_sessions add constraint fixture_edu_campus_focus_sessions_11 CHECK ((status = ANY (ARRAY['running'::text, 'paused'::text, 'finished'::text])));
alter table public.edu_campus_launches add constraint fixture_edu_campus_launches_2 UNIQUE (enrollment_id, rule_version);
alter table public.edu_campus_launches add constraint fixture_edu_campus_launches_4 PRIMARY KEY (id);
alter table public.edu_campus_moderation_log add constraint fixture_edu_campus_moderation_log_1 PRIMARY KEY (id);
alter table public.edu_campus_office_bookings add constraint fixture_edu_campus_office_bookings_0 PRIMARY KEY (id);
alter table public.edu_campus_office_bookings add constraint fixture_edu_campus_office_bookings_1 CHECK ((queue_status = ANY (ARRAY['none'::text, 'waiting'::text, 'called'::text, 'done'::text])));
alter table public.edu_campus_office_bookings add constraint fixture_edu_campus_office_bookings_3 UNIQUE (session_id, user_id);
alter table public.edu_campus_office_bookings add constraint fixture_edu_campus_office_bookings_4 CHECK ((status = ANY (ARRAY['reserved'::text, 'cancelled'::text])));
alter table public.edu_campus_office_employees add constraint fixture_edu_campus_office_employees_0 CHECK (((jsonb_typeof(profile) = 'object'::text) AND (octet_length((profile)::text) <= 6000) AND ((((profile ->> 'employeeId'::text) = employee_id) AND ((length((profile ->> 'name'::text)) >= 1) AND (length((profile ->> 'name'::text)) <= 200)) AND ((profile ->> 'telegramUrl'::text) ~ '^https://t\.me/[a-z][a-z0-9_]{4,31}$'::text)) IS TRUE)));
alter table public.edu_campus_office_employees add constraint fixture_edu_campus_office_employees_1 CHECK ((((length(employee_id) >= 1) AND (length(employee_id) <= 128)) AND (employee_id <> 'manager'::text)));
alter table public.edu_campus_office_employees add constraint fixture_edu_campus_office_employees_3 PRIMARY KEY (owner_id, employee_id);
alter table public.edu_campus_office_history add constraint fixture_edu_campus_office_history_0 CHECK ((actor_type = ANY (ARRAY['learner'::text, 'connector'::text])));
alter table public.edu_campus_office_history add constraint fixture_edu_campus_office_history_2 UNIQUE (job_id, revision);
alter table public.edu_campus_office_history add constraint fixture_edu_campus_office_history_3 PRIMARY KEY (id);
alter table public.edu_campus_office_inbox_signals add constraint fixture_edu_campus_office_inbox_signals_2 PRIMARY KEY (enrollment_id);
alter table public.edu_campus_office_jobs add constraint fixture_edu_campus_office_jobs_0 CHECK ((length(draft_text) <= 10000));
alter table public.edu_campus_office_jobs add constraint fixture_edu_campus_office_jobs_2 CHECK ((length(error_note) <= 1000));
alter table public.edu_campus_office_jobs add constraint fixture_edu_campus_office_jobs_3 CHECK (((length(objective) >= 10) AND (length(objective) <= 2000)));
alter table public.edu_campus_office_jobs add constraint fixture_edu_campus_office_jobs_4 CHECK ((output_type = ANY (ARRAY['plan'::text, 'copy'::text, 'checklist'::text, 'analysis'::text])));
alter table public.edu_campus_office_jobs add constraint fixture_edu_campus_office_jobs_6 PRIMARY KEY (id);
alter table public.edu_campus_office_jobs add constraint fixture_edu_campus_office_jobs_7 CHECK ((length(review_note) <= 2000));
alter table public.edu_campus_office_jobs add constraint fixture_edu_campus_office_jobs_8 CHECK ((revision > 0));
alter table public.edu_campus_office_jobs add constraint fixture_edu_campus_office_jobs_9 CHECK ((status = ANY (ARRAY['awaiting_connection'::text, 'queued'::text, 'running'::text, 'review'::text, 'approved'::text, 'revision_requested'::text, 'failed'::text, 'archived'::text])));
alter table public.edu_campus_office_sessions add constraint fixture_edu_campus_office_sessions_0 CHECK (((capacity >= 1) AND (capacity <= 100)));
alter table public.edu_campus_office_sessions add constraint fixture_edu_campus_office_sessions_1 CHECK (((ends_at > starts_at) AND (ends_at <= (starts_at + '08:00:00'::interval))));
alter table public.edu_campus_office_sessions add constraint fixture_edu_campus_office_sessions_4 CHECK ((kind = ANY (ARRAY['mentor'::text, 'study'::text, 'demo'::text])));
alter table public.edu_campus_office_sessions add constraint fixture_edu_campus_office_sessions_5 CHECK (((length(location_url) <= 2000) AND ((location_url = ''::text) OR (location_url ~ '^https?://'::text))));
alter table public.edu_campus_office_sessions add constraint fixture_edu_campus_office_sessions_6 PRIMARY KEY (id);
alter table public.edu_campus_office_sessions add constraint fixture_edu_campus_office_sessions_7 CHECK ((length(shared_goal) <= 300));
alter table public.edu_campus_office_sessions add constraint fixture_edu_campus_office_sessions_8 CHECK ((status = ANY (ARRAY['open'::text, 'cancelled'::text])));
alter table public.edu_campus_office_sessions add constraint fixture_edu_campus_office_sessions_9 CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 120)));
alter table public.edu_campus_personal_offices add constraint fixture_edu_campus_personal_offices_0 CHECK (((octet_length((document)::text) <= 18000) AND ((document ->> 'schemaVersion'::text) = '1'::text) AND (jsonb_typeof((document -> 'profiles'::text)) = 'array'::text) AND ((jsonb_array_length((document -> 'profiles'::text)) >= 1) AND (jsonb_array_length((document -> 'profiles'::text)) <= 8))));
alter table public.edu_campus_personal_offices add constraint fixture_edu_campus_personal_offices_2 PRIMARY KEY (owner_id);
alter table public.edu_campus_portfolio_file_access_log add constraint fixture_edu_campus_portfolio_file_access_log_2 PRIMARY KEY (id);
alter table public.edu_campus_portfolio_files add constraint fixture_edu_campus_portfolio_files_0 CHECK ((content_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text, 'application/pdf'::text])));
alter table public.edu_campus_portfolio_files add constraint fixture_edu_campus_portfolio_files_1 CHECK (((length(name) >= 1) AND (length(name) <= 180)));
alter table public.edu_campus_portfolio_files add constraint fixture_edu_campus_portfolio_files_3 UNIQUE (path);
alter table public.edu_campus_portfolio_files add constraint fixture_edu_campus_portfolio_files_4 PRIMARY KEY (id);
alter table public.edu_campus_portfolio_files add constraint fixture_edu_campus_portfolio_files_6 CHECK (((size >= 1) AND (size <= 10485760)));
alter table public.edu_campus_portfolio_files add constraint fixture_edu_campus_portfolio_files_7 CHECK ((state = ANY (ARRAY['pending'::text, 'ready'::text])));
alter table public.edu_campus_portfolio_files add constraint fixture_edu_campus_portfolio_files_8 CHECK ((visibility = ANY (ARRAY['private'::text, 'cohort'::text])));
alter table public.edu_campus_post_revisions add constraint fixture_edu_campus_post_revisions_0 CHECK (((length(change_note) >= 5) AND (length(change_note) <= 500)));
alter table public.edu_campus_post_revisions add constraint fixture_edu_campus_post_revisions_1 PRIMARY KEY (id);
alter table public.edu_campus_post_revisions add constraint fixture_edu_campus_post_revisions_3 UNIQUE (post_id, revision);
alter table public.edu_campus_post_revisions add constraint fixture_edu_campus_post_revisions_4 CHECK ((visibility = ANY (ARRAY['private'::text, 'cohort'::text])));
alter table public.edu_campus_posts add constraint fixture_edu_campus_posts_0 CHECK (((length(alias) >= 2) AND (length(alias) <= 24)));
alter table public.edu_campus_posts add constraint fixture_edu_campus_posts_1 CHECK (((length(body) >= 10) AND (length(body) <= 6000)));
alter table public.edu_campus_posts add constraint fixture_edu_campus_posts_4 CHECK ((kind = ANY (ARRAY['portfolio'::text, 'feedback'::text, 'process'::text, 'failure'::text, 'talent_offer'::text, 'talent_request'::text, 'demo_day'::text])));
alter table public.edu_campus_posts add constraint fixture_edu_campus_posts_6 PRIMARY KEY (id);
alter table public.edu_campus_posts add constraint fixture_edu_campus_posts_7 CHECK ((revision > 0));
alter table public.edu_campus_posts add constraint fixture_edu_campus_posts_8 CHECK (((length(title) >= 2) AND (length(title) <= 100)));
alter table public.edu_campus_posts add constraint fixture_edu_campus_posts_9 CHECK ((visibility = ANY (ARRAY['private'::text, 'cohort'::text])));
alter table public.edu_campus_preferences add constraint fixture_edu_campus_preferences_0 CHECK (((jsonb_typeof(known_lessons) = 'object'::text) AND (octet_length((known_lessons)::text) <= 120000)));
alter table public.edu_campus_preferences add constraint fixture_edu_campus_preferences_1 CHECK ((mode = ANY (ARRAY['quiet'::text, 'together'::text, 'help'::text])));
alter table public.edu_campus_preferences add constraint fixture_edu_campus_preferences_2 PRIMARY KEY (user_id);
alter table public.edu_campus_reports add constraint fixture_edu_campus_reports_1 PRIMARY KEY (id);
alter table public.edu_campus_reports add constraint fixture_edu_campus_reports_3 CHECK (((length(reason) >= 5) AND (length(reason) <= 1000)));
alter table public.edu_campus_reports add constraint fixture_edu_campus_reports_5 CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])));
alter table public.edu_campus_review_windows add constraint fixture_edu_campus_review_windows_1 UNIQUE (cohort_id, mission_id);
alter table public.edu_campus_review_windows add constraint fixture_edu_campus_review_windows_4 PRIMARY KEY (id);
alter table public.edu_campus_review_windows add constraint fixture_edu_campus_review_windows_5 CHECK ((revision > 0));
alter table public.edu_campus_review_windows add constraint fixture_edu_campus_review_windows_6 CHECK ((status = ANY (ARRAY['planned'::text, 'cancelled'::text])));
alter table public.edu_campus_reward_rules add constraint fixture_edu_campus_reward_rules_0 PRIMARY KEY (version);
alter table public.edu_campus_space_chat add constraint fixture_edu_campus_space_chat_0 CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 300)));
alter table public.edu_campus_space_chat add constraint fixture_edu_campus_space_chat_2 PRIMARY KEY (id);
alter table public.edu_campus_space_controls add constraint fixture_edu_campus_space_controls_0 CHECK ((char_length(announcement) <= 500));
alter table public.edu_campus_space_controls add constraint fixture_edu_campus_space_controls_1 CHECK (((cardinality(closed_zones) <= 6) AND (closed_zones <@ ARRAY['desk'::text, 'mission'::text, 'board'::text, 'chat'::text, 'terrace'::text, 'launch'::text])));
alter table public.edu_campus_space_controls add constraint fixture_edu_campus_space_controls_3 PRIMARY KEY (cohort_id);
alter table public.edu_campus_space_controls add constraint fixture_edu_campus_space_controls_4 CHECK ((revision > 0));
alter table public.edu_campus_space_http_metrics add constraint fixture_edu_campus_space_http_metrics_0 CHECK ((client_errors >= 0));
alter table public.edu_campus_space_http_metrics add constraint fixture_edu_campus_space_http_metrics_2 CHECK ((max_ms >= 0));
alter table public.edu_campus_space_http_metrics add constraint fixture_edu_campus_space_http_metrics_3 PRIMARY KEY (cohort_id, bucket_at);
alter table public.edu_campus_space_http_metrics add constraint fixture_edu_campus_space_http_metrics_4 CHECK ((requests >= 0));
alter table public.edu_campus_space_http_metrics add constraint fixture_edu_campus_space_http_metrics_5 CHECK ((server_errors >= 0));
alter table public.edu_campus_space_http_metrics add constraint fixture_edu_campus_space_http_metrics_6 CHECK ((slow_requests >= 0));
alter table public.edu_campus_space_http_metrics add constraint fixture_edu_campus_space_http_metrics_7 CHECK ((total_ms >= 0));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_0 CHECK ((accessory = ANY (ARRAY['none'::text, 'glasses'::text, 'headset'::text])));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_1 CHECK (((avatar_model >= 0) AND (avatar_model <= 5)));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_2 CHECK ((coat ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_4 CHECK ((focus_mode = ANY (ARRAY[0, 3, 5, 25, 50])));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_5 CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text])));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_6 CHECK ((hair_color ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_7 CHECK ((held_item = ANY (ARRAY['none'::text, 'coffee'::text, 'book'::text])));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_8 CHECK (((char_length(btrim(nickname)) >= 1) AND (char_length(btrim(nickname)) <= 24)));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_9 CHECK ((pants_color ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_10 PRIMARY KEY (cohort_id, user_id);
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_11 CHECK ((skin_color ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.edu_campus_space_presence add constraint fixture_edu_campus_space_presence_12 CHECK ((status = ANY (ARRAY['quiet'::text, 'joinable'::text, 'help'::text, 'working'::text])));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_0 CHECK ((accessory = ANY (ARRAY['none'::text, 'glasses'::text, 'headset'::text])));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_1 CHECK (((avatar_model >= 0) AND (avatar_model <= 5)));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_2 CHECK ((coat ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_3 CHECK ((char_length(desk) <= 120));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_4 CHECK ((desk_theme = ANY (ARRAY['orbital'::text, 'night'::text, 'garden'::text])));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_5 CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text])));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_6 CHECK ((hair_color ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_7 CHECK ((held_item = ANY (ARRAY['none'::text, 'coffee'::text, 'book'::text])));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_8 CHECK (((char_length(btrim(nickname)) >= 1) AND (char_length(btrim(nickname)) <= 24)));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_9 CHECK ((char_length(note) <= 2000));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_10 CHECK ((pants_color ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_11 PRIMARY KEY (user_id);
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_12 CHECK ((skin_color ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.edu_campus_space_profiles add constraint fixture_edu_campus_space_profiles_13 CHECK ((status = ANY (ARRAY['quiet'::text, 'joinable'::text, 'help'::text, 'working'::text])));
alter table public.edu_campus_space_seats add constraint fixture_edu_campus_space_seats_1 UNIQUE (cohort_id, user_id);
alter table public.edu_campus_space_seats add constraint fixture_edu_campus_space_seats_2 PRIMARY KEY (cohort_id, seat_id);
alter table public.edu_campus_space_seats add constraint fixture_edu_campus_space_seats_3 CHECK ((seat_id = ANY (ARRAY['desk-1'::text, 'desk-2'::text, 'desk-3'::text])));
alter table public.edu_campus_support_actions add constraint fixture_edu_campus_support_actions_1 CHECK (((length(btrim(content)) >= 1) AND (length(btrim(content)) <= 4000)));
alter table public.edu_campus_support_actions add constraint fixture_edu_campus_support_actions_2 CHECK ((destination_status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text])));
alter table public.edu_campus_support_actions add constraint fixture_edu_campus_support_actions_3 CHECK ((kind = ANY (ARRAY['reply'::text, 'handover'::text, 'status'::text])));
alter table public.edu_campus_support_actions add constraint fixture_edu_campus_support_actions_4 PRIMARY KEY (id);
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_0 CHECK ((tool_kind = ANY (ARRAY['unspecified'::text, 'ai'::text, 'website'::text, 'design'::text, 'advertising'::text, 'analytics'::text, 'automation'::text, 'other'::text])));
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_1 CHECK (((length(tool_name) <= 80) AND (tool_name !~ '[[:cntrl:]]'::text) AND (((tool_kind = 'unspecified'::text) AND (tool_name = ''::text)) OR ((tool_kind <> 'unspecified'::text) AND (length(btrim(tool_name)) >= 1)))));
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_2 CHECK ((category = ANY (ARRAY['understanding'::text, 'tool'::text, 'decision'::text, 'feedback'::text, 'time'::text])));
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_3 CHECK ((((lesson_id IS NULL) AND (lesson_version IS NULL)) OR ((lesson_id IS NOT NULL) AND ((length(lesson_version) >= 1) AND (length(lesson_version) <= 160)))));
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_4 CHECK (((length(context_url) <= 2000) AND ((context_url = ''::text) OR (context_url ~ '^https?://'::text))));
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_6 PRIMARY KEY (id);
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_7 CHECK (((length(btrim(question)) >= 1) AND (length(btrim(question)) <= 4000)));
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_8 CHECK ((revision > 0));
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_9 CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'withdrawn'::text])));
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_10 CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 120)));
alter table public.edu_campus_support_requests add constraint fixture_edu_campus_support_requests_11 CHECK ((length(tried) <= 2000));
alter table public.edu_diagnosis_attempts add constraint fixture_edu_diagnosis_attempts_0 CHECK (((state <> ALL (ARRAY['in_progress'::text, 'submitted'::text, 'processing'::text, 'ready'::text])) OR (remote_response_id IS NOT NULL)));
alter table public.edu_diagnosis_attempts add constraint fixture_edu_diagnosis_attempts_1 CHECK (((state = 'ready'::text) = (report_id IS NOT NULL)));
alter table public.edu_diagnosis_attempts add constraint fixture_edu_diagnosis_attempts_2 CHECK ((diagnosis_code = 'myin-n6'::text));
alter table public.edu_diagnosis_attempts add constraint fixture_edu_diagnosis_attempts_4 PRIMARY KEY (id);
alter table public.edu_diagnosis_attempts add constraint fixture_edu_diagnosis_attempts_5 UNIQUE (remote_response_id);
alter table public.edu_diagnosis_attempts add constraint fixture_edu_diagnosis_attempts_6 CHECK ((remote_revision >= '-1'::integer));
alter table public.edu_diagnosis_attempts add constraint fixture_edu_diagnosis_attempts_8 UNIQUE (replaces_attempt_id);
alter table public.edu_diagnosis_attempts add constraint fixture_edu_diagnosis_attempts_9 UNIQUE (report_id);
alter table public.edu_diagnosis_attempts add constraint fixture_edu_diagnosis_attempts_10 CHECK ((state = ANY (ARRAY['preparing'::text, 'in_progress'::text, 'submitted'::text, 'processing'::text, 'ready'::text, 'needs_review'::text])));
alter table public.edu_diagnosis_outbox add constraint fixture_edu_diagnosis_outbox_1 UNIQUE (attempt_id);
alter table public.edu_diagnosis_outbox add constraint fixture_edu_diagnosis_outbox_2 CHECK (((state = 'working'::text) = ((lease IS NOT NULL) AND (lease_until IS NOT NULL))));
alter table public.edu_diagnosis_outbox add constraint fixture_edu_diagnosis_outbox_3 CHECK ((kind = 'ensure_session'::text));
alter table public.edu_diagnosis_outbox add constraint fixture_edu_diagnosis_outbox_4 CHECK ((last_code = ANY (ARRAY['REMOTE_UNAVAILABLE'::text, 'ACCESS_REVOKED'::text, 'RETRY_LIMIT'::text, 'REMOTE_REJECTED'::text])));
alter table public.edu_diagnosis_outbox add constraint fixture_edu_diagnosis_outbox_5 PRIMARY KEY (id);
alter table public.edu_diagnosis_outbox add constraint fixture_edu_diagnosis_outbox_6 CHECK ((state = ANY (ARRAY['pending'::text, 'working'::text, 'done'::text, 'needs_review'::text])));
alter table public.edu_diagnosis_outbox add constraint fixture_edu_diagnosis_outbox_7 CHECK (((tries >= 0) AND (tries <= 8)));
alter table public.edu_event_actions add constraint fixture_edu_event_actions_0 CHECK ((action = ANY (ARRAY['download'::text, 'detail'::text, 'live_claim'::text])));
alter table public.edu_event_actions add constraint fixture_edu_event_actions_1 PRIMARY KEY (id);
alter table public.edu_event_awards add constraint fixture_edu_event_awards_0 PRIMARY KEY (zone_id, user_id);
alter table public.edu_event_invites add constraint fixture_edu_event_invites_0 PRIMARY KEY (id);
alter table public.edu_event_invites add constraint fixture_edu_event_invites_1 CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text));
alter table public.edu_event_invites add constraint fixture_edu_event_invites_2 UNIQUE (token_hash);
alter table public.edu_lesson_answer_files add constraint fixture_edu_lesson_answer_files_0 CHECK (((length(block_id) >= 1) AND (length(block_id) <= 100)));
alter table public.edu_lesson_answer_files add constraint fixture_edu_lesson_answer_files_1 CHECK (((ready_at IS NULL) = (sha256 IS NULL)));
alter table public.edu_lesson_answer_files add constraint fixture_edu_lesson_answer_files_3 CHECK ((kind = ANY (ARRAY['image'::text, 'file'::text])));
alter table public.edu_lesson_answer_files add constraint fixture_edu_lesson_answer_files_5 CHECK (((length(name) >= 1) AND (length(name) <= 240)));
alter table public.edu_lesson_answer_files add constraint fixture_edu_lesson_answer_files_7 UNIQUE (path);
alter table public.edu_lesson_answer_files add constraint fixture_edu_lesson_answer_files_8 PRIMARY KEY (id);
alter table public.edu_lesson_answer_files add constraint fixture_edu_lesson_answer_files_10 CHECK (((sha256 IS NULL) OR (sha256 ~ '^[a-f0-9]{64}$'::text)));
alter table public.edu_lesson_answer_files add constraint fixture_edu_lesson_answer_files_11 CHECK (((size >= 1) AND (size <= 10485760)));
alter table public.edu_lesson_author_heads add constraint fixture_edu_lesson_author_heads_3 PRIMARY KEY (lesson_id);
alter table public.edu_lesson_author_publications add constraint fixture_edu_lesson_author_publications_3 PRIMARY KEY (id);
alter table public.edu_lesson_author_save_notes add constraint fixture_edu_lesson_author_save_notes_0 CHECK ((length(note) <= 160));
alter table public.edu_lesson_author_save_notes add constraint fixture_edu_lesson_author_save_notes_1 PRIMARY KEY (revision);
alter table public.edu_lesson_author_save_notes add constraint fixture_edu_lesson_author_save_notes_3 CHECK ((source = ANY (ARRAY['manual'::text, 'autosave'::text, 'backup'::text])));
alter table public.edu_lesson_author_versions add constraint fixture_edu_lesson_author_versions_1 CHECK ((kind = ANY (ARRAY['baseline'::text, 'draft'::text])));
alter table public.edu_lesson_author_versions add constraint fixture_edu_lesson_author_versions_3 UNIQUE (lesson_id, id);
alter table public.edu_lesson_author_versions add constraint fixture_edu_lesson_author_versions_4 CHECK (((jsonb_typeof(payload) = 'object'::text) AND (octet_length((payload)::text) <= 4000000)));
alter table public.edu_lesson_author_versions add constraint fixture_edu_lesson_author_versions_5 PRIMARY KEY (id);
alter table public.edu_lesson_block_drafts add constraint fixture_edu_lesson_block_drafts_1 PRIMARY KEY (enrollment_id, revision);
alter table public.edu_lesson_block_drafts add constraint fixture_edu_lesson_block_drafts_3 CHECK (((jsonb_typeof("values") = 'object'::text) AND (octet_length(("values")::text) <= 1000000)));
alter table public.edu_lesson_block_feedback add constraint fixture_edu_lesson_block_feedback_1 CHECK (((length(feedback) <= 2000) AND (feedback ~ '[^[:space:]]'::text)));
alter table public.edu_lesson_block_feedback add constraint fixture_edu_lesson_block_feedback_2 PRIMARY KEY (id);
alter table public.edu_lesson_block_feedback add constraint fixture_edu_lesson_block_feedback_3 CHECK ((source = ANY (ARRAY['comment'::text, 'decision'::text])));
alter table public.edu_lesson_block_heads add constraint fixture_edu_lesson_block_heads_2 PRIMARY KEY (lesson_id);
alter table public.edu_lesson_block_reviews add constraint fixture_edu_lesson_block_reviews_1 CHECK ((decision = ANY (ARRAY['approved'::text, 'changes_requested'::text, 'reopened'::text, 'auto_approved'::text])));
alter table public.edu_lesson_block_reviews add constraint fixture_edu_lesson_block_reviews_2 CHECK ((length(feedback) <= 2000));
alter table public.edu_lesson_block_reviews add constraint fixture_edu_lesson_block_reviews_3 PRIMARY KEY (id);
alter table public.edu_lesson_block_reviews add constraint fixture_edu_lesson_block_reviews_4 UNIQUE (submission_id, expected_state);
alter table public.edu_lesson_block_submissions add constraint fixture_edu_lesson_block_submissions_1 CHECK ((jsonb_typeof(assessment) = 'object'::text));
alter table public.edu_lesson_block_submissions add constraint fixture_edu_lesson_block_submissions_4 CHECK ((outcome = ANY (ARRAY['completed'::text, 'submitted'::text])));
alter table public.edu_lesson_block_submissions add constraint fixture_edu_lesson_block_submissions_5 PRIMARY KEY (id);
alter table public.edu_lesson_block_submissions add constraint fixture_edu_lesson_block_submissions_6 CHECK (((jsonb_typeof("values") = 'object'::text) AND (octet_length(("values")::text) <= 1000000)));
alter table public.edu_lesson_block_versions add constraint fixture_edu_lesson_block_versions_1 CHECK (((jsonb_typeof(document) = 'object'::text) AND (document ?& ARRAY['schemaVersion'::text, 'blocks'::text, 'checklist'::text]) AND ((document -> 'schemaVersion'::text) = '1'::jsonb) AND (jsonb_typeof((document -> 'blocks'::text)) = 'array'::text) AND (jsonb_typeof((document -> 'checklist'::text)) = 'array'::text) AND (octet_length((document)::text) <= 4000000)));
alter table public.edu_lesson_block_versions add constraint fixture_edu_lesson_block_versions_3 UNIQUE (lesson_id, id);
alter table public.edu_lesson_block_versions add constraint fixture_edu_lesson_block_versions_4 PRIMARY KEY (id);
alter table public.edu_lesson_block_versions add constraint fixture_edu_lesson_block_versions_5 CHECK (((NOT (document ? 'presentation'::text)) OR ((jsonb_typeof((document -> 'presentation'::text)) = 'object'::text) AND ((document -> 'presentation'::text) ?& ARRAY['tag'::text, 'tagLabel'::text]) AND (((document -> 'presentation'::text) - ARRAY['tag'::text, 'tagLabel'::text]) = '{}'::jsonb) AND (jsonb_typeof(((document -> 'presentation'::text) -> 'tag'::text)) = 'string'::text) AND (jsonb_typeof(((document -> 'presentation'::text) -> 'tagLabel'::text)) = 'string'::text) AND (length(((document -> 'presentation'::text) ->> 'tag'::text)) <= 100) AND (length(((document -> 'presentation'::text) ->> 'tagLabel'::text)) <= 100))));
alter table public.edu_lesson_media add constraint fixture_edu_lesson_media_0 CHECK (((ready_at IS NULL) = (sha256 IS NULL)));
alter table public.edu_lesson_media add constraint fixture_edu_lesson_media_1 CHECK (((kind <> 'image'::text) OR (size <= 10485760)));
alter table public.edu_lesson_media add constraint fixture_edu_lesson_media_3 UNIQUE (course_id, path);
alter table public.edu_lesson_media add constraint fixture_edu_lesson_media_4 CHECK ((kind = ANY (ARRAY['image'::text, 'audio'::text, 'video'::text, 'file'::text])));
alter table public.edu_lesson_media add constraint fixture_edu_lesson_media_5 CHECK (((length(name) >= 1) AND (length(name) <= 240)));
alter table public.edu_lesson_media add constraint fixture_edu_lesson_media_7 PRIMARY KEY (id);
alter table public.edu_lesson_media add constraint fixture_edu_lesson_media_8 CHECK (((sha256 IS NULL) OR (sha256 ~ '^[a-f0-9]{64}$'::text)));
alter table public.edu_lesson_media add constraint fixture_edu_lesson_media_9 CHECK (((size >= 1) AND (size <= 52428800)));
alter table public.edu_lesson_qa_plans add constraint fixture_edu_lesson_qa_plans_0 CHECK (((length(answer) >= 1) AND (length(answer) <= 10000)));
alter table public.edu_lesson_qa_plans add constraint fixture_edu_lesson_qa_plans_3 CHECK ((octet_length((payload)::text) <= 4000000));
alter table public.edu_lesson_qa_plans add constraint fixture_edu_lesson_qa_plans_4 PRIMARY KEY (id);
alter table public.edu_lesson_qa_plans add constraint fixture_edu_lesson_qa_plans_6 CHECK (((length(title) >= 1) AND (length(title) <= 200)));
alter table public.edu_member_encouragements add constraint fixture_edu_member_encouragements_0 UNIQUE (id);
alter table public.edu_member_encouragements add constraint fixture_edu_member_encouragements_1 PRIMARY KEY (user_id);
alter table public.edu_member_encouragements add constraint fixture_edu_member_encouragements_3 CHECK (((char_length(message) <= 80) AND (message = btrim(message))));
alter table public.edu_member_encouragements add constraint fixture_edu_member_encouragements_4 CHECK (((message = ''::text) OR (public_name <> ''::text)));
alter table public.edu_member_encouragements add constraint fixture_edu_member_encouragements_5 CHECK (((char_length(public_name) <= 40) AND (public_name = btrim(public_name))));
alter table public.edu_member_messages add constraint fixture_edu_member_messages_0 CHECK ((sender_id <> recipient_id));
alter table public.edu_member_messages add constraint fixture_edu_member_messages_1 CHECK (((length(content) >= 1) AND (content ~ '[^[:space:]]'::text) AND (is_notice OR (length(content) <= 5000))));
alter table public.edu_member_messages add constraint fixture_edu_member_messages_3 PRIMARY KEY (id);
alter table public.edu_member_messages add constraint fixture_edu_member_messages_8 UNIQUE (sender_id, request_id, recipient_id);
alter table public.edu_member_messages add constraint fixture_edu_member_messages_9 UNIQUE (sequence);
alter table public.edu_member_messages add constraint fixture_edu_member_messages_10 CHECK ((((deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((deleted_at IS NOT NULL) AND (deleted_by IS NOT NULL) AND (is_notice OR (deleted_by = sender_id)))));
alter table public.edu_member_messages add constraint fixture_edu_member_messages_11 CHECK ((((NOT is_notice) AND (sender_id IS NOT NULL) AND (request_id IS NOT NULL) AND (notice_source IS NULL) AND (target_path IS NULL)) OR (is_notice AND (sender_id IS NULL) AND (request_id IS NULL) AND (reply_to IS NULL) AND (notice_source IS NOT NULL) AND (target_path IS NOT NULL))));
alter table public.edu_member_mvp add constraint fixture_edu_member_mvp_0 PRIMARY KEY (user_id);
alter table public.edu_member_mvp add constraint fixture_edu_member_mvp_3 CHECK (((border_color IS NULL) OR (border_color ~ '^#[0-9A-F]{6}$'::text)));
alter table public.edu_member_mvp add constraint fixture_edu_member_mvp_4 CHECK ((is_mvp OR (border_color IS NULL)));
alter table public.edu_member_visits add constraint fixture_edu_member_visits_0 CHECK ((last_seen_at >= first_seen_at));
alter table public.edu_member_visits add constraint fixture_edu_member_visits_1 CHECK ((((first_seen_at AT TIME ZONE 'Asia/Seoul'::text))::date = visit_day));
alter table public.edu_member_visits add constraint fixture_edu_member_visits_2 CHECK ((((last_seen_at AT TIME ZONE 'Asia/Seoul'::text))::date = visit_day));
alter table public.edu_member_visits add constraint fixture_edu_member_visits_3 PRIMARY KEY (user_id, visit_day);
alter table public.edu_mission_drafts add constraint fixture_edu_mission_drafts_1 UNIQUE (enrollment_id, mission_id);
alter table public.edu_mission_drafts add constraint fixture_edu_mission_drafts_3 PRIMARY KEY (id);
alter table public.edu_mission_drafts add constraint fixture_edu_mission_drafts_4 CHECK ((jsonb_typeof(response) = 'object'::text));
alter table public.edu_mutation_receipts add constraint fixture_edu_mutation_receipts_1 PRIMARY KEY (actor_id, request_id);
alter table public.edu_onboarding_steps add constraint fixture_edu_onboarding_steps_0 CHECK ((((step = 'learning'::text) AND (length(btrim(comment)) > 0)) OR ((step <> 'learning'::text) AND (comment = ''::text))));
alter table public.edu_onboarding_steps add constraint fixture_edu_onboarding_steps_1 CHECK ((length(comment) <= 1000));
alter table public.edu_onboarding_steps add constraint fixture_edu_onboarding_steps_2 CHECK ((length(confirmation_value) <= 100));
alter table public.edu_onboarding_steps add constraint fixture_edu_onboarding_steps_4 PRIMARY KEY (order_id, step);
alter table public.edu_onboarding_steps add constraint fixture_edu_onboarding_steps_5 CHECK ((step = ANY (ARRAY['telegram'::text, 'app'::text, 'orientation'::text, 'learning'::text])));
alter table public.edu_purchase_onboarding add constraint fixture_edu_purchase_onboarding_1 PRIMARY KEY (order_id);
alter table public.edu_purchase_onboarding add constraint fixture_edu_purchase_onboarding_2 CHECK ((survey_room = ANY (ARRAY['paid'::text, 'organic'::text, 'unknown'::text])));
alter table public.edu_purchase_onboarding add constraint fixture_edu_purchase_onboarding_3 CHECK ((tg_path = ANY (ARRAY['existing'::text, 'new'::text])));
alter table public.edu_push_events add constraint fixture_edu_push_events_0 CHECK ((kind = ANY (ARRAY['message'::text, 'question'::text, 'answer'::text, 'submission'::text, 'review'::text, 'diagnosis_ready'::text])));
alter table public.edu_push_events add constraint fixture_edu_push_events_1 CHECK (((path = ANY (ARRAY['/my/messages'::text, '/my/questions'::text, '/my/missions'::text, '/admin/questions'::text, '/admin/reviews'::text, '/admin/reviews?tab=blocks'::text, '/admin/reviews?tab=missions'::text, '/my/diagnosis'::text, '/admin/diagnosis'::text])) OR (path ~ '^/my/questions[?]question=[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'::text) OR (path ~ '^/learn/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'::text)));
alter table public.edu_push_events add constraint fixture_edu_push_events_2 PRIMARY KEY (id);
alter table public.edu_push_events add constraint fixture_edu_push_events_3 CHECK ((length(source) <= 200));
alter table public.edu_push_events add constraint fixture_edu_push_events_5 UNIQUE (user_id, kind, source);
alter table public.edu_push_subscriptions add constraint fixture_edu_push_subscriptions_0 CHECK (((length(endpoint) >= 20) AND (length(endpoint) <= 2048)));
alter table public.edu_push_subscriptions add constraint fixture_edu_push_subscriptions_1 UNIQUE (endpoint);
alter table public.edu_push_subscriptions add constraint fixture_edu_push_subscriptions_2 PRIMARY KEY (id);
alter table public.edu_question_answer_images add constraint fixture_edu_question_answer_images_1 UNIQUE (answer_id);
alter table public.edu_question_answer_images add constraint fixture_edu_question_answer_images_2 CHECK (((ready_at IS NULL) = (sha256 IS NULL)));
alter table public.edu_question_answer_images add constraint fixture_edu_question_answer_images_3 CHECK ((extension = ANY (ARRAY['png'::text, 'jpg'::text, 'jpeg'::text, 'gif'::text, 'webp'::text])));
alter table public.edu_question_answer_images add constraint fixture_edu_question_answer_images_4 CHECK (((length(name) >= 1) AND (length(name) <= 240)));
alter table public.edu_question_answer_images add constraint fixture_edu_question_answer_images_6 UNIQUE (path);
alter table public.edu_question_answer_images add constraint fixture_edu_question_answer_images_7 PRIMARY KEY (id);
alter table public.edu_question_answer_images add constraint fixture_edu_question_answer_images_9 CHECK (((sha256 IS NULL) OR (sha256 ~ '^[a-f0-9]{64}$'::text)));
alter table public.edu_question_answer_images add constraint fixture_edu_question_answer_images_10 CHECK (((size >= 1) AND (size <= 10485760)));
alter table public.edu_question_answers add constraint fixture_edu_question_answers_0 CHECK ((((deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((deleted_at IS NOT NULL) AND (deleted_by IS NOT NULL) AND (source <> 'learner'::text))));
alter table public.edu_question_answers add constraint fixture_edu_question_answers_2 CHECK ((content ~ '[^[:space:]]'::text));
alter table public.edu_question_answers add constraint fixture_edu_question_answers_4 PRIMARY KEY (id);
alter table public.edu_question_answers add constraint fixture_edu_question_answers_6 CHECK ((source = ANY (ARRAY['operator'::text, 'legacy'::text, 'learner'::text, 'faq'::text, 'aside'::text])));
alter table public.edu_question_assist_jobs add constraint fixture_edu_question_assist_jobs_1 CHECK (((status = 'waiting'::text) = (draft IS NULL)));
alter table public.edu_question_assist_jobs add constraint fixture_edu_question_assist_jobs_2 CHECK (((length(draft) >= 1) AND (length(draft) <= 10000)));
alter table public.edu_question_assist_jobs add constraint fixture_edu_question_assist_jobs_3 PRIMARY KEY (id);
alter table public.edu_question_assist_jobs add constraint fixture_edu_question_assist_jobs_6 CHECK ((status = ANY (ARRAY['waiting'::text, 'draft'::text, 'used'::text])));
alter table public.edu_question_images add constraint fixture_edu_question_images_0 CHECK (((ready_at IS NULL) = (sha256 IS NULL)));
alter table public.edu_question_images add constraint fixture_edu_question_images_2 CHECK ((extension = ANY (ARRAY['png'::text, 'jpg'::text, 'jpeg'::text, 'gif'::text, 'webp'::text])));
alter table public.edu_question_images add constraint fixture_edu_question_images_4 CHECK (((length(name) >= 1) AND (length(name) <= 240)));
alter table public.edu_question_images add constraint fixture_edu_question_images_6 UNIQUE (path);
alter table public.edu_question_images add constraint fixture_edu_question_images_7 PRIMARY KEY (id);
alter table public.edu_question_images add constraint fixture_edu_question_images_8 CHECK (((sha256 IS NULL) OR (sha256 ~ '^[a-f0-9]{64}$'::text)));
alter table public.edu_question_images add constraint fixture_edu_question_images_9 CHECK (((size >= 1) AND (size <= 10485760)));
alter table public.edu_questions add constraint fixture_edu_questions_1 CHECK ((category = ANY (ARRAY['learning'::text, 'general'::text, 'payment'::text, 'account'::text])));
alter table public.edu_questions add constraint fixture_edu_questions_2 CHECK (((length(content) >= 1) AND (length(content) <= 10000)));
alter table public.edu_questions add constraint fixture_edu_questions_6 UNIQUE (image_id);
alter table public.edu_questions add constraint fixture_edu_questions_9 PRIMARY KEY (id);
alter table public.edu_questions add constraint fixture_edu_questions_11 CHECK ((status = ANY (ARRAY['open'::text, 'answered'::text])));
alter table public.edu_questions add constraint fixture_edu_questions_12 CHECK (((length(title) >= 1) AND (length(title) <= 200)));
alter table public.edu_questions add constraint fixture_edu_questions_14 CHECK ((visibility = ANY (ARRAY['private'::text, 'cohort'::text])));
alter table public.edu_shared_answers add constraint fixture_edu_shared_answers_0 CHECK (((length(btrim(answer)) >= 1) AND (length(btrim(answer)) <= 10000)));
alter table public.edu_shared_answers add constraint fixture_edu_shared_answers_4 PRIMARY KEY (id);
alter table public.edu_shared_answers add constraint fixture_edu_shared_answers_6 UNIQUE (source_question_id);
alter table public.edu_shared_answers add constraint fixture_edu_shared_answers_7 CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 200)));
alter table public.enrollments add constraint fixture_enrollments_4 UNIQUE (order_item_id);
alter table public.enrollments add constraint fixture_enrollments_5 PRIMARY KEY (id);
alter table public.enrollments add constraint fixture_enrollments_6 CHECK ((source = ANY (ARRAY['purchase'::text, 'admin_grant'::text])));
alter table public.enrollments add constraint fixture_enrollments_7 CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text, 'refunded'::text])));
alter table public.enrollments add constraint fixture_enrollments_8 UNIQUE (user_id, cohort_id);
alter table public.kakao_sync_members add constraint fixture_kakao_sync_members_0 UNIQUE (app_id, kakao_user_id);
alter table public.kakao_sync_members add constraint fixture_kakao_sync_members_1 CHECK ((channel_relation = ANY (ARRAY['ADDED'::text, 'BLOCKED'::text, 'NONE'::text, 'UNKNOWN'::text])));
alter table public.kakao_sync_members add constraint fixture_kakao_sync_members_2 PRIMARY KEY (user_id);
alter table public.kakao_sync_members add constraint fixture_kakao_sync_members_3 CHECK ((jsonb_typeof(terms) = 'array'::text));
alter table public.lesson_progress add constraint fixture_lesson_progress_1 UNIQUE (enrollment_id, lesson_id);
alter table public.lesson_progress add constraint fixture_lesson_progress_2 CHECK ((last_position_seconds >= 0));
alter table public.lesson_progress add constraint fixture_lesson_progress_4 PRIMARY KEY (id);
alter table public.lesson_progress add constraint fixture_lesson_progress_5 CHECK (((progress_percent >= 0) AND (progress_percent <= 100)));
alter table public.member_group_members add constraint fixture_member_group_members_2 PRIMARY KEY (group_id, member_id);
alter table public.mission_submissions add constraint fixture_mission_submissions_0 CHECK ((attempt_number > 0));
alter table public.mission_submissions add constraint fixture_mission_submissions_1 CHECK ((((status = 'submitted'::text) AND (reviewed_at IS NULL) AND (reviewed_by IS NULL)) OR ((status = ANY (ARRAY['changes_requested'::text, 'approved'::text, 'rejected'::text])) AND (reviewed_at IS NOT NULL))));
alter table public.mission_submissions add constraint fixture_mission_submissions_3 UNIQUE (enrollment_id, mission_id, attempt_number);
alter table public.mission_submissions add constraint fixture_mission_submissions_5 PRIMARY KEY (id);
alter table public.mission_submissions add constraint fixture_mission_submissions_6 CHECK ((jsonb_typeof(response) = 'object'::text));
alter table public.mission_submissions add constraint fixture_mission_submissions_8 CHECK ((status = ANY (ARRAY['submitted'::text, 'changes_requested'::text, 'approved'::text, 'rejected'::text])));
alter table public.mission_submissions add constraint fixture_mission_submissions_9 CHECK (((NOT quiz_required) OR (quiz_passed IS TRUE)));
alter table private.campus_student_connections add constraint fixture_fk_campus_student_connections_0 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table private.campus_student_connections add constraint fixture_fk_campus_student_connections_1 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table private.edu_campus_community_receipts add constraint fixture_fk_edu_campus_community_receipts_0 FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table private.edu_campus_office_connectors add constraint fixture_fk_edu_campus_office_connectors_1 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table private.edu_campus_office_dispatches add constraint fixture_fk_edu_campus_office_dispatches_1 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id);
alter table private.edu_campus_office_dispatches add constraint fixture_fk_edu_campus_office_dispatches_2 FOREIGN KEY (job_id) REFERENCES edu_campus_office_jobs(id);
alter table private.edu_campus_office_dispatches add constraint fixture_fk_edu_campus_office_dispatches_7 FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table private.edu_campus_office_events add constraint fixture_fk_edu_campus_office_events_0 FOREIGN KEY (job_id) REFERENCES edu_campus_office_jobs(id) ON DELETE CASCADE;
alter table private.edu_campus_office_receipts add constraint fixture_fk_edu_campus_office_receipts_0 FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.course_content_claims add constraint fixture_fk_course_content_claims_5 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.crm_member_tags add constraint fixture_fk_crm_member_tags_0 FOREIGN KEY (assigned_by) REFERENCES profiles(id);
alter table public.crm_member_tags add constraint fixture_fk_crm_member_tags_2 FOREIGN KEY (member_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.customer_journey_events add constraint fixture_fk_customer_journey_events_3 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.edu_ai_calls add constraint fixture_fk_edu_ai_calls_7 FOREIGN KEY (request_id) REFERENCES edu_ai_requests(id) ON DELETE CASCADE;
alter table public.edu_ai_conversation_turns add constraint fixture_fk_edu_ai_conversation_turns_2 FOREIGN KEY (conversation_id) REFERENCES edu_ai_conversations(id) ON DELETE CASCADE;
alter table public.edu_ai_conversation_turns add constraint fixture_fk_edu_ai_conversation_turns_4 FOREIGN KEY (image_id) REFERENCES edu_question_images(id) ON DELETE SET NULL;
alter table public.edu_ai_conversation_turns add constraint fixture_fk_edu_ai_conversation_turns_7 FOREIGN KEY (request_id) REFERENCES edu_ai_requests(id) ON DELETE CASCADE;
alter table public.edu_ai_conversations add constraint fixture_fk_edu_ai_conversations_1 FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_ai_conversations add constraint fixture_fk_edu_ai_conversations_2 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_ai_requests add constraint fixture_fk_edu_ai_requests_0 FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.edu_ai_requests add constraint fixture_fk_edu_ai_requests_2 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE SET NULL;
alter table public.edu_ai_requests add constraint fixture_fk_edu_ai_requests_7 FOREIGN KEY (question_id) REFERENCES edu_questions(id) ON DELETE SET NULL;
alter table public.edu_campus_activity_batches add constraint fixture_fk_edu_campus_activity_batches_4 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.edu_campus_analytics_settings add constraint fixture_fk_edu_campus_analytics_settings_2 FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.edu_campus_archive_commands add constraint fixture_fk_edu_campus_archive_commands_0 FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_archive_commands add constraint fixture_fk_edu_campus_archive_commands_1 FOREIGN KEY (entry_id) REFERENCES edu_campus_archive_entries(id) ON DELETE CASCADE;
alter table public.edu_campus_archive_entries add constraint fixture_fk_edu_campus_archive_entries_2 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_archive_entries add constraint fixture_fk_edu_campus_archive_entries_10 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_blocks add constraint fixture_fk_edu_campus_blocks_2 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_blocks add constraint fixture_fk_edu_campus_blocks_4 FOREIGN KEY (target_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_business_case_events add constraint fixture_fk_edu_campus_business_case_events_1 FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_business_case_events add constraint fixture_fk_edu_campus_business_case_events_2 FOREIGN KEY (case_id) REFERENCES edu_campus_business_cases(id) ON DELETE CASCADE;
alter table public.edu_campus_business_cases add constraint fixture_fk_edu_campus_business_cases_3 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_business_cases add constraint fixture_fk_edu_campus_business_cases_14 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_business_records add constraint fixture_fk_edu_campus_business_records_2 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_business_records add constraint fixture_fk_edu_campus_business_records_6 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_business_review_links add constraint fixture_fk_edu_campus_business_review_links_1 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_business_review_links add constraint fixture_fk_edu_campus_business_review_links_10 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_business_review_replies add constraint fixture_fk_edu_campus_business_review_replies_2 FOREIGN KEY (link_id) REFERENCES edu_campus_business_review_links(id) ON DELETE CASCADE;
alter table public.edu_campus_comments add constraint fixture_fk_edu_campus_comments_1 FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_comments add constraint fixture_fk_edu_campus_comments_4 FOREIGN KEY (post_id) REFERENCES edu_campus_posts(id) ON DELETE CASCADE;
alter table public.edu_campus_community_flow_history add constraint fixture_fk_edu_campus_community_flow_history_0 FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public.edu_campus_community_flow_history add constraint fixture_fk_edu_campus_community_flow_history_3 FOREIGN KEY (post_id) REFERENCES edu_campus_posts(id);
alter table public.edu_campus_demo_questions add constraint fixture_fk_edu_campus_demo_questions_1 FOREIGN KEY (author_id) REFERENCES profiles(id);
alter table public.edu_campus_demo_questions add constraint fixture_fk_edu_campus_demo_questions_4 FOREIGN KEY (slot_id) REFERENCES edu_campus_demo_slots(id);
alter table public.edu_campus_demo_slots add constraint fixture_fk_edu_campus_demo_slots_3 FOREIGN KEY (post_id) REFERENCES edu_campus_posts(id);
alter table public.edu_campus_demo_slots add constraint fixture_fk_edu_campus_demo_slots_4 FOREIGN KEY (presenter_id) REFERENCES profiles(id);
alter table public.edu_campus_exchanges add constraint fixture_fk_edu_campus_exchanges_4 FOREIGN KEY (post_id) REFERENCES edu_campus_posts(id);
alter table public.edu_campus_exchanges add constraint fixture_fk_edu_campus_exchanges_6 FOREIGN KEY (proposer_id) REFERENCES profiles(id);
alter table public.edu_campus_exchanges add constraint fixture_fk_edu_campus_exchanges_7 FOREIGN KEY (recipient_id) REFERENCES profiles(id);
alter table public.edu_campus_feedback_acknowledgments add constraint fixture_fk_edu_campus_feedback_acknowledgments_1 FOREIGN KEY (comment_id) REFERENCES edu_campus_comments(id) ON DELETE CASCADE;
alter table public.edu_campus_feedback_acknowledgments add constraint fixture_fk_edu_campus_feedback_acknowledgments_3 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_focus_sessions add constraint fixture_fk_edu_campus_focus_sessions_5 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_focus_sessions add constraint fixture_fk_edu_campus_focus_sessions_12 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_launches add constraint fixture_fk_edu_campus_launches_1 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_launches add constraint fixture_fk_edu_campus_launches_3 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_launches add constraint fixture_fk_edu_campus_launches_5 FOREIGN KEY (rule_version) REFERENCES edu_campus_reward_rules(version);
alter table public.edu_campus_moderation_log add constraint fixture_fk_edu_campus_moderation_log_0 FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public.edu_campus_moderation_log add constraint fixture_fk_edu_campus_moderation_log_2 FOREIGN KEY (post_id) REFERENCES edu_campus_posts(id) ON DELETE CASCADE;
alter table public.edu_campus_office_bookings add constraint fixture_fk_edu_campus_office_bookings_2 FOREIGN KEY (session_id) REFERENCES edu_campus_office_sessions(id) ON DELETE CASCADE;
alter table public.edu_campus_office_bookings add constraint fixture_fk_edu_campus_office_bookings_5 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_office_employees add constraint fixture_fk_edu_campus_office_employees_2 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_office_history add constraint fixture_fk_edu_campus_office_history_1 FOREIGN KEY (job_id) REFERENCES edu_campus_office_jobs(id) ON DELETE CASCADE;
alter table public.edu_campus_office_inbox_signals add constraint fixture_fk_edu_campus_office_inbox_signals_0 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_office_inbox_signals add constraint fixture_fk_edu_campus_office_inbox_signals_1 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_office_jobs add constraint fixture_fk_edu_campus_office_jobs_1 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_office_jobs add constraint fixture_fk_edu_campus_office_jobs_5 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_office_sessions add constraint fixture_fk_edu_campus_office_sessions_3 FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.edu_campus_personal_offices add constraint fixture_fk_edu_campus_personal_offices_1 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_portfolio_file_access_log add constraint fixture_fk_edu_campus_portfolio_file_access_log_0 FOREIGN KEY (file_id) REFERENCES edu_campus_portfolio_files(id);
alter table public.edu_campus_portfolio_file_access_log add constraint fixture_fk_edu_campus_portfolio_file_access_log_1 FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.edu_campus_portfolio_files add constraint fixture_fk_edu_campus_portfolio_files_2 FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.edu_campus_portfolio_files add constraint fixture_fk_edu_campus_portfolio_files_5 FOREIGN KEY (post_id) REFERENCES edu_campus_posts(id);
alter table public.edu_campus_post_revisions add constraint fixture_fk_edu_campus_post_revisions_2 FOREIGN KEY (post_id) REFERENCES edu_campus_posts(id) ON DELETE CASCADE;
alter table public.edu_campus_posts add constraint fixture_fk_edu_campus_posts_3 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_posts add constraint fixture_fk_edu_campus_posts_5 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_preferences add constraint fixture_fk_edu_campus_preferences_3 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_reports add constraint fixture_fk_edu_campus_reports_0 FOREIGN KEY (comment_id) REFERENCES edu_campus_comments(id) ON DELETE CASCADE;
alter table public.edu_campus_reports add constraint fixture_fk_edu_campus_reports_2 FOREIGN KEY (post_id) REFERENCES edu_campus_posts(id) ON DELETE CASCADE;
alter table public.edu_campus_reports add constraint fixture_fk_edu_campus_reports_4 FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_review_windows add constraint fixture_fk_edu_campus_review_windows_2 FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.edu_campus_space_chat add constraint fixture_fk_edu_campus_space_chat_3 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_space_controls add constraint fixture_fk_edu_campus_space_controls_5 FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table public.edu_campus_space_presence add constraint fixture_fk_edu_campus_space_presence_13 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_space_profiles add constraint fixture_fk_edu_campus_space_profiles_14 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_space_seats add constraint fixture_fk_edu_campus_space_seats_4 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_campus_support_actions add constraint fixture_fk_edu_campus_support_actions_0 FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public.edu_campus_support_actions add constraint fixture_fk_edu_campus_support_actions_5 FOREIGN KEY (request_id) REFERENCES edu_campus_support_requests(id) ON DELETE CASCADE;
alter table public.edu_campus_support_requests add constraint fixture_fk_edu_campus_support_requests_5 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_campus_support_requests add constraint fixture_fk_edu_campus_support_requests_12 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_diagnosis_attempts add constraint fixture_fk_edu_diagnosis_attempts_7 FOREIGN KEY (replaces_attempt_id) REFERENCES edu_diagnosis_attempts(id);
alter table public.edu_diagnosis_attempts add constraint fixture_fk_edu_diagnosis_attempts_11 FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.edu_diagnosis_outbox add constraint fixture_fk_edu_diagnosis_outbox_0 FOREIGN KEY (attempt_id) REFERENCES edu_diagnosis_attempts(id);
alter table public.edu_event_actions add constraint fixture_fk_edu_event_actions_2 FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.edu_event_awards add constraint fixture_fk_edu_event_awards_1 FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.edu_event_invites add constraint fixture_fk_edu_event_invites_3 FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.edu_lesson_answer_files add constraint fixture_fk_edu_lesson_answer_files_2 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id);
alter table public.edu_lesson_answer_files add constraint fixture_fk_edu_lesson_answer_files_6 FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.edu_lesson_answer_files add constraint fixture_fk_edu_lesson_answer_files_9 FOREIGN KEY (revision) REFERENCES edu_lesson_block_versions(id);
alter table public.edu_lesson_author_heads add constraint fixture_fk_edu_lesson_author_heads_1 FOREIGN KEY (lesson_id, published_revision) REFERENCES edu_lesson_author_versions(lesson_id, id);
alter table public.edu_lesson_author_heads add constraint fixture_fk_edu_lesson_author_heads_2 FOREIGN KEY (lesson_id, revision) REFERENCES edu_lesson_author_versions(lesson_id, id);
alter table public.edu_lesson_author_publications add constraint fixture_fk_edu_lesson_author_publications_0 FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.edu_lesson_author_publications add constraint fixture_fk_edu_lesson_author_publications_2 FOREIGN KEY (lesson_id, revision) REFERENCES edu_lesson_author_versions(lesson_id, id);
alter table public.edu_lesson_author_save_notes add constraint fixture_fk_edu_lesson_author_save_notes_2 FOREIGN KEY (revision) REFERENCES edu_lesson_author_versions(id);
alter table public.edu_lesson_author_versions add constraint fixture_fk_edu_lesson_author_versions_0 FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.edu_lesson_block_drafts add constraint fixture_fk_edu_lesson_block_drafts_0 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id);
alter table public.edu_lesson_block_drafts add constraint fixture_fk_edu_lesson_block_drafts_2 FOREIGN KEY (revision) REFERENCES edu_lesson_block_versions(id);
alter table public.edu_lesson_block_feedback add constraint fixture_fk_edu_lesson_block_feedback_0 FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public.edu_lesson_block_feedback add constraint fixture_fk_edu_lesson_block_feedback_4 FOREIGN KEY (submission_id) REFERENCES edu_lesson_block_submissions(id);
alter table public.edu_lesson_block_heads add constraint fixture_fk_edu_lesson_block_heads_1 FOREIGN KEY (lesson_id, revision) REFERENCES edu_lesson_block_versions(lesson_id, id);
alter table public.edu_lesson_block_reviews add constraint fixture_fk_edu_lesson_block_reviews_0 FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public.edu_lesson_block_reviews add constraint fixture_fk_edu_lesson_block_reviews_5 FOREIGN KEY (submission_id) REFERENCES edu_lesson_block_submissions(id);
alter table public.edu_lesson_block_submissions add constraint fixture_fk_edu_lesson_block_submissions_2 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id);
alter table public.edu_lesson_block_submissions add constraint fixture_fk_edu_lesson_block_submissions_3 FOREIGN KEY (lesson_id, revision) REFERENCES edu_lesson_block_versions(lesson_id, id);
alter table public.edu_lesson_block_versions add constraint fixture_fk_edu_lesson_block_versions_0 FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.edu_lesson_media add constraint fixture_fk_edu_lesson_media_6 FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.edu_lesson_media add constraint fixture_fk_edu_lesson_media_10 FOREIGN KEY (source_asset_id) REFERENCES edu_lesson_media(id);
alter table public.edu_lesson_qa_plans add constraint fixture_fk_edu_lesson_qa_plans_1 FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.edu_lesson_qa_plans add constraint fixture_fk_edu_lesson_qa_plans_5 FOREIGN KEY (question_id) REFERENCES edu_questions(id) ON DELETE CASCADE;
alter table public.edu_member_encouragements add constraint fixture_fk_edu_member_encouragements_2 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_member_messages add constraint fixture_fk_edu_member_messages_2 FOREIGN KEY (deleted_by) REFERENCES profiles(id);
alter table public.edu_member_messages add constraint fixture_fk_edu_member_messages_4 FOREIGN KEY (recipient_id) REFERENCES profiles(id);
alter table public.edu_member_messages add constraint fixture_fk_edu_member_messages_5 FOREIGN KEY (reply_to) REFERENCES edu_member_messages(id);
alter table public.edu_member_messages add constraint fixture_fk_edu_member_messages_6 FOREIGN KEY (sender_id) REFERENCES profiles(id);
alter table public.edu_member_messages add constraint fixture_fk_edu_member_messages_7 FOREIGN KEY (sender_id, request_id) REFERENCES edu_message_batches(actor_id, request_id);
alter table public.edu_member_mvp add constraint fixture_fk_edu_member_mvp_1 FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.edu_member_mvp add constraint fixture_fk_edu_member_mvp_2 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_member_visits add constraint fixture_fk_edu_member_visits_4 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_mission_drafts add constraint fixture_fk_edu_mission_drafts_0 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.edu_mission_drafts add constraint fixture_fk_edu_mission_drafts_5 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_mutation_receipts add constraint fixture_fk_edu_mutation_receipts_0 FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public.edu_onboarding_steps add constraint fixture_fk_edu_onboarding_steps_3 FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.edu_onboarding_steps add constraint fixture_fk_edu_onboarding_steps_6 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_purchase_onboarding add constraint fixture_fk_edu_purchase_onboarding_0 FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.edu_purchase_onboarding add constraint fixture_fk_edu_purchase_onboarding_4 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_push_events add constraint fixture_fk_edu_push_events_4 FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.edu_push_subscriptions add constraint fixture_fk_edu_push_subscriptions_3 FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.edu_question_answer_images add constraint fixture_fk_edu_question_answer_images_0 FOREIGN KEY (answer_id) REFERENCES edu_question_answers(id) ON DELETE CASCADE;
alter table public.edu_question_answer_images add constraint fixture_fk_edu_question_answer_images_5 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_question_answer_images add constraint fixture_fk_edu_question_answer_images_8 FOREIGN KEY (question_id) REFERENCES edu_questions(id) ON DELETE CASCADE;
alter table public.edu_question_answers add constraint fixture_fk_edu_question_answers_1 FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.edu_question_answers add constraint fixture_fk_edu_question_answers_3 FOREIGN KEY (deleted_by) REFERENCES profiles(id);
alter table public.edu_question_answers add constraint fixture_fk_edu_question_answers_5 FOREIGN KEY (question_id) REFERENCES edu_questions(id) ON DELETE CASCADE;
alter table public.edu_question_assist_jobs add constraint fixture_fk_edu_question_assist_jobs_0 FOREIGN KEY (answer_id) REFERENCES edu_question_answers(id);
alter table public.edu_question_assist_jobs add constraint fixture_fk_edu_question_assist_jobs_4 FOREIGN KEY (question_id) REFERENCES edu_questions(id) ON DELETE CASCADE;
alter table public.edu_question_assist_jobs add constraint fixture_fk_edu_question_assist_jobs_5 FOREIGN KEY (requested_by) REFERENCES profiles(id);
alter table public.edu_question_images add constraint fixture_fk_edu_question_images_1 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE SET NULL;
alter table public.edu_question_images add constraint fixture_fk_edu_question_images_5 FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_questions add constraint fixture_fk_edu_questions_0 FOREIGN KEY (answer_head_id) REFERENCES edu_question_answers(id) ON DELETE SET NULL;
alter table public.edu_questions add constraint fixture_fk_edu_questions_4 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE SET NULL;
alter table public.edu_questions add constraint fixture_fk_edu_questions_5 FOREIGN KEY (image_id) REFERENCES edu_question_images(id);
alter table public.edu_questions add constraint fixture_fk_edu_questions_13 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.edu_shared_answers add constraint fixture_fk_edu_shared_answers_1 FOREIGN KEY (approved_by) REFERENCES profiles(id);
alter table public.edu_shared_answers add constraint fixture_fk_edu_shared_answers_5 FOREIGN KEY (source_question_id) REFERENCES edu_questions(id) ON DELETE CASCADE;
alter table public.enrollments add constraint fixture_fk_enrollments_2 FOREIGN KEY (granted_by) REFERENCES profiles(id);
alter table public.enrollments add constraint fixture_fk_enrollments_9 FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.kakao_sync_members add constraint fixture_fk_kakao_sync_members_4 FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.lesson_progress add constraint fixture_fk_lesson_progress_0 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
alter table public.member_group_members add constraint fixture_fk_member_group_members_1 FOREIGN KEY (member_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.mission_submissions add constraint fixture_fk_mission_submissions_2 FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE RESTRICT;
alter table public.mission_submissions add constraint fixture_fk_mission_submissions_7 FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
