# Order Tracker Reporting Suite

## 🎯 What's Been Built

A comprehensive reporting and analytics module for the Order Tracker system with 13 specialized endpoints covering:

- **Sales & Revenue Analytics** (4 endpoints)
- **Cycle Time & Flow Metrics** (7 endpoints)  
- **Operational Insights** (2 endpoints)

## 📁 Files Created

```
api/src/
├── utils/
│   └── reportHelpers.js          # Utility functions for calculations
├── routes/
│   ├── reports.js                # Sales & revenue endpoints
│   ├── reportsCycleTime.js       # Cycle time & flow endpoints
│   └── reportsComplete.js        # Combined router module
```

## 🚀 Quick Start

### 1. Pull Latest Changes

```bash
cd /var/www/order-tracker
git pull origin aws-deployment
```

### 2. Install Dependencies (if needed)

```bash
cd api
npm install
```

### 3. Integrate Reports Module

Open `api/src/index.js` and make these 2 small changes:

**A. Add import (around line 14):**
```javascript
import { createReportsRouter } from './routes/reports.js';
```

**B. Mount router (after `app.use(cookieParser());` around line 65):**
```javascript
// Reports Module
const reportsRouter = createReportsRouter(prisma);
app.use('/reports', authGuard, reportsRouter);
console.log('Reports module loaded');
```

### 4. Restart Backend

```bash
pm2 restart order-tracker-backend
pm2 logs order-tracker-backend
```

Look for "Reports module loaded" in the logs.

### 5. Test It!

```bash
# Get your auth token first (from browser localStorage or login endpoint)
export TOKEN="your-jwt-token-here"

# Test summary endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/reports/summary

# Test sales by rep (admin only)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/reports/sales-by-rep?date_from=2025-01-01&date_to=2025-12-31"
```

## 📊 Available Endpoints

### Sales & Revenue (Admin Only)

| Endpoint | Description |
|----------|-------------|
| `GET /reports/sales-by-rep` | Revenue breakdown by sales representative with optional monthly grouping |
| `GET /reports/sales-by-month` | Monthly sales totals with month-over-month change percentages |
| `GET /reports/sales-by-item` | Top N products ranked by total revenue |
| `GET /reports/ovar` | Order Value at Risk - money tied up in late or aging orders |

### Cycle Time & Flow (All Authenticated Users)

| Endpoint | Description |
|----------|-------------|
| `GET /reports/cycle-times` | Average time from order creation to completion with median and p90 |
| `GET /reports/throughput` | Count of items entering each stage per week |
| `GET /reports/stage-durations/leaderboard` | Median & p90 duration statistics for each stage |
| `GET /reports/on-time` | On-time delivery rate and ETA slippage analysis |
| `GET /reports/first-pass-yield` | Percentage of items with no backward stage movements |
| `GET /reports/rework-hotlist` | Backward transitions grouped by stage and reason |
| `GET /reports/chokepoints` | Items stuck longest in a specified stage |

### Dashboard & Operations

| Endpoint | Description |
|----------|-------------|
| `GET /reports/summary` | Dashboard with key metrics: active orders, completed orders, revenue |
| `GET /reports/lock-usage` | Lock duration and edit attempt analysis |

## 🔧 Common Query Parameters

All endpoints support these filters:

```
?date_from=2025-01-01          # Start date (ISO format)
?date_to=2025-12-31            # End date (ISO format)
?date_mode=created             # "created" or "completed"
?accountId=abc123              # Filter by customer
?repId=user123                 # Filter by sales rep
?stage=MANUFACTURING           # Filter by stage (repeatable)
?productCode=LASER-1000        # Filter by product (repeatable)
?page=1                        # Page number
?pageSize=50                   # Results per page (max 100)
?debug=1                       # Include timing information
```

## 📖 Documentation

See [`REPORTING_IMPLEMENTATION_GUIDE.md`](./REPORTING_IMPLEMENTATION_GUIDE.md) for:
- Detailed endpoint documentation
- Response format examples
- Frontend integration guide
- Performance optimization tips
- Database indexing recommendations
- Caching strategies

## 🎨 Frontend Integration (Next Steps)

### Recommended Structure

