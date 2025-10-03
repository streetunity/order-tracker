# Report API Response Examples

Complete example responses for all reporting endpoints to help with frontend development.

## Table of Contents
- [Sales & Revenue](#sales--revenue)
- [Cycle Time & Flow](#cycle-time--flow)
- [Dashboard](#dashboard)

---

## Sales & Revenue

### GET /reports/sales-by-rep

**Query:** `?date_from=2025-01-01&date_to=2025-12-31&monthly=true`

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": "2025-12-31T23:59:59.999Z",
    "date_mode": "created",
    "filtersApplied": {
      "accountId": null,
      "stages": [],
      "productCodes": []
    },
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
      "Jane Smith": 200000,
      "Bob Johnson": 100000
    },
    {
      "month": "2025-02",
      "John Doe": 180000,
      "Jane Smith": 220000,
      "Bob Johnson": 120000
    }
  ],
  "rows": [
    {
      "repId": "clx1234abcd",
      "repName": "Jane Smith",
      "email": "jane@stealthmachinetools.com",
      "total": 850000,
      "totalFormatted": "$850,000"
    },
    {
      "repId": "clx5678efgh",
      "repName": "John Doe",
      "email": "john@stealthmachinetools.com",
      "total": 650000,
      "totalFormatted": "$650,000"
    }
  ]
}
```

### GET /reports/sales-by-month

**Query:** `?date_from=2025-01-01&date_to=2025-06-30`

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": "2025-06-30T23:59:59.999Z",
    "date_mode": "created",
    "filtersApplied": {},
    "timezone": "UTC"
  },
  "kpis": {
    "grandTotal": 1200000,
    "grandTotalFormatted": "$1,200,000",
    "monthCount": 6
  },
  "series": [
    {
      "month": "2025-01",
      "total": 150000,
      "totalFormatted": "$150,000"
    },
    {
      "month": "2025-02",
      "total": 180000,
      "totalFormatted": "$180,000",
      "mom": {
        "change": 30000,
        "changeFormatted": "$30,000",
        "changePercent": "20.0",
        "direction": "up"
      }
    },
    {
      "month": "2025-03",
      "total": 200000,
      "totalFormatted": "$200,000",
      "mom": {
        "change": 20000,
        "changeFormatted": "$20,000",
        "changePercent": "11.1",
        "direction": "up"
      }
    }
  ]
}
```

### GET /reports/sales-by-item

