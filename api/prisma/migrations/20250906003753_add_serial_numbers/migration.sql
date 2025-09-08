-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "serialNumber" TEXT;

-- CreateIndex
CREATE INDEX "OrderItem_serialNumber_idx" ON "OrderItem"("serialNumber");
