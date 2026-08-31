-- AlterTable
ALTER TABLE "EnquiryMessage" ADD COLUMN     "status" "MessageStatus" NOT NULL DEFAULT 'SENT';
ALTER TABLE "EnquiryMessage" ADD COLUMN     "automationGenerated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EnquiryMessage" ADD COLUMN     "approvedByUserId" TEXT;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "enquiryAutomationMode" "AutomationMode" NOT NULL DEFAULT 'FULL_AUTONOMOUS';

-- AddForeignKey
ALTER TABLE "EnquiryMessage" ADD CONSTRAINT "EnquiryMessage_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
