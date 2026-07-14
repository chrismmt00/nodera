-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'assigned', 'running', 'succeeded', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('assigned', 'running', 'succeeded', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('pending', 'approved', 'disabled');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('llm', 'image');

-- CreateEnum
CREATE TYPE "ArtifactBackend" AS ENUM ('local', 'r2');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivering', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webhook_secret" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "ProviderStatus" NOT NULL DEFAULT 'approved',
    "trust_tier" TEXT NOT NULL DEFAULT 'standard',
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "capabilities" JSONB NOT NULL,
    "last_heartbeat_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "slug" TEXT NOT NULL,
    "modality" "Modality" NOT NULL,
    "description" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "worker_image" TEXT NOT NULL,
    "runtime_ref" TEXT NOT NULL,
    "min_vram_gb" INTEGER NOT NULL,
    "max_runtime_s" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "models_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "model_slug" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'standard',
    "input" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "idempotency_key" TEXT,
    "webhook_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'assigned',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "deadline_at" TIMESTAMP(3),
    "exit_code" INTEGER,
    "error" JSONB,
    "usage" JSONB,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "backend" "ArtifactBackend" NOT NULL,
    "object_key" TEXT NOT NULL,
    "inline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "providers_token_hash_key" ON "providers"("token_hash");

-- CreateIndex
CREATE INDEX "providers_status_last_heartbeat_at_idx" ON "providers"("status", "last_heartbeat_at");

-- CreateIndex
CREATE INDEX "jobs_workspace_id_created_at_idx" ON "jobs"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "jobs_status_created_at_idx" ON "jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_workspace_id_idempotency_key_key" ON "jobs"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "runs_job_id_idx" ON "runs"("job_id");

-- CreateIndex
CREATE INDEX "runs_provider_id_status_idx" ON "runs"("provider_id", "status");

-- CreateIndex
CREATE INDEX "runs_status_deadline_at_idx" ON "runs"("status", "deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_run_id_name_key" ON "artifacts"("run_id", "name");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_job_id_key" ON "webhook_deliveries"("job_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_model_slug_fkey" FOREIGN KEY ("model_slug") REFERENCES "models"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
