-- Add approval state for invite-less users
ALTER TABLE "User"
ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "approvedAt" TIMESTAMP(3);

-- Keep existing users active
UPDATE "User"
SET "isApproved" = true,
    "approvedAt" = COALESCE("approvedAt", "createdAt");
