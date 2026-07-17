-- CreateTable
CREATE TABLE "rate_limit_windows" (
    "principal_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("principal_id","action","window_start")
);

-- CreateIndex
CREATE INDEX "rate_limit_windows_expires_at_idx" ON "rate_limit_windows"("expires_at");
