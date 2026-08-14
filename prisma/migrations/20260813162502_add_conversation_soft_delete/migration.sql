-- AlterTable
ALTER TABLE "CustomerConversation" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CustomerConversation_clientId_deletedAt_idx" ON "CustomerConversation"("clientId", "deletedAt");