```
web/app/admin/reports/
├── page.jsx                    # Main dashboard
├── components/
│   ├── KPICard.jsx            # Metric display cards
│   ├── ReportChart.jsx        # Chart visualizations
│   ├── ReportTable.jsx        # Data tables with pagination
│   └── FilterSidebar.jsx      # Date/filter controls
├── sales/
│   ├── page.jsx
│   ├── by-rep/page.jsx
│   ├── by-month/page.jsx
│   └── by-item/page.jsx
└── operations/
    ├── page.jsx
    ├── cycle-times/page.jsx
    ├── throughput/page.jsx
    └── chokepoints/page.jsx
```

### Suggested Libraries

- **Charts**: recharts, chart.js, or plotly.js
- **Tables**: @tanstack/react-table
- **Date Pickers**: react-day-picker or date-fns
- **Export**: papaparse (for CSV export)

## 🔐 Security & Permissions

- All endpoints require authentication (`authGuard`)
- Financial endpoints require admin role (`adminGuard`)
- Sales & Revenue reports are admin-only
- Operations reports available to all authenticated users

## ⚡ Performance Tips

1. **Use date ranges** - Don't query all-time data without filters
2. **Paginate large results** - Use `page` and `pageSize` parameters
3. **Cache frequently accessed reports** - Consider Redis for production
4. **Add database indexes** - See guide for recommended indexes
5. **Limit date ranges** - 90-day windows for best performance

## 🐛 Troubleshooting

### "Cannot find module './routes/reports.js'"
- Ensure you pulled latest changes: `git pull origin aws-deployment`
- Check file exists: `ls -la api/src/routes/reports.js`

### "401 Unauthorized"
- Verify token is valid and not expired
- Check Authorization header format: `Bearer YOUR_TOKEN`

### "Empty results"
- Check date filters - may be filtering out all data
- Verify data exists in database for the filter criteria
- Try broader date range or remove filters

### "Slow queries"
- Add database indexes (see implementation guide)
- Reduce date range
- Implement caching for frequently accessed reports

## 📝 Example Requests

### Get Sales Summary

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/reports/sales-by-rep?\
date_from=2025-01-01&\
date_to=2025-12-31&\
monthly=true"
```

### Get Cycle Time Metrics

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/reports/cycle-times?\
date_from=2025-01-01&\
date_to=2025-12-31"
```

### Find Chokepoints in Manufacturing Stage

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/reports/chokepoints?\
targetStage=MANUFACTURING&\
pageSize=20"
```

### Get On-Time Delivery Rate

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/reports/on-time?\
date_from=2025-01-01&\
accountId=customer123"
```

## ✅ Deployment Checklist

- [ ] Pulled latest code from aws-deployment branch
- [ ] Added import statement to index.js
- [ ] Mounted reports router in index.js
- [ ] Restarted backend with PM2
- [ ] Checked logs for "Reports module loaded"
- [ ] Tested at least one endpoint with curl/Postman
- [ ] Verified authentication is working
- [ ] Tested with different query parameters
- [ ] Verified admin-only endpoints reject non-admins

## 🎓 Learning Resources

- **Prisma Aggregations**: https://www.prisma.io/docs/concepts/components/prisma-client/aggregation-grouping-summarizing
- **Express Router**: https://expressjs.com/en/guide/routing.html
- **JWT Authentication**: Already implemented in middleware/auth.js

## 💡 Future Enhancements

1. **Caching Layer** - Redis for frequently accessed reports
2. **Scheduled Reports** - Email daily/weekly summaries
3. **Export Functionality** - CSV/Excel/PDF downloads
4. **Real-time Dashboard** - WebSocket updates
5. **Custom Report Builder** - Let users create ad-hoc reports
6. **Forecasting** - ML-based predictions
7. **Benchmarking** - Compare against historical averages

## 🤝 Contributing

When adding new reports:
1. Add endpoint to appropriate router file
2. Use existing helper functions from `reportHelpers.js`
3. Follow the standard response format
4. Add documentation to this README
5. Test with various filter combinations

## 📞 Support

- Check PM2 logs: `pm2 logs order-tracker-backend`
- Add `?debug=1` to URLs for timing information
- Review Prisma queries in console output
- Verify data exists in database

---

**Built for Order Tracker** | Version 1.0 | October 2025
