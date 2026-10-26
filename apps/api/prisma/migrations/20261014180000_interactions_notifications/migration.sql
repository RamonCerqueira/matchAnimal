CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'SUPER_MATCH', 'MATCH', 'MESSAGE', 'CONNECTION_UPDATE');
CREATE TYPE "MatchStatus" AS ENUM ('ACTIVE', 'UNMATCHED');

ALTER TABLE "PetLike" ADD COLUMN "isSuperMatch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PetLike" ADD COLUMN "superMatchAt" TIMESTAMP(3);
ALTER TABLE "PetMatch" ADD COLUMN "status" "MatchStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "ChatMessage" ADD COLUMN "deliveredAt" TIMESTAMP(3);
CREATE INDEX "PetLike_fromOwnerId_createdAt_idx" ON "PetLike"("fromOwnerId", "createdAt");

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "type" "NotificationType" NOT NULL,
  "entityId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");
CREATE INDEX "Notification_type_entityId_idx" ON "Notification"("type", "entityId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
