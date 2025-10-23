# Manufacturer Role Implementation

## Overview
This document outlines the implementation of the MANUFACTURER role and access restrictions in the Order Tracker system.

## Role Hierarchy

```
Level 5: SUPER_ADMIN     - Full system access
Level 4: ACCOUNTANT      - Financial management
Level 3: ADMIN           - Standard administration
Level 2: AGENT           - Basic user access
Level 1: MANUFACTURER    - Limited external manufacturer access
```

## Manufacturer Access Restrictions

### ✅ ALLOWED
- **Board View**: Can see ONLY items assigned to their manufacturer profile
- **Item Updates**: Can update measurements on assigned items (even when locked)
- **Stage Updates**: Can update stage status on assigned items
- **Profile Management**: Can change their own password

### ❌ BLOCKED
- **Navigation**: Cannot see Customers, Orders, Reports, Commissions, Users, Manufacturers, Audit
- **Sales Data**: Cannot see yearly sales badge or any revenue information
- **Settings**: Cannot access Report Settings or Commission Settings
- **Notifications**: Currently blocked (may be enabled later for assigned items only)
- **Customer Accounts**: Cannot view, create, edit, or delete customer accounts
- **Orders**: Cannot see orders they're not assigned to
- **Order Creation**: Cannot create new orders
- **Financial Data**: Cannot see pricing or private notes on items
- **Reports**: Cannot access any reports
- **Audit Logs**: Cannot view audit history

## Implementation Details

### Backend Changes

#### 1. Role Helpers (`api/src/utils/roleHelpers.js`)
- Added MANUFACTURER to ROLES enum
- Set hierarchy level to 1 (lowest)
- Added `isManufacturer()` helper function
- Updated `getAssignableRoles()` to include MANUFACTURER

#### 2. Authentication Middleware (`api/src/middleware/auth.js`)
- Added `nonManufacturerGuard` middleware
- Updated `adminGuard` to explicitly block manufacturers
- Modified user fetching to include manufacturer relationship

#### 3. Route Protection (`api/src/index.js`)
Applied `nonManufacturerGuard` to:
- `/reports` - All report endpoints
- `/accounts` - Customer management
- `/audit` - Audit logs
- `/api/reports/sales-by-month` - Sales reports

#### 4. Accounts Route (`api/src/routes/accounts.js`)
- Updated `getAccessibleAccountIds()` to return empty array for manufacturers
- Updated `canAccessAccount()` to return false for manufacturers
- Added explicit manufacturer blocks on GET, POST endpoints

### Frontend Changes

#### 1. Role Utilities (`web/lib/roleUtils.js`)
- Added MANUFACTURER role definition
- Added display name: "Manufacturer"
- Added badge color: Purple (#6b21a8)
- Set hierarchy level to 1
- Added `isManufacturer()` helper

#### 2. Top Navigation (`web/components/TopNav.jsx`)
- Hide navigation items from manufacturers:
  - Customers
  - Orders
  - Reports
  - Commissions
- Hide sales badge from manufacturers
- Hide notifications from manufacturers
- Hide settings options from manufacturers:
  - Report Settings
  - Commission Settings
- Only show Board link for manufacturers

#### 3. User Management (`web/app/admin/users/`)
- Updated UserTable to support MANUFACTURER role display
- Added section headers to separate System Users from Manufacturer Accounts
- Updated page.jsx to filter users into two groups

## Next Steps (To Be Implemented)

### Critical - Orders & Items Filtering
- [ ] Update orders route to filter by manufacturer assignment
- [ ] Update items route to only show assigned items
- [ ] Update board view to only show assigned items
- [ ] Add manufacturer assignment UI for admins

### Optional Enhancements
- [ ] Enable filtered notifications for manufacturers (assigned items only)
- [ ] Add manufacturer dashboard with assigned items summary
- [ ] Add manufacturer-specific reports (their items only)
- [ ] Add measurement history view for manufacturers

## Testing Checklist

### As MANUFACTURER user:
- [ ] Can log in successfully
- [ ] Can only see "Board" in top navigation
- [ ] Cannot see sales badge
- [ ] Cannot access /admin/customers
- [ ] Cannot access /admin/orders
- [ ] Cannot access /admin/reports
- [ ] Cannot access /admin/commissions
- [ ] Cannot see "Report Settings" in dropdown
- [ ] Cannot see "Commission Settings" in dropdown
- [ ] Can change password
- [ ] Can logout

### As ADMIN user:
- [ ] Can create MANUFACTURER role users
- [ ] Can edit MANUFACTURER role users
- [ ] Can see manufacturers in separate table section
- [ ] Can assign manufacturers to order items

## Database Schema

The MANUFACTURER role uses the existing User model with an optional link to the Manufacturer model:

```prisma
model User {
  role              String                  @default("AGENT")
  manufacturer      Manufacturer?           // Link to manufacturer profile
  // ... other fields
}

model Manufacturer {
  id          String      @id @default(cuid())
  name        String      @unique
  userId      String?     @unique
  user        User?       @relation(fields: [userId], references: [id])
  isActive    Boolean     @default(true)
  orderItems  OrderItem[] // Items assigned to this manufacturer
  // ... other fields
}
```

## Deployment Commands

```bash
# Pull changes and restart
cd /var/www/order-tracker && git pull origin aws-deployment && cd api && npx prisma generate && cd .. && rm -rf web/.next && cd web && npm run build && cd .. && pm2 restart all && pm2 logs --lines 30
```

## Modified Files

### Backend
- `api/src/utils/roleHelpers.js` - Added MANUFACTURER role
- `api/src/middleware/auth.js` - Added manufacturer guards
- `api/src/index.js` - Applied guards to routes
- `api/src/routes/accounts.js` - Blocked manufacturer access

### Frontend
- `web/lib/roleUtils.js` - Added MANUFACTURER role
- `web/components/TopNav.jsx` - Hid unauthorized navigation
- `web/app/admin/users/UserTable.jsx` - Added manufacturer support
- `web/app/admin/users/page.jsx` - Separated manufacturer accounts

## Security Considerations

1. **Defense in Depth**: Both frontend and backend enforce restrictions
2. **API Protection**: All sensitive endpoints check role before returning data
3. **Middleware Layering**: Multiple guards ensure comprehensive protection
4. **Data Filtering**: Manufacturers only see data they're explicitly assigned to
5. **Audit Trail**: All manufacturer actions are logged

## Notes

- Manufacturers cannot be sales reps (canBeSalesRep defaults to false)
- Super Admins can manage manufacturer accounts
- Accountants and Admins can create manufacturer accounts
- Manufacturer role is the lowest in the hierarchy
- Future: Implement item-level filtering based on manufacturer assignment