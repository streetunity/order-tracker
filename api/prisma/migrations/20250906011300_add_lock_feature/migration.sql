-- CreateTable
CREATE TABLE "OrderAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderAuditLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
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
CREATE INDEX "Order_isLocked_idx" ON "Order"("isLocked");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "OrderAuditLog_orderId_idx" ON "OrderAuditLog"("orderId");

-- CreateIndex
CREATE INDEX "OrderAuditLog_action_idx" ON "OrderAuditLog"("action");

-- CreateIndex
CREATE INDEX "OrderAuditLog_createdAt_idx" ON "OrderAuditLog"("createdAt");
