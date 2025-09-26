-- Add ordered status fields to OrderItem
ALTER TABLE "OrderItem" ADD COLUMN "isOrdered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderItem" ADD COLUMN "orderedAt" DATETIME;
ALTER TABLE "OrderItem" ADD COLUMN "orderedBy" TEXT;