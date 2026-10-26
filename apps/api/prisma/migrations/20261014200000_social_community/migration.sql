CREATE TYPE "PostVisibility" AS ENUM ('PUBLIC', 'FOLLOWERS', 'PRIVATE');
CREATE TYPE "PostKind" AS ENUM ('MOMENT', 'ADOPTION_INFO', 'ACTIVITY', 'EDUCATIONAL', 'EVENT', 'LOST_FOUND');
CREATE TYPE "FollowStatus" AS ENUM ('PENDING', 'ACCEPTED');
CREATE TYPE "GroupVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "GroupRole" AS ENUM ('MEMBER', 'MODERATOR', 'ADMIN');
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "AttendanceStatus" AS ENUM ('GOING', 'INTERESTED');
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW';

ALTER TABLE "CommunityPost" ADD COLUMN "kind" "PostKind" NOT NULL DEFAULT 'MOMENT', ADD COLUMN "visibility" "PostVisibility" NOT NULL DEFAULT 'PUBLIC', ADD COLUMN "locationLabel" VARCHAR(120);
DROP INDEX IF EXISTS "CommunityPost_moderation_createdAt_idx";
CREATE INDEX "CommunityPost_moderation_visibility_createdAt_idx" ON "CommunityPost"("moderation", "visibility", "createdAt");
CREATE INDEX "CommunityPost_authorId_createdAt_idx" ON "CommunityPost"("authorId", "createdAt");
CREATE INDEX "CommunityPost_petId_createdAt_idx" ON "CommunityPost"("petId", "createdAt");

CREATE TABLE "PostMedia" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "mediaType" VARCHAR(20) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL, "sizeBytes" INTEGER NOT NULL, "width" INTEGER, "height" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id"), CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PostMedia_postId_sortOrder_idx" ON "PostMedia"("postId", "sortOrder");

CREATE TABLE "PostLike" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostLike_pkey" PRIMARY KEY ("id"), CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PostLike_postId_userId_key" ON "PostLike"("postId", "userId");
CREATE INDEX "PostLike_userId_createdAt_idx" ON "PostLike"("userId", "createdAt");

CREATE TABLE "PostComment" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "parentId" TEXT, "body" VARCHAR(1200) NOT NULL,
  "moderation" "ModerationStatus" NOT NULL DEFAULT 'APPROVED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id"), CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PostComment_postId_createdAt_idx" ON "PostComment"("postId", "createdAt");
CREATE INDEX "PostComment_parentId_createdAt_idx" ON "PostComment"("parentId", "createdAt");

CREATE TABLE "CommentLike" (
  "id" TEXT NOT NULL, "commentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id"), CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommentLike_commentId_userId_key" ON "CommentLike"("commentId", "userId");

CREATE TABLE "SavedPost" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedPost_pkey" PRIMARY KEY ("id"), CONSTRAINT "SavedPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SavedPost_postId_userId_key" ON "SavedPost"("postId", "userId");
CREATE INDEX "SavedPost_userId_createdAt_idx" ON "SavedPost"("userId", "createdAt");

