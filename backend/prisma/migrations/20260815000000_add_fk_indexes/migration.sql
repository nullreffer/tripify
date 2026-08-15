-- AddIndex: Stop.tripId
CREATE INDEX IF NOT EXISTS "Stop_tripId_idx" ON "Stop"("tripId");

-- AddIndex: TripMember.userId
CREATE INDEX IF NOT EXISTS "TripMember_userId_idx" ON "TripMember"("userId");

-- AddIndex: TripMember.tripId (already covered by unique, but explicit index aids some query plans)
CREATE INDEX IF NOT EXISTS "TripMember_tripId_idx" ON "TripMember"("tripId");

-- AddIndex: AiMessage.tripId
CREATE INDEX IF NOT EXISTS "AiMessage_tripId_idx" ON "AiMessage"("tripId");

-- AddIndex: TripDay.tripId
CREATE INDEX IF NOT EXISTS "TripDay_tripId_idx" ON "TripDay"("tripId");

-- AddIndex: ItemCategory.tripId
CREATE INDEX IF NOT EXISTS "ItemCategory_tripId_idx" ON "ItemCategory"("tripId");

-- AddIndex: ExternalReference.tripId
CREATE INDEX IF NOT EXISTS "ExternalReference_tripId_idx" ON "ExternalReference"("tripId");

-- AddIndex: DayEntry.dayId
CREATE INDEX IF NOT EXISTS "DayEntry_dayId_idx" ON "DayEntry"("dayId");
