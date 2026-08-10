-- CreateTable
CREATE TABLE "ItemAssociation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "entryId" TEXT,
    "dayId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemAssociation_itemId_entryId_key" ON "ItemAssociation"("itemId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAssociation_itemId_dayId_key" ON "ItemAssociation"("itemId", "dayId");

-- AddForeignKey
ALTER TABLE "ItemAssociation" ADD CONSTRAINT "ItemAssociation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TripItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAssociation" ADD CONSTRAINT "ItemAssociation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DayEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAssociation" ADD CONSTRAINT "ItemAssociation_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
