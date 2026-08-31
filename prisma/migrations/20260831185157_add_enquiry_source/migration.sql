-- CreateEnum
CREATE TYPE "EnquirySource" AS ENUM ('LANDING_PAGE', 'WHATSAPP');

-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "source" "EnquirySource" NOT NULL DEFAULT 'LANDING_PAGE';

-- CreateIndex
CREATE INDEX "Enquiry_source_idx" ON "Enquiry"("source");
