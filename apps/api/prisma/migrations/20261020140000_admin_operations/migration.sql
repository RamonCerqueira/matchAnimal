-- AlterEnum
ALTER TYPE "AttendanceStatus" ADD VALUE 'WAITLIST';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "suspendedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ContentReport" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "resolution" VARCHAR(2000),
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EventParticipant" ADD COLUMN     "checkedInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AdCampaign" ADD COLUMN     "approvalNote" VARCHAR(1000),
ADD COLUMN     "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "dailyFrequencyCap" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "CommercialInvoice" ADD COLUMN     "feeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "receivedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0;


-- CreateTable
CREATE TABLE "AdminMembership" (
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMembership_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserActivityDay" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "UserActivityDay_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "OperationCase" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "userId" TEXT,
    "partnerId" TEXT,
    "reportId" TEXT,
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "amountCents" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationMessage" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalDocument" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "invoiceId" TEXT,
    "eventId" TEXT,
    "kind" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialPackage" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "placement" "AdPlacement" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "reference" VARCHAR(250) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "renewalWarningDays" INTEGER NOT NULL DEFAULT 7,
    "supportSlaHours" INTEGER NOT NULL DEFAULT 48,
    "maxCampaignDays" INTEGER NOT NULL DEFAULT 365,
    "maxDailyAdFrequency" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserActivityDay_day_idx" ON "UserActivityDay"("day");

-- CreateIndex
CREATE INDEX "OperationCase_kind_status_createdAt_idx" ON "OperationCase"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OperationCase_partnerId_createdAt_idx" ON "OperationCase"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationCase_userId_createdAt_idx" ON "OperationCase"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationCase_assigneeId_dueAt_idx" ON "OperationCase"("assigneeId", "dueAt");

-- CreateIndex
CREATE INDEX "OperationMessage_caseId_createdAt_idx" ON "OperationMessage"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalDocument_storageKey_key" ON "OperationalDocument"("storageKey");

-- CreateIndex
CREATE INDEX "OperationalDocument_partnerId_createdAt_idx" ON "OperationalDocument"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalDocument_invoiceId_idx" ON "OperationalDocument"("invoiceId");

-- CreateIndex
CREATE INDEX "OperationalDocument_eventId_idx" ON "OperationalDocument"("eventId");

-- CreateIndex
CREATE INDEX "FinancialEntry_invoiceId_createdAt_idx" ON "FinancialEntry"("invoiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "OperationMessage" ADD CONSTRAINT "OperationMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "OperationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

