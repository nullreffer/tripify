-- AlterTable: make googleId optional and add appleId for Sign in with Apple
ALTER TABLE "User" ALTER COLUMN "googleId" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "appleId" TEXT;
CREATE UNIQUE INDEX "User_appleId_key" ON "User"("appleId");