**Query:** `?date_from=2025-01-01&topN=5`

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": null,
    "date_mode": "created",
    "topN": 5,
    "filtersApplied": {}
  },
  "kpis": {
    "grandTotal": 2500000,
    "grandTotalFormatted": "$2,500,000",
    "uniqueProducts": 45
  },
  "series": [
    {
      "productCode": "LASER-5000",
      "total": 500000,
      "count": 10,
      "avgPrice": 50000,
      "totalFormatted": "$500,000",
      "avgPriceFormatted": "$50,000",
      "percentOfTotal": "20.0"
    },
    {
      "productCode": "MILL-3000",
      "total": 350000,
      "count": 7,
      "avgPrice": 50000,
      "totalFormatted": "$350,000",
      "avgPriceFormatted": "$50,000",
      "percentOfTotal": "14.0"
    }
  ],
  "rows": [
    {
      "productCode": "LASER-5000",
      "total": 500000,
      "count": 10,
      "avgPrice": 50000,
      "totalFormatted": "$500,000",
      "avgPriceFormatted": "$50,000",
      "percentOfTotal": "20.0"
    },
    {
      "productCode": "OTHER",
      "total": 1150000,
      "count": 230,
      "avgPrice": 5000,
      "totalFormatted": "$1,150,000",
      "avgPriceFormatted": "$5,000",
      "percentOfTotal": "46.0"
    }
  ]
}
```

### GET /reports/ovar

**Query:** `?agingThreshold=604800`

```json
{
  "meta": {
    "agingThresholdDays": 7,
    "filtersApplied": {}
  },
  "kpis": {
    "totalAtRisk": 450000,
    "totalAtRiskFormatted": "$450,000",
    "lateTotal": 250000,
    "lateTotalFormatted": "$250,000",
    "lateCount": 5,
    "agingTotal": 200000,
    "agingTotalFormatted": "$200,000",
    "agingCount": 3
  },
  "series": [
    {
      "category": "Late Orders",
      "value": 250000,
      "count": 5
    },
    {
      "category": "Aging Orders",
      "value": 200000,
      "count": 3
    }
  ],
  "rows": {
    "late": [
      {
        "orderId": "clx123order",
        "accountName": "Acme Corp",
        "poNumber": "PO-2025-001",
        "value": 85000,
        "valueFormatted": "$85,000",
        "etaDate": "2025-08-15T00:00:00.000Z",
        "daysLate": 45,
        "currentStage": "SHIPPING"
      }
    ],
    "aging": [
      {
        "orderId": "clx456order",
        "accountName": "TechCo Industries",
        "poNumber": "PO-2025-015",
        "value": 120000,
        "valueFormatted": "$120,000",
        "currentStage": "MANUFACTURING",
        "timeInStageDays": 12,
        "lastUpdate": "2025-09-18T10:30:00.000Z"
      }
    ]
  }
}
```

---

## Cycle Time & Flow

### GET /reports/cycle-times

**Query:** `?date_from=2025-01-01&pageSize=5`

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": null,
    "filtersApplied": {}
  },
  "kpis": {
    "completedOrders": 45,
    "medianCycleTimeSec": 1296000,
    "medianCycleTimeDays": "15.0",
    "medianFormatted": "15d 0h",
    "p90CycleTimeSec": 2592000,
    "p90CycleTimeDays": "30.0",
    "p90Formatted": "30d 0h",
    "meanCycleTimeSec": 1468800,
    "meanFormatted": "17d 0h"
  },
  "series": [],
  "rows": {
    "data": [
      {
        "orderId": "clx123order",
        "poNumber": "PO-2025-001",
        "accountName": "Acme Corp",
        "createdBy": "Jane Smith",
        "createdAt": "2025-01-15T10:00:00.000Z",
        "completedAt": "2025-02-01T15:30:00.000Z",
        "cycleTimeSec": 1468800,
        "cycleTimeDays": "17.0",
        "cycleTimeFormatted": "17d 0h"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 5,
      "total": 45,
      "totalPages": 9,
      "hasMore": true
    }
  }
}
```

### GET /reports/throughput

**Query:** `?date_from=2025-01-01&date_to=2025-03-31`

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": "2025-03-31T23:59:59.999Z",
    "filtersApplied": {},
    "timezone": "UTC"
  },
  "kpis": {
    "totalTransitions": 1250,
    "weekCount": 13
  },
  "series": [
    {
      "week": "2025-W01",
      "MANUFACTURING": 25,
      "TESTING": 20,
      "SHIPPING": 15,
      "AT_SEA": 10,
      "SMT": 8,
      "QC": 7,
      "DELIVERED": 5,
      "ONSITE": 3,
      "COMPLETED": 2,
      "FOLLOW_UP": 0
    },
    {
      "week": "2025-W02",
      "MANUFACTURING": 30,
      "TESTING": 25,
      "SHIPPING": 20,
      "AT_SEA": 15,
      "SMT": 12,
      "QC": 10,
      "DELIVERED": 8,
      "ONSITE": 5,
      "COMPLETED": 3,
      "FOLLOW_UP": 2
    }
  ],
  "rows": [
    {
      "stage": "MANUFACTURING",
      "count": 325,
      "percentage": "26.0"
    },
    {
      "stage": "TESTING",
      "count": 280,
      "percentage": "22.4"
    }
  ]
}
```

### GET /reports/stage-durations/leaderboard

**Query:** `?lookbackDays=90`

```json
{
  "meta": {
    "lookbackDays": 90,
    "filtersApplied": {}
  },
  "kpis": {
    "itemsAnalyzed": 450,
    "stagesTracked": 10
  },
  "series": [
    {
      "stage": "MANUFACTURING",
      "count": 450,
      "medianSec": 604800,
      "medianDays": "7.0",
      "medianFormatted": "7d 0h",
      "p90Sec": 1209600,
      "p90Days": "14.0",
      "p90Formatted": "14d 0h",
      "minSec": 86400,
      "maxSec": 2592000,
      "maxFormatted": "30d 0h"
    },
    {
      "stage": "TESTING",
      "count": 420,
      "medianSec": 259200,
      "medianDays": "3.0",
      "medianFormatted": "3d 0h",
      "p90Sec": 518400,
      "p90Days": "6.0",
      "p90Formatted": "6d 0h",
      "minSec": 43200,
      "maxSec": 864000,
      "maxFormatted": "10d 0h"
    }
  ],
  "rows": {
    "byStage": [
      /* Same as series */
    ],
    "slowest": [
      {
        "itemId": "clx123item",
        "orderId": "clx123order",
        "poNumber": "PO-2025-001",
        "accountName": "Acme Corp",
        "productCode": "LASER-5000",
        "stage": "MANUFACTURING",
        "durationSec": 2592000,
        "durationDays": "30.0",
        "durationFormatted": "30d 0h",
        "startedAt": "2025-01-15T10:00:00.000Z"
      }
    ]
  }
}
```

### GET /reports/on-time

**Query:** `?date_from=2025-01-01`

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": null,
    "filtersApplied": {}
  },
  "kpis": {
    "onTimeCount": 35,
    "lateCount": 10,
    "totalOrders": 45,
    "onTimeRate": 77.8,
    "onTimeRateFormatted": "77.8%",
    "avgSlippageDays": "-2.5",
    "medianSlippageDays": "-1.0"
  },
  "series": [
    {
      "category": "On-Time",
      "count": 35,
      "percentage": 77.8
    },
    {
      "category": "Late",
      "count": 10,
      "percentage": 22.2
    }
  ],
  "rows": {
    "data": [
      {
        "orderId": "clx123order",
        "poNumber": "PO-2025-001",
        "accountName": "Acme Corp",
        "etaDate": "2025-02-15T00:00:00.000Z",
        "completedAt": "2025-02-10T15:30:00.000Z",
        "onTime": true,
        "slippageDays": -5,
        "status": "early"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "total": 45,
      "totalPages": 1,
      "hasMore": false
    }
  }
}
```

### GET /reports/first-pass-yield

**Query:** `?date_from=2025-01-01`

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": null,
    "filtersApplied": {}
  },
  "kpis": {
    "cleanCount": 380,
    "reworkCount": 70,
    "totalItems": 450,
    "yieldRate": 84.4,
    "yieldRateFormatted": "84.4%"
  },
  "series": [
    {
      "category": "First-Pass",
      "count": 380,
      "percentage": 84.4
    },
    {
      "category": "Rework",
      "count": 70,
      "percentage": 15.6
    }
  ],
  "rows": [
    {
      "itemId": "clx123item",
      "orderId": "clx123order",
      "poNumber": "PO-2025-001",
      "accountName": "Acme Corp",
      "productCode": "LASER-5000",
      "regressionCount": 2,
      "regressions": [
        {
          "from": "SHIPPING",
          "to": "TESTING",
          "date": "2025-02-15T10:30:00.000Z",
          "note": "Failed quality check - bearings issue"
        },
        {
          "from": "TESTING",
          "to": "MANUFACTURING",
          "date": "2025-02-16T14:00:00.000Z",
          "note": "Requires rework on electronics"
        }
      ]
    }
  ]
}
```

### GET /reports/rework-hotlist

**Query:** `?date_from=2025-01-01`

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": null,
    "filtersApplied": {}
  },
  "kpis": {
    "totalBacktracks": 85,
    "uniqueReasons": 15
  },
  "series": [
    {
      "transition": "TESTING->MANUFACTURING: Failed quality check",
      "count": 25,
      "percentage": "29.4"
    },
    {
      "transition": "SHIPPING->TESTING: Damage during packaging",
      "count": 12,
      "percentage": "14.1"
    },
    {
      "transition": "QC->SMT: Assembly error found",
      "count": 10,
      "percentage": "11.8"
    }
  ],
  "rows": [
    {
      "itemId": "clx123item",
      "orderId": "clx123order",
      "poNumber": "PO-2025-001",
      "productCode": "LASER-5000",
      "fromStage": "TESTING",
      "toStage": "MANUFACTURING",
      "reason": "Failed quality check - bearings issue",
      "date": "2025-02-15T10:30:00.000Z"
    }
  ]
}
```

