-- Add itemPrice and privateItemNote fields to OrderItem table
ALTER TABLE "OrderItem" 
ADD COLUMN "itemPrice" DECIMAL(10, 2),
ADD COLUMN "privateItemNote" TEXT;