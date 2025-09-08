-- CreateTable
CREATE TABLE "OrderItemStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    CONSTRAINT "OrderItemStatusEvent_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "poNumber" TEXT,
    "sku" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "trackingToken" TEXT NOT NULL,
    "tokenIssuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenRevokedAt" DATETIME,
    "currentStage" TEXT NOT NULL DEFAULT 'MANUFACTURING',
    "etaDate" DATETIME,
    "shippingCarrier" TEXT,
    "trackingNumber" TEXT,
    CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("accountId", "createdAt", "currentStage", "etaDate", "id", "poNumber", "shippingCarrier", "sku", "tokenIssuedAt", "tokenRevokedAt", "trackingNumber", "trackingToken", "updatedAt") SELECT "accountId", "createdAt", "currentStage", "etaDate", "id", "poNumber", "shippingCarrier", "sku", "tokenIssuedAt", "tokenRevokedAt", "trackingNumber", "trackingToken", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");
CREATE INDEX "Order_accountId_idx" ON "Order"("accountId");
CREATE INDEX "Order_currentStage_idx" ON "Order"("currentStage");
CREATE INDEX "Order_poNumber_idx" ON "Order"("poNumber");
CREATE INDEX "Order_sku_idx" ON "Order"("sku");
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "currentStage" TEXT NOT NULL DEFAULT 'MANUFACTURING',
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("id", "orderId", "productCode", "qty") SELECT "id", "orderId", "productCode", "qty" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productCode_idx" ON "OrderItem"("productCode");
CREATE INDEX "OrderItem_currentStage_idx" ON "OrderItem"("currentStage");
CREATE TABLE "new_OrderStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrderStatusEvent" ("changedBy", "createdAt", "id", "note", "orderId", "stage") SELECT "changedBy", "createdAt", "id", "note", "orderId", "stage" FROM "OrderStatusEvent";
DROP TABLE "OrderStatusEvent";
ALTER TABLE "new_OrderStatusEvent" RENAME TO "OrderStatusEvent";
CREATE INDEX "OrderStatusEvent_orderId_idx" ON "OrderStatusEvent"("orderId");
CREATE INDEX "OrderStatusEvent_stage_idx" ON "OrderStatusEvent"("stage");
CREATE INDEX "OrderStatusEvent_createdAt_idx" ON "OrderStatusEvent"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "OrderItemStatusEvent_orderItemId_idx" ON "OrderItemStatusEvent"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemStatusEvent_stage_idx" ON "OrderItemStatusEvent"("stage");

-- CreateIndex
CREATE INDEX "OrderItemStatusEvent_createdAt_idx" ON "OrderItemStatusEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Account_name_idx" ON "Account"("name");
