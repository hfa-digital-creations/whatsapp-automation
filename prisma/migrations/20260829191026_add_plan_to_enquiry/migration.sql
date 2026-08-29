-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "planId" TEXT;

-- CreateIndex
CREATE INDEX "Enquiry_planId_idx" ON "Enquiry"("planId");

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
