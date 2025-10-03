# Reporting Suite Implementation Guide

## Overview
This guide covers the implementation of a comprehensive reporting suite for the Order Tracker system covering sales, revenue, cycle times, and operational analytics.

## Files Created

### 1. Backend Utilities
- **`api/src/utils/reportHelpers.js`** - Utility functions for report calculations
  - Filter parsing
  - Statistical calculations (median, p90)
  - Date bucketing (monthly, weekly)
  - Duration calculations
  - Pagination helpers

### 2. Report Routers
- **`api/src/routes/reports.js`** - Sales & Revenue endpoints
- **`api/src/routes/reportsCycleTime.js`** - Cycle time & flow endpoints
- **`api/src/routes/reportsComplete.js`** - Combined router module

## Available Report Endpoints

### Sales & Revenue (Admin Only)
1. **GET /reports/sales-by-rep** - Revenue breakdown by sales representative
2. **GET /reports/sales-by-month** - Monthly sales with MoM change
3. **GET /reports/sales-by-item** - Top N products by revenue
4. **GET /reports/ovar** - Order Value at Risk analysis

### Cycle Time & Flow (All Users)
5. **GET /reports/cycle-times** - Average time from order creation to completion
6. **GET /reports/throughput** - Items entering stages per week
7. **GET /reports/stage-durations/leaderboard** - Median & p90 duration per stage
8. **GET /reports/on-time** - On-time delivery rate & ETA slippage
9. **GET /reports/first-pass-yield** - Items with no backward movements
10. **GET /reports/rework-hotlist** - Backward transitions by reason
11. **GET /reports/chokepoints** - Items stuck in stages
12. **GET /reports/lock-usage** - Lock duration and edit friction

### Dashboard
13. **GET /reports/summary** - Key metrics overview

## Integration Steps

### Step 1: Import Reports Router in index.js

Add these imports at the top of `api/src/index.js`:

```javascript
import { createReportsRouter } from './routes/reports.js';
import { addCycleTimeReports } from './routes/reportsCycleTime.js';
import { addLockUsageReport } from './routes/reportsCycleTime.js';
```

### Step 2: Mount Reports Router

After the `app.use(cookieParser())` line, add:

```javascript
// Initialize reports router
const reportsRouter = createReportsRouter(prisma);

// Add cycle time reports
import { Router } from 'express';
const cycleTimeRouter = Router();
addCycleTimeReports(cycleTimeRouter, prisma);
addLockUsageReport(cycleTimeRouter, prisma);

// Mount all report endpoints
app.use('/reports', reportsRouter);
app.use('/reports', cycleTimeRouter);
```

### Step 3: Test the Endpoints

After deploying, test with:

```bash
# Get sales by rep (requires admin token)
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "http://your-server:4000/reports/sales-by-rep?date_from=2025-01-01&date_to=2025-12-31"

# Get cycle times
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://your-server:4000/reports/cycle-times?date_from=2025-01-01"

# Get summary dashboard
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://your-server:4000/reports/summary"
```

## Query Parameters

All endpoints support these common filters:

- `date_mode`: "created" | "completed" (default: "created")
- `date_from`: ISO date (e.g., "2025-01-01")
- `date_to`: ISO date
- `accountId`: Filter by customer
- `repId`: Filter by sales rep (user ID)
- `stage`: Filter by stage (can be array)
- `productCode`: Filter by product (can be array)
- `page`: Page number (default: 1)
- `pageSize`: Results per page (default: 50, max: 100)
- `debug`: Set to "1" for timing info

## Response Format

All endpoints return:

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": "2025-12-31T23:59:59.999Z",
    "date_mode": "created",
    "filtersApplied": { ... },
    "timezone": "UTC"
  },
  "kpis": {
    "grandTotal": 1234567,
    "grandTotalFormatted": "$1,234,567",
    ...
  },
  "series": [
    { "label": "value", ... }
  ],
  "rows": {
    "data": [...],
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "total": 150,
      "totalPages": 3,
      "hasMore": true
    }
  },
  "debug": { ... } // if debug=1
}
```

## Frontend Integration (Next Steps)

### Create Report Components

1. **KPI Cards** - Display key metrics
2. **Charts** - Line, bar, and area charts for trends
3. **Data Tables** - Sortable, filterable tables with pagination
4. **Filters Sidebar** - Date ranges, dropdowns for accounts/reps/stages

### Example React Component Structure

```
web/app/admin/reports/
├── page.jsx                    # Main reports dashboard
├── components/
│   ├── KPICard.jsx            # Reusable KPI display
│   ├── ReportChart.jsx        # Chart wrapper
│   ├── ReportTable.jsx        # Data table with pagination
│   ├── FilterSidebar.jsx      # Report filters
│   └── ReportExport.jsx       # CSV export button
├── sales/
│   ├── page.jsx               # Sales reports
│   ├── by-rep/page.jsx
│   ├── by-month/page.jsx
│   └── by-item/page.jsx
└── operations/
    ├── page.jsx               # Operations reports
    ├── cycle-times/page.jsx
    ├── throughput/page.jsx
    └── chokepoints/page.jsx
```

## Performance Considerations

### Database Indexing

For optimal performance, ensure these indexes exist:

```sql
-- Order indexes
CREATE INDEX idx_orders_created_at ON Order(createdAt);
CREATE INDEX idx_orders_current_stage ON Order(currentStage);
CREATE INDEX idx_orders_account_id ON Order(accountId);
CREATE INDEX idx_orders_created_by ON Order(createdByUserId);