### GET /reports/chokepoints

**Query:** `?targetStage=MANUFACTURING&pageSize=10`

```json
{
  "meta": {
    "targetStage": "MANUFACTURING",
    "filtersApplied": {}
  },
  "kpis": {
    "itemsInStage": 45,
    "medianTimeSec": 604800,
    "medianTimeDays": "7.0",
    "medianFormatted": "7d 0h",
    "p90TimeSec": 1209600,
    "p90TimeDays": "14.0",
    "p90Formatted": "14d 0h",
    "maxTimeSec": 2592000,
    "maxFormatted": "30d 0h"
  },
  "series": [],
  "rows": {
    "data": [
      {
        "itemId": "clx123item",
        "orderId": "clx123order",
        "poNumber": "PO-2025-001",
        "accountName": "Acme Corp",
        "productCode": "LASER-5000",
        "stage": "MANUFACTURING",
        "enteredAt": "2025-08-15T10:00:00.000Z",
        "timeInStageSec": 2592000,
        "timeInStageDays": "30.0",
        "timeInStageFormatted": "30d 0h"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 45,
      "totalPages": 5,
      "hasMore": true
    }
  }
}
```

### GET /reports/lock-usage

**Query:** `?date_from=2025-01-01`

```json
{
  "meta": {
    "date_from": "2025-01-01T00:00:00.000Z",
    "date_to": null,
    "filtersApplied": {}
  },
  "kpis": {
    "totalLocks": 150,
    "avgLockDurationSec": 3600,
    "avgLockDurationFormatted": "1h 0m",
    "totalEditAttempts": 25,
    "uniqueUsers": 5
  },
  "series": [],
  "rows": {
    "locks": [
      {
        "orderId": "clx123order",
        "lockedAt": "2025-09-15T10:00:00.000Z",
        "unlockedAt": "2025-09-15T11:30:00.000Z",
        "lockedBy": "Jane Smith",
        "unlockedBy": "Jane Smith",
        "durationSec": 5400,
        "durationFormatted": "1h 30m",
        "status": "completed"
      },
      {
        "orderId": "clx456order",
        "lockedAt": "2025-09-20T14:00:00.000Z",
        "unlockedAt": null,
        "lockedBy": "John Doe",
        "unlockedBy": null,
        "durationSec": null,
        "durationFormatted": "Still locked",
        "status": "active"
      }
    ],
    "editAttempts": [
      {
        "userId": "clx123user",
        "userName": "Bob Johnson",
        "attemptCount": 8
      },
      {
        "userId": "clx456user",
        "userName": "Alice Williams",
        "attemptCount": 7
      }
    ]
  }
}
```

---

## Dashboard

### GET /reports/summary

**Query:** None required (uses current date range)

```json
{
  "kpis": {
    "activeOrders": 85,
    "completedOrders": 45,
    "totalRevenue": "$2,500,000",
    "ordersByStage": [
      { "stage": "MANUFACTURING", "count": 25 },
      { "stage": "TESTING", "count": 20 },
      { "stage": "SHIPPING", "count": 15 },
      { "stage": "AT_SEA", "count": 10 },
      { "stage": "SMT", "count": 8 },
      { "stage": "QC", "count": 7 }
    ]
  },
  "meta": {
    "date_from": null,
    "date_to": null,
    "userRole": "ADMIN"
  }
}
```

---

## Notes

- All dates are in ISO 8601 format
- Currency values are numbers (cents/dollars) with formatted strings
- Durations are in seconds with formatted strings
- Pagination is included where applicable
- `debug` parameter adds timing information to responses
- Admin-only endpoints return 403 for non-admin users
