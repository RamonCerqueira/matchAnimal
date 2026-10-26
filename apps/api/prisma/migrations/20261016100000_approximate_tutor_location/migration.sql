ALTER TABLE "TutorProfile" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "TutorProfile" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Pet" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Pet" ADD COLUMN "longitude" DOUBLE PRECISION;

UPDATE "Pet" AS pet
SET "latitude" = tutor."latitude", "longitude" = tutor."longitude"
FROM "TutorProfile" AS tutor
WHERE tutor."userId" = pet."ownerId";