CREATE TABLE "PetFollower" (
  "id" TEXT NOT NULL, "petId" TEXT NOT NULL, "followerId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PetFollower_pkey" PRIMARY KEY ("id"), CONSTRAINT "PetFollower_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PetFollower_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PetFollower_petId_followerId_key" ON "PetFollower"("petId", "followerId");
CREATE INDEX "PetFollower_petId_createdAt_idx" ON "PetFollower"("petId", "createdAt");
CREATE INDEX "PetFollower_followerId_createdAt_idx" ON "PetFollower"("followerId", "createdAt");

CREATE TABLE "FollowRequest" (
  "id" TEXT NOT NULL, "petId" TEXT NOT NULL, "requesterId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "status" "FollowStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowRequest_pkey" PRIMARY KEY ("id"), CONSTRAINT "FollowRequest_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FollowRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FollowRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FollowRequest_petId_requesterId_key" ON "FollowRequest"("petId", "requesterId");
CREATE INDEX "FollowRequest_ownerId_status_createdAt_idx" ON "FollowRequest"("ownerId", "status", "createdAt");

CREATE TABLE "Story" (
  "id" TEXT NOT NULL, "authorId" TEXT NOT NULL, "petId" TEXT, "mediaKey" TEXT NOT NULL, "mediaType" VARCHAR(20) NOT NULL,
  "caption" VARCHAR(300), "visibility" "PostVisibility" NOT NULL DEFAULT 'FOLLOWERS', "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Story_pkey" PRIMARY KEY ("id"), CONSTRAINT "Story_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Story_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Story_expiresAt_visibility_createdAt_idx" ON "Story"("expiresAt", "visibility", "createdAt");
CREATE INDEX "Story_authorId_expiresAt_idx" ON "Story"("authorId", "expiresAt");

CREATE TABLE "StoryView" (
  "id" TEXT NOT NULL, "storyId" TEXT NOT NULL, "viewerId" TEXT NOT NULL, "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id"), CONSTRAINT "StoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StoryView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StoryView_storyId_viewerId_key" ON "StoryView"("storyId", "viewerId");
CREATE INDEX "StoryView_viewerId_viewedAt_idx" ON "StoryView"("viewerId", "viewedAt");

CREATE TABLE "Hashtag" ("id" TEXT NOT NULL, "name" VARCHAR(60) NOT NULL, CONSTRAINT "Hashtag_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Hashtag_name_key" ON "Hashtag"("name");
CREATE TABLE "PostHashtag" (
  "postId" TEXT NOT NULL, "hashtagId" TEXT NOT NULL, CONSTRAINT "PostHashtag_pkey" PRIMARY KEY ("postId", "hashtagId"),
  CONSTRAINT "PostHashtag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostHashtag_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PostHashtag_hashtagId_postId_idx" ON "PostHashtag"("hashtagId", "postId");

CREATE TABLE "CommunityGroup" (
  "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "name" VARCHAR(100) NOT NULL, "slug" VARCHAR(120) NOT NULL, "description" VARCHAR(1000) NOT NULL,
  "visibility" "GroupVisibility" NOT NULL DEFAULT 'PUBLIC', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityGroup_pkey" PRIMARY KEY ("id"), CONSTRAINT "CommunityGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommunityGroup_slug_key" ON "CommunityGroup"("slug");
CREATE INDEX "CommunityGroup_visibility_createdAt_idx" ON "CommunityGroup"("visibility", "createdAt");

CREATE TABLE "GroupMember" (
  "groupId" TEXT NOT NULL, "userId" TEXT NOT NULL, "role" "GroupRole" NOT NULL DEFAULT 'MEMBER', "approved" BOOLEAN NOT NULL DEFAULT false, "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId", "userId"), CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CommunityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GroupMember_userId_joinedAt_idx" ON "GroupMember"("userId", "joinedAt");

CREATE TABLE "GroupPost" (
  "id" TEXT NOT NULL, "groupId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "body" VARCHAR(2000) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupPost_pkey" PRIMARY KEY ("id"), CONSTRAINT "GroupPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CommunityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GroupPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GroupPost_groupId_createdAt_idx" ON "GroupPost"("groupId", "createdAt");

CREATE TABLE "PetEvent" (
  "id" TEXT NOT NULL, "organizerId" TEXT NOT NULL, "title" VARCHAR(120) NOT NULL, "description" VARCHAR(2000) NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3), "locationLabel" VARCHAR(180) NOT NULL, "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION,
  "coverImageKey" TEXT, "capacity" INTEGER, "rules" VARCHAR(1200), "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetEvent_pkey" PRIMARY KEY ("id"), CONSTRAINT "PetEvent_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PetEvent_visibility_startsAt_idx" ON "PetEvent"("visibility", "startsAt");
CREATE INDEX "PetEvent_organizerId_startsAt_idx" ON "PetEvent"("organizerId", "startsAt");

CREATE TABLE "EventParticipant" (
  "eventId" TEXT NOT NULL, "userId" TEXT NOT NULL, "status" "AttendanceStatus" NOT NULL DEFAULT 'GOING', "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("eventId", "userId"), CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PetEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventParticipant_userId_joinedAt_idx" ON "EventParticipant"("userId", "joinedAt");
