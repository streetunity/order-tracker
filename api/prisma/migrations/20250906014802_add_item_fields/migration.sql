-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "modelNumber" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "notes" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "voltage" TEXT;

-- CreateIndex
CREATE INDEX "OrderItem_modelNumber_idx" ON "OrderItem"("modelNumber");
