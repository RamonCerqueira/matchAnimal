CREATE TYPE "AccountType" AS ENUM ('TUTOR', 'ORGANIZATION', 'PROTECTOR', 'PROFESSIONAL');
CREATE TYPE "PetSpecies" AS ENUM ('DOG', 'CAT', 'OTHER');
CREATE TYPE "PetSex" AS ENUM ('FEMALE', 'MALE', 'UNKNOWN');
CREATE TYPE "PetSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE', 'UNKNOWN');
CREATE TYPE "ConnectionIntent" AS ENUM ('FRIENDSHIP', 'RESPONSIBLE_BREEDING', 'ADOPTION');
CREATE TYPE "LikeStatus" AS ENUM ('PENDING', 'MATCHED', 'PASSED');
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'DECLINED', 'WITHDRAWN');
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'SUBMITTED', 'VERIFIED', 'REJECTED');
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REMOVED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
  "type" "AccountType" NOT NULL DEFAULT 'TUTOR', "emailVerifiedAt" TIMESTAMP(3),
  "privacyConsentAt" TIMESTAMP(3), "privacyConsentVersion" TEXT, "termsAcceptedAt" TIMESTAMP(3),
  "termsVersion" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "TutorProfile" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "displayName" TEXT NOT NULL, "city" TEXT,
  "state" VARCHAR(2), "searchCell" VARCHAR(12), "profilePhotoUrl" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT false, "notificationOptIn" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TutorProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TutorProfile_userId_key" ON "TutorProfile"("userId");
CREATE INDEX "TutorProfile_city_state_idx" ON "TutorProfile"("city", "state");
CREATE INDEX "TutorProfile_searchCell_idx" ON "TutorProfile"("searchCell");
ALTER TABLE "TutorProfile" ADD CONSTRAINT "TutorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RefreshSession" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");
CREATE INDEX "RefreshSession_userId_expiresAt_idx" ON "RefreshSession"("userId", "expiresAt");
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Pet" (
  "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "name" TEXT NOT NULL, "species" "PetSpecies" NOT NULL,
  "speciesOther" TEXT, "breed" TEXT, "sex" "PetSex" NOT NULL DEFAULT 'UNKNOWN', "size" "PetSize" NOT NULL DEFAULT 'UNKNOWN',
  "birthDate" TIMESTAMP(3), "bio" VARCHAR(700), "intent" "ConnectionIntent" NOT NULL DEFAULT 'FRIENDSHIP',
  "coverPhotoUrl" TEXT, "temperament" TEXT[] NOT NULL, "preferences" TEXT[] NOT NULL, "city" TEXT, "state" VARCHAR(2),
  "searchCell" VARCHAR(12), "isPublic" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "healthChecklistComplete" BOOLEAN NOT NULL DEFAULT false, "healthVerificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "veterinarianReviewAt" TIMESTAMP(3), "coverPhotoModeration" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Pet_species_intent_isActive_isPublic_idx" ON "Pet"("species", "intent", "isActive", "isPublic");
CREATE INDEX "Pet_ownerId_isActive_idx" ON "Pet"("ownerId", "isActive");
CREATE INDEX "Pet_searchCell_isPublic_isActive_idx" ON "Pet"("searchCell", "isPublic", "isActive");
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PetPhoto" (
  "id" TEXT NOT NULL, "petId" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "altText" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "moderation" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PetPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PetPhoto_petId_moderation_sortOrder_idx" ON "PetPhoto"("petId", "moderation", "sortOrder");
ALTER TABLE "PetPhoto" ADD CONSTRAINT "PetPhoto_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PetLike" (
  "id" TEXT NOT NULL, "fromPetId" TEXT NOT NULL, "toPetId" TEXT NOT NULL, "fromOwnerId" TEXT NOT NULL,
  "toOwnerId" TEXT NOT NULL, "status" "LikeStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PetLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PetLike_fromPetId_toPetId_key" ON "PetLike"("fromPetId", "toPetId");
CREATE INDEX "PetLike_toPetId_status_idx" ON "PetLike"("toPetId", "status");
ALTER TABLE "PetLike" ADD CONSTRAINT "PetLike_fromPetId_fkey" FOREIGN KEY ("fromPetId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetLike" ADD CONSTRAINT "PetLike_toPetId_fkey" FOREIGN KEY ("toPetId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetLike" ADD CONSTRAINT "PetLike_fromOwnerId_fkey" FOREIGN KEY ("fromOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetLike" ADD CONSTRAINT "PetLike_toOwnerId_fkey" FOREIGN KEY ("toOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PetMatch" (
  "id" TEXT NOT NULL, "petAId" TEXT NOT NULL, "petBId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PetMatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PetMatch_petAId_petBId_key" ON "PetMatch"("petAId", "petBId");
CREATE INDEX "PetMatch_petAId_createdAt_idx" ON "PetMatch"("petAId", "createdAt");
CREATE INDEX "PetMatch_petBId_createdAt_idx" ON "PetMatch"("petBId", "createdAt");
ALTER TABLE "PetMatch" ADD CONSTRAINT "PetMatch_petAId_fkey" FOREIGN KEY ("petAId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetMatch" ADD CONSTRAINT "PetMatch_petBId_fkey" FOREIGN KEY ("petBId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatThread" (
  "id" TEXT NOT NULL, "matchId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatThread_matchId_key" ON "ChatThread"("matchId");
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "PetMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "senderId" TEXT NOT NULL, "idempotencyKey" TEXT, "body" VARCHAR(4000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "readAt" TIMESTAMP(3),
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");
CREATE UNIQUE INDEX "ChatMessage_senderId_idempotencyKey_key" ON "ChatMessage"("senderId", "idempotencyKey");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdoptionApplication" (
  "id" TEXT NOT NULL, "petId" TEXT NOT NULL, "applicantId" TEXT NOT NULL,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED', "message" VARCHAR(1500) NOT NULL,
  "livingDetails" VARCHAR(1000), "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AdoptionApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdoptionApplication_petId_applicantId_key" ON "AdoptionApplication"("petId", "applicantId");
CREATE INDEX "AdoptionApplication_petId_status_idx" ON "AdoptionApplication"("petId", "status");
CREATE INDEX "AdoptionApplication_applicantId_createdAt_idx" ON "AdoptionApplication"("applicantId", "createdAt");
ALTER TABLE "AdoptionApplication" ADD CONSTRAINT "AdoptionApplication_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdoptionApplication" ADD CONSTRAINT "AdoptionApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserBlock" (
  "id" TEXT NOT NULL, "blockerId" TEXT NOT NULL, "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContentReport" (
  "id" TEXT NOT NULL, "reporterId" TEXT NOT NULL, "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "details" VARCHAR(1000), "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContentReport_targetType_targetId_status_idx" ON "ContentReport"("targetType", "targetId", "status");
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommunityPost" (
  "id" TEXT NOT NULL, "authorId" TEXT NOT NULL, "petId" TEXT, "body" VARCHAR(2000) NOT NULL,
  "moderation" "ModerationStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityPost_moderation_createdAt_idx" ON "CommunityPost"("moderation", "createdAt");
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
