-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "ownerClientId" TEXT;

-- AlterTable
ALTER TABLE "OfferGroup" ADD COLUMN     "ownerClientId" TEXT;

-- CreateIndex
CREATE INDEX "Campaign_ownerClientId_idx" ON "Campaign"("ownerClientId");

-- CreateIndex
CREATE INDEX "OfferGroup_ownerClientId_idx" ON "OfferGroup"("ownerClientId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferGroup" ADD CONSTRAINT "OfferGroup_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
