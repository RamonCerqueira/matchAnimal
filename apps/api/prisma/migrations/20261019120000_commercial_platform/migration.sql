-- CreateEnum
CREATE TYPE "CommercialPartnerCategory" AS ENUM ('PET_SHOP', 'VETERINARY', 'GROOMING', 'ORGANIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CommercialPartnerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AdPlacement" AS ENUM ('HOME_BANNER', 'COMMUNITY_FEED', 'EXPLORE_CARD');

-- CreateEnum
CREATE TYPE "AdMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "CommercialInvoiceStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CommercialPaymentMethod" AS ENUM ('PIX', 'BANK_TRANSFER', 'CASH', 'OTHER', 'STRIPE');

-- CreateEnum
CREATE TYPE "AdInteractionKind" AS ENUM ('IMPRESSION', 'CLICK');

-- AlterTable
ALTER TABLE "PetEvent" ADD COLUMN     "partnerId" TEXT;

-- CreateTable
CREATE TABLE "CommercialPartner" (
    "id" TEXT NOT NULL,
    "businessName" VARCHAR(160) NOT NULL,
    "contactName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(30),
    "website" VARCHAR(2000),
    "city" VARCHAR(100),
    "state" VARCHAR(2),
    "category" "CommercialPartnerCategory" NOT NULL DEFAULT 'OTHER',
    "status" "CommercialPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAsset" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "filename" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "mediaType" "AdMediaType" NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "AdAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "headline" VARCHAR(100) NOT NULL,
    "body" VARCHAR(400),
    "ctaLabel" VARCHAR(40) NOT NULL,
    "destinationUrl" VARCHAR(2000) NOT NULL,
    "placement" "AdPlacement" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "targetCity" VARCHAR(100),
    "targetState" VARCHAR(2),
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialInvoice" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "campaignId" TEXT,
    "description" VARCHAR(250) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "status" "CommercialInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "method" "CommercialPaymentMethod",
    "reference" VARCHAR(250),
    "stripeCheckoutId" TEXT,
    "stripePaymentIntentId" TEXT,
    "checkoutUrl" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdInteraction" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "AdInteractionKind" NOT NULL,
    "day" DATE NOT NULL,
    "visitorHash" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "targetType" VARCHAR(80) NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "CommercialPartner_status_createdAt_idx" ON "CommercialPartner"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialPartner_email_idx" ON "CommercialPartner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdAsset_storageKey_key" ON "AdAsset"("storageKey");

-- CreateIndex
CREATE INDEX "AdAsset_partnerId_createdAt_idx" ON "AdAsset"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "AdAsset_createdAt_idx" ON "AdAsset"("createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_status_placement_startsAt_endsAt_idx" ON "AdCampaign"("status", "placement", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "AdCampaign_partnerId_createdAt_idx" ON "AdCampaign"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_assetId_idx" ON "AdCampaign"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialInvoice_campaignId_key" ON "CommercialInvoice"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialInvoice_stripeCheckoutId_key" ON "CommercialInvoice"("stripeCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialInvoice_stripePaymentIntentId_key" ON "CommercialInvoice"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "CommercialInvoice_status_dueAt_idx" ON "CommercialInvoice"("status", "dueAt");

-- CreateIndex
CREATE INDEX "CommercialInvoice_partnerId_createdAt_idx" ON "CommercialInvoice"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialInvoice_paidAt_idx" ON "CommercialInvoice"("paidAt");

-- CreateIndex
CREATE INDEX "AdInteraction_campaignId_day_kind_idx" ON "AdInteraction"("campaignId", "day", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AdInteraction_campaignId_kind_day_visitorHash_key" ON "AdInteraction"("campaignId", "kind", "day", "visitorHash");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_createdAt_idx" ON "AdminAuditLog"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorId_createdAt_idx" ON "AdminAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "PetEvent_partnerId_startsAt_idx" ON "PetEvent"("partnerId", "startsAt");

-- AddForeignKey
ALTER TABLE "PetEvent" ADD CONSTRAINT "PetEvent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "CommercialPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAsset" ADD CONSTRAINT "AdAsset_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "CommercialPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "CommercialPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "AdAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialInvoice" ADD CONSTRAINT "CommercialInvoice_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "CommercialPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialInvoice" ADD CONSTRAINT "CommercialInvoice_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdInteraction" ADD CONSTRAINT "AdInteraction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
