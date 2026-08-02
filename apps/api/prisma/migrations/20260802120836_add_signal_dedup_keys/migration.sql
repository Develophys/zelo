-- CreateTable
CREATE TABLE "signal_dedup_keys" (
    "dedupKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_dedup_keys_pkey" PRIMARY KEY ("dedupKey")
);
