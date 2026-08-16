-- CreateTable
CREATE TABLE "OfferGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "clientId" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferGroupMember_groupId_idx" ON "OfferGroupMember"("groupId");

-- AddForeignKey
ALTER TABLE "OfferGroupMember" ADD CONSTRAINT "OfferGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OfferGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferGroupMember" ADD CONSTRAINT "OfferGroupMember_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