-- Item indexes
CREATE INDEX idx_items_order_id ON OrderItem(orderId);
CREATE INDEX idx_items_product_code ON OrderItem(productCode);
CREATE INDEX idx_items_created_at ON OrderItem(createdAt);

-- Status event indexes
CREATE INDEX idx_item_events_item_id ON OrderItemStatusEvent(orderItemId);
CREATE INDEX idx_item_events_created_at ON OrderItemStatusEvent(createdAt);
CREATE INDEX idx_item_events_stage ON OrderItemStatusEvent(stage);

-- Audit log indexes (already exist)
-- See prisma/schema.prisma
```

### Caching Strategy

For production, consider:

1. **Redis caching** for frequently accessed reports
2. **Materialized views** for complex aggregations
3. **Background jobs** to pre-compute daily/weekly reports

## Materialized Views (Future Enhancement)

Create these views for better performance:

```sql
-- Order cycle times view
CREATE VIEW order_cycle_times AS
SELECT 
  o.id as orderId,
  o.createdAt,
  MAX(ise.createdAt) as completedAt,
  (JULIANDAY(MAX(ise.createdAt)) - JULIANDAY(o.createdAt)) * 86400 as durationSec
FROM Order o
JOIN OrderItem oi ON oi.orderId = o.id
JOIN OrderItemStatusEvent ise ON ise.orderItemId = oi.id
WHERE ise.stage = 'FOLLOW_UP'  -- Final stage
GROUP BY o.id;

-- Stage durations view
CREATE VIEW item_stage_durations AS
SELECT 
  ise1.orderItemId as itemId,
  ise1.stage,
  ise1.createdAt as startedAt,
  MIN(ise2.createdAt) as endedAt,
  (JULIANDAY(MIN(ise2.createdAt)) - JULIANDAY(ise1.createdAt)) * 86400 as durationSec
FROM OrderItemStatusEvent ise1
LEFT JOIN OrderItemStatusEvent ise2 
  ON ise2.orderItemId = ise1.orderItemId 
  AND ise2.createdAt > ise1.createdAt
GROUP BY ise1.id;
```

## Deployment Checklist

- [ ] All report files pushed to GitHub
- [ ] index.js updated with report routers
- [ ] Server pulled latest changes (`git pull origin aws-deployment`)
- [ ] Backend rebuilt (`cd api && npm install`)
- [ ] Backend restarted (`pm2 restart order-tracker-backend`)
- [ ] Tested at least 3 endpoints with Postman/curl
- [ ] Verified authentication works (401 without token)
- [ ] Verified admin-only endpoints reject non-admin users
- [ ] Checked PM2 logs for errors (`pm2 logs order-tracker-backend`)

## Common Issues & Solutions

### Issue: 401 Unauthorized
**Solution**: Include valid JWT token in Authorization header

### Issue: Empty results
**Solution**: Check date filters - may be filtering out all data

### Issue: Slow queries
**Solution**: Add database indexes, reduce date range, or implement caching

### Issue: Import errors
**Solution**: Ensure all files are in correct directories and use `.js` extensions in imports

## API Documentation Examples

### Sales by Rep
```javascript
// Request
GET /reports/sales-by-rep?date_from=2025-01-01&date_to=2025-12-31&monthly=true

// Response
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": "2025-12-31T23:59:59.999Z",
    "date_mode": "created",
    "filtersApplied": {},
    "timezone": "UTC"
  },
  "kpis": {
    "grandTotal": 2500000,
    "grandTotalFormatted": "$2,500,000",
    "repCount": 5,
    "orderCount": 120
  },
  "series": [
    {
      "month": "2025-01",
      "John Doe": 150000,
      "Jane Smith": 200000
    }
  ],
  "rows": [
    {
      "repId": "user123",
      "repName": "John Doe",
      "email": "john@example.com",
      "total": 450000,
      "totalFormatted": "$450,000"
    }
  ]
}
```

### Cycle Times
```javascript
// Request
GET /reports/cycle-times?date_from=2025-01-01

// Response
{
  "meta": {...},
  "kpis": {
    "completedOrders": 45,
    "medianCycleTimeSec": 1296000,
    "medianCycleTimeDays": "15.0",
    "medianFormatted": "15d 0h",
    "p90CycleTimeSec": 2592000,
    "p90TimeDays": "30.0",
    "p90Formatted": "30d 0h"
  },
  "rows": {
    "data": [
      {
        "orderId": "order123",
        "poNumber": "PO-2025-001",
        "accountName": "Acme Corp",
        "cycleTimeSec": 1296000,
        "cycleTimeDays": "15.0",
        "cycleTimeFormatted": "15d 0h"
      }
    ],
    "pagination": {...}
  }
}
```

## Next Steps

1. **Integrate into index.js** - Add the import and mount statements
2. **Deploy to server** - Pull changes and restart backend
3. **Build frontend** - Create React components to consume these endpoints
4. **Add visualizations** - Use chart libraries (recharts, chart.js)
5. **Implement caching** - Add Redis for frequently accessed reports
6. **Add export** - CSV/Excel export functionality
7. **Create scheduled reports** - Email reports on schedule

## Support

For issues or questions:
1. Check PM2 logs: `pm2 logs order-tracker-backend`
2. Verify endpoints with curl or Postman
3. Check database for data availability
4. Review console output for debugging info (add `?debug=1` to URLs)
