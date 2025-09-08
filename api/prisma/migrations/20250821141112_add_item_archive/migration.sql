-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "archivedAt" DATETIME;

-- CreateIndex
CREATE INDEX "OrderItem_archivedAt_idx" ON "OrderItem"("archivedAt");
