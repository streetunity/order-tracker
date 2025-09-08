/*
  Warnings:

  - You are about to drop the `OrderAuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `tokenIssuedAt` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `tokenRevokedAt` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `changedBy` on the `OrderItemStatusEvent` table. All the data in the column will be lost.
  - You are about to drop the column `changedBy` on the `OrderStatusEvent` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Account` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "OrderAuditLog_createdAt_idx";

-- DropIndex
DROP INDEX "OrderAuditLog_action_idx";

-- DropIndex
DROP INDEX "OrderAuditLog_orderId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OrderAuditLog";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "parentEntityId" TEXT,
    "action" TEXT NOT NULL,
    "changes" TEXT,
    "metadata" TEXT,
    "performedByUserId" TEXT,
    "performedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AGENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "machineVoltage" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Account" ("address", "createdAt", "email", "id", "machineVoltage", "name", "notes", "phone") SELECT "address", "createdAt", "email", "id", "machineVoltage", "name", "notes", "phone" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "poNumber" TEXT,
    "sku" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "etaDate" DATETIME,
    "currentStage" TEXT NOT NULL DEFAULT 'MANUFACTURING',
    "trackingToken" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "shippingCarrier" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "createdByUserId" TEXT,
    CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("accountId", "createdAt", "currentStage", "etaDate", "id", "isLocked", "lockedAt", "lockedBy", "poNumber", "shippingCarrier", "sku", "trackingNumber", "trackingToken", "updatedAt") SELECT "accountId", "createdAt", "currentStage", "etaDate", "id", "isLocked", "lockedAt", "lockedBy", "poNumber", "shippingCarrier", "sku", "trackingNumber", "trackingToken", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "serialNumber" TEXT,
    "modelNumber" TEXT,
    "voltage" TEXT,
    "notes" TEXT,
    "currentStage" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("archivedAt", "currentStage", "id", "modelNumber", "notes", "orderId", "productCode", "qty", "serialNumber", "voltage") SELECT "archivedAt", "currentStage", "id", "modelNumber", "notes", "orderId", "productCode", "qty", "serialNumber", "voltage" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE TABLE "new_OrderItemStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByUserId" TEXT,
    CONSTRAINT "OrderItemStatusEvent_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItemStatusEvent_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItemStatusEvent" ("createdAt", "id", "note", "orderItemId", "stage") SELECT "createdAt", "id", "note", "orderItemId", "stage" FROM "OrderItemStatusEvent";
DROP TABLE "OrderItemStatusEvent";
ALTER TABLE "new_OrderItemStatusEvent" RENAME TO "OrderItemStatusEvent";
CREATE TABLE "new_OrderStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByUserId" TEXT,
    CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderStatusEvent_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderStatusEvent" ("createdAt", "id", "note", "orderId", "stage") SELECT "createdAt", "id", "note", "orderId", "stage" FROM "OrderStatusEvent";
DROP TABLE "OrderStatusEvent";
ALTER TABLE "new_OrderStatusEvent" RENAME TO "OrderStatusEvent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_parentEntityId_idx" ON "AuditLog"("parentEntityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
