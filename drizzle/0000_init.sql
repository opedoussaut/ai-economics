CREATE TYPE "public"."allocation_method" AS ENUM('reserved', 'billed-runtime', 'proportional-usage');--> statement-breakpoint
CREATE TYPE "public"."value_class" AS ENUM('published', 'measured', 'calculated', 'modeled', 'billed', 'benchmark');--> statement-breakpoint
CREATE TYPE "public"."workload_type" AS ENUM('api-inference', 'self-hosted-inference', 'pretraining', 'fine-tuning', 'rl', 'agents');--> statement-breakpoint
CREATE TABLE "alert" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text,
	"kind" text NOT NULL,
	"threshold" numeric(20, 10),
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "benchmark_observation" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"model_id" text NOT NULL,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text,
	"conditions" jsonb,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_allocation" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"method" "allocation_method" NOT NULL,
	"gpu_hours" numeric(20, 6) NOT NULL,
	"cost" numeric(20, 10) NOT NULL,
	"value_class" "value_class" DEFAULT 'calculated' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_refresh_job" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"changes" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "gpu_offering" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"price_scope" text NOT NULL,
	"gpu_model" text NOT NULL,
	"gpu_count" double precision NOT NULL,
	"region" text NOT NULL,
	"instance_type" text,
	"listed" boolean DEFAULT true NOT NULL,
	"attributes" jsonb
);
--> statement-breakpoint
CREATE TABLE "gpu_sku" (
	"id" text PRIMARY KEY NOT NULL,
	"family" text NOT NULL,
	"model" text NOT NULL,
	"memory_gb" double precision,
	"peak_dense_bf16_tflops" double precision,
	"tdp_w" integer
);
--> statement-breakpoint
CREATE TABLE "hardware_sample" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text,
	"source" text NOT NULL,
	"sampled_at" timestamp with time zone NOT NULL,
	"gpu_count" integer,
	"gpu_util_pct" double precision,
	"memory_used_mib" double precision,
	"power_w" double precision,
	"energy_mj" double precision
);
--> statement-breakpoint
CREATE TABLE "infrastructure_cost_observation" (
	"id" text PRIMARY KEY NOT NULL,
	"gpu_offering_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"hash" text NOT NULL,
	"origin" text NOT NULL,
	"on_demand_per_hour" numeric(20, 10),
	"spot_per_hour" numeric(20, 10),
	"reserved_1y_per_hour" numeric(20, 10),
	"reserved_3y_per_hour" numeric(20, 10),
	"median_per_gpu_hour" numeric(20, 10),
	"value_class" "value_class" DEFAULT 'published' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"settings" jsonb,
	"last_success_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "model_offering" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"developer" text NOT NULL,
	"channel" text NOT NULL,
	"official_url" text,
	"listed" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"delisted_at" timestamp with time zone,
	"attributes" jsonb
);
--> statement-breakpoint
CREATE TABLE "model" (
	"id" text PRIMARY KEY NOT NULL,
	"developer" text NOT NULL,
	"display_name" text NOT NULL,
	"context_window" integer
);
--> statement-breakpoint
CREATE TABLE "pricing_observation" (
	"id" text PRIMARY KEY NOT NULL,
	"offering_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"effective_date" timestamp with time zone,
	"hash" text NOT NULL,
	"origin" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"input_per_m" numeric(20, 10),
	"output_per_m" numeric(20, 10),
	"cache_read_per_m" numeric(20, 10),
	"cache_write_per_m" numeric(20, 10),
	"batch_input_per_m" numeric(20, 10),
	"batch_output_per_m" numeric(20, 10),
	"value_class" "value_class" DEFAULT 'published' NOT NULL,
	"confidence" text
);
--> statement-breakpoint
CREATE TABLE "pricing_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"pricing_url" text
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"method" text NOT NULL,
	"url" text NOT NULL,
	"docs" text,
	"terms" text,
	"requires_key" text
);
--> statement-breakpoint
CREATE TABLE "token_usage_sample" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text,
	"source" text NOT NULL,
	"sampled_at" timestamp with time zone NOT NULL,
	"project" text,
	"provider" text,
	"model" text,
	"operation" text,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_creation_tokens" bigint DEFAULT 0 NOT NULL,
	"reasoning_tokens" bigint DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" boolean DEFAULT false NOT NULL,
	"calculated_cost" numeric(20, 10),
	"price_offering_id" text
);
--> statement-breakpoint
CREATE TABLE "tool" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"data" jsonb NOT NULL,
	"last_verified" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "training_step_sample" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"step" bigint NOT NULL,
	"sampled_at" timestamp with time zone NOT NULL,
	"metrics" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workload_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workload_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"gpu_count" integer NOT NULL,
	"rate_per_gpu_hour" numeric(20, 10) NOT NULL,
	"rate_source" text,
	"electricity_per_kwh" numeric(20, 10),
	"allocation_method" "allocation_method" DEFAULT 'reserved' NOT NULL,
	"planned_steps" bigint,
	"planned_tokens" bigint,
	"mlflow_run_id" text,
	"baselines" jsonb
);
--> statement-breakpoint
CREATE TABLE "workload" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "workload_type" NOT NULL,
	"project" text,
	"cluster" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_run_id_workload_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workload_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation" ADD CONSTRAINT "cost_allocation_run_id_workload_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workload_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_sample" ADD CONSTRAINT "hardware_sample_run_id_workload_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workload_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infrastructure_cost_observation" ADD CONSTRAINT "infrastructure_cost_observation_gpu_offering_id_gpu_offering_id_fk" FOREIGN KEY ("gpu_offering_id") REFERENCES "public"."gpu_offering"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_offering" ADD CONSTRAINT "model_offering_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_observation" ADD CONSTRAINT "pricing_observation_offering_id_model_offering_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."model_offering"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage_sample" ADD CONSTRAINT "token_usage_sample_run_id_workload_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workload_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_step_sample" ADD CONSTRAINT "training_step_sample_run_id_workload_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workload_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_run" ADD CONSTRAINT "workload_run_workload_id_workload_id_fk" FOREIGN KEY ("workload_id") REFERENCES "public"."workload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hw_sample_run_idx" ON "hardware_sample" USING btree ("run_id","sampled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_obs_unique" ON "infrastructure_cost_observation" USING btree ("gpu_offering_id","observed_at");--> statement-breakpoint
CREATE INDEX "model_offering_model_idx" ON "model_offering" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_obs_unique" ON "pricing_observation" USING btree ("offering_id","observed_at");--> statement-breakpoint
CREATE INDEX "token_sample_time_idx" ON "token_usage_sample" USING btree ("sampled_at");--> statement-breakpoint
CREATE INDEX "token_sample_project_idx" ON "token_usage_sample" USING btree ("project");