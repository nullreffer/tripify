-- CreateTable
CREATE TABLE "SlideshowShare" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "SlideshowShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlideshowShare_token_key" ON "SlideshowShare"("token");

-- CreateIndex
CREATE INDEX "SlideshowShare_tripId_idx" ON "SlideshowShare"("tripId");

-- AddForeignKey
ALTER TABLE "SlideshowShare" ADD CONSTRAINT "SlideshowShare_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
