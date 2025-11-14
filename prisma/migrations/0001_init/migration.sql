-- Initial PostgreSQL schema for the gestão pessoal API

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "role" TEXT NOT NULL,
  "name" TEXT,
  "whatsapp" TEXT,
  "salt" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "extra" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ
);

CREATE TABLE "Transaction" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "date" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ,
  CONSTRAINT "Transaction_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX "Transaction_ownerId_idx" ON "Transaction"("ownerId");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

CREATE TABLE "Event" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "start_time" TEXT,
  "end_time" TEXT,
  "notes" TEXT,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ,
  CONSTRAINT "Event_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX "Event_ownerId_idx" ON "Event"("ownerId");
CREATE INDEX "Event_date_idx" ON "Event"("date");

CREATE TABLE "NotificationLog" (
  "id" TEXT PRIMARY KEY,
  "reason" TEXT NOT NULL,
  "referenceDate" TIMESTAMPTZ NOT NULL,
  "todayDate" TEXT NOT NULL,
  "upcomingDate" TEXT NOT NULL,
  "todayCount" INTEGER NOT NULL,
  "upcomingCount" INTEGER NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT FALSE,
  "providerReady" BOOLEAN NOT NULL DEFAULT FALSE,
  "sent" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL,
  "warning" TEXT,
  "error" TEXT,
  "recipients" JSONB,
  "message" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "NotificationLog_reason_idx" ON "NotificationLog"("reason");
CREATE INDEX "NotificationLog_referenceDate_idx" ON "NotificationLog"("referenceDate");
