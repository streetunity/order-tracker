# Manufacturing Order Tracker - Measurements Feature Branch

## 🚀 Local Development Setup

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Git

### Quick Start

1. **Clone and checkout the feature branch:**
```bash
git clone https://github.com/streetunity/order-tracker.git
cd order-tracker
git checkout feature/add-measurements
```

2. **Backend Setup (Terminal 1):**
```bash
cd api
npm install
npx prisma generate
npx prisma migrate dev --name add-measurements
npm run dev
```
Backend will run on `http://localhost:4000`

3. **Frontend Setup (Terminal 2):**
```bash
cd web
npm install
npm run dev
```
Frontend will run on `http://localhost:3000`

### Default Login Credentials
- **Admin:** admin@stealthmachinetools.com / admin123
- **Agent:** john@stealthmachinetools.com / agent123

## 📏 New Measurements Feature

### What's New
The measurements feature allows users to track dimensions and weight for order items, even when orders are locked.

### Key Features
- ✅ **Lock-Bypass Measurements**: Update height, width, length, weight even on locked orders
- ✅ **Audit Trail**: Complete history of all measurement changes
- ✅ **Bulk Updates**: Update measurements for multiple items at once
- ✅ **Units Support**: Inches/cm for dimensions, lbs/kg for weight

### New API Endpoints

#### 1. Update Item Measurements (Bypasses Lock)
```
PATCH /api/orders/{orderId}/items/{itemId}/measurements
```
```json
{
  "height": 12.5,
  "width": 8.0,
  "length": 10.0,
  "weight": 5.2,
  "measurementUnit": "in",
  "weightUnit": "lbs"
}
```

#### 2. Get Measurement History
```
GET /api/orders/{orderId}/items/{itemId}/measurement-history
```

#### 3. Bulk Update Measurements
```
PATCH /api/orders/{orderId}/measurements/bulk
```
```json
{
  "items": [
    {
      "itemId": "item-1",
      "height": 12.5,
      "width": 8.0,
      "length": 10.0,
      "weight": 5.2
    },
    {
      "itemId": "item-2",
      "height": 15.0,
      "width": 10.0,
      "length": 12.0,
      "weight": 7.8
    }
  ]
}
```

## 🧪 Testing the Measurements Feature

### Test Scenario 1: Basic Measurement Update
1. Login as admin or agent
2. Create a new order with items
3. Navigate to the order details
4. Update measurements for an item
5. Verify the measurements are saved

### Test Scenario 2: Lock Bypass
1. Create an order with items
2. Lock the order (admin only can unlock)
3. Try to edit regular fields - should be blocked
4. Try to edit measurements - should work
5. Check audit log for measurement updates

### Test Scenario 3: Bulk Updates
1. Create an order with multiple items
2. Use the bulk update endpoint to update all items
3. Verify all measurements are updated
4. Check audit log for bulk operation

### Test Scenario 4: Measurement History
1. Update measurements multiple times
2. Fetch measurement history
3. Verify all changes are logged with timestamps
4. Verify who made each change

## 🐛 Common Issues & Solutions

### Issue: Database migrations fail
```bash
# Reset the database and run migrations fresh
cd api
rm prisma/dev.db
npx prisma migrate dev --name init
```

### Issue: CORS errors
Ensure both servers are running and check `.env` files:
- API `.env`: `CORS_ORIGIN=http://localhost:3000`
- Web `.env.local`: `NEXT_PUBLIC_API_BASE=http://localhost:4000`

### Issue: Authentication errors
Clear browser cookies/localStorage and login again with the default credentials.

## 📝 Database Schema Changes

### OrderItem Table - New Fields
```prisma
model OrderItem {
  // ... existing fields ...
  
  // NEW MEASUREMENT FIELDS
  height          Float?    // Height dimension
  width           Float?    // Width dimension  
  length          Float?    // Length dimension
  weight          Float?    // Weight
  measurementUnit String?   @default("in")  // "in" or "cm"
  weightUnit      String?   @default("lbs") // "lbs" or "kg"
  measuredAt      DateTime? // When last measured
  measuredBy      String?   // Who measured
}
```

### New Audit Tables
- `AuditLog` - General audit log for all entities
- `MeasurementAuditLog` - Specific measurement change tracking

## 🚢 Next Steps for AWS Deployment

Once local testing is complete:

1. Create new branch from this one:
```bash
git checkout -b feature/aws-deployment
```

2. Update configuration files:
- Add production environment variables
- Update CORS settings
- Configure for production database
- Add PM2 configuration
- Update nginx configuration

3. Test on staging environment before production

## 📚 Additional Resources
- [Prisma Documentation](https://www.prisma.io/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Express.js Documentation](https://expressjs.com)

## 🤝 Contributing
1. Test thoroughly on local environment
2. Document any issues found
3. Create pull request with detailed description
4. Wait for code review before merging

---
*Last Updated: September 21, 2025*