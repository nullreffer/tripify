-- CreateEnum
CREATE TYPE "ShowerStatus" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('ACTIVITY', 'TRAVEL', 'ACCOMMODATION', 'NOTE');

-- AlterTable: TripItem new columns
ALTER TABLE "TripItem" ADD COLUMN "quantity" DOUBLE PRECISION;
ALTER TABLE "TripItem" ADD COLUMN "unit" TEXT;
ALTER TABLE "TripItem" ADD COLUMN "notes" TEXT;
ALTER TABLE "TripItem" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TripItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'have';

-- CreateTable: TripDay
CREATE TABLE "TripDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "title" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "shower" "ShowerStatus" NOT NULL DEFAULT 'UNKNOWN',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DayEntry
CREATE TABLE "DayEntry" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "type" "EntryType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "durationMins" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "stopId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Reservation
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "entryId" TEXT,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "confirmationNumber" TEXT,
    "referenceNumber" TEXT,
    "url" TEXT,
    "phone" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "siteNumber" TEXT,
    "roomNumber" TEXT,
    "loop" TEXT,
    "holder" TEXT,
    "cost" TEXT,
    "cancellationDeadline" TIMESTAMP(3),
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_entryId_key" ON "Reservation"("entryId");

-- AddForeignKey
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayEntry" ADD CONSTRAINT "DayEntry_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayEntry" ADD CONSTRAINT "DayEntry_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DayEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
