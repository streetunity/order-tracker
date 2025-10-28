# Order Tracker - Migration & Changes Guide

## Overview of Major Changes

This document outlines all the significant changes and updates made to the Order Tracker system since the original documentation was created. Use this as a reference when working with the updated system.

## Backend Architecture Changes

### From Monolithic to Modular (MAJOR CHANGE)

**Before:**
- Single massive `index.js` file (~2,500 lines / 76KB)
- All routes defined in one file
- GitHub API would truncate the file when editing (critical issue)
- Required dangerous manual server-side editing

**After:**
- Main `index.js` reduced to ~330 lines
- Routes organized into 17+ logical modules in `/api/src/routes/`
- Each module handles specific domain
- ALL files safe to edit through GitHub API (no truncation risk)
- No more server-side editing needed

### New Route Modules Added

The following route modules have been added since the original documentation:

1. **manufacturers.js** - Complete manufacturer management system
2. **notifications.js** - Notification and alert system
3. **reportsComplete.js** - Completion tracking reports
4. **rateLimit.js** - Rate limiting configuration
5. **state.js** - Server-side state management

## Database Schema Expansions

### New Models Added

1. **Manufacturer Model**
   - Links manufacturers to user accounts
   - Tracks manufacturer assignments to items
   - Enables manufacturer portal access

2. **AuditLog Model**
   - Flexible audit logging for any entity type
   - Tracks all CRUD operations
   - Stores change history with metadata

3. **MeasurementAuditLog Model**
   - Specific tracking for dimension/weight changes
   - Per-field change history
   - Links changes to users and timestamps

4. **StageThreshold Model**
   - Configurable warning/critical day thresholds
   - Per-stage configuration
   - Used for operational alerts

5. **SystemSetting Model**
   - Global configuration storage
   - Key-value pairs for system-wide settings
   - Holiday seasons, business rules, etc.

6. **Notification Model**
   - User-specific notifications
   - Multiple types and categories
   - Priority levels and expiration
   - Read/dismiss tracking

### Enhanced Existing Models

**Order Model:**
- Added `orderDate` field for actual customer order date
- Added `onsiteInstallationDate` for installation tracking
- Added `discount` field for order-level discounts

**OrderItem Model:**
- Added `manufacturerId` linking to Manufacturer model
- Added `isOrdered`, `orderedAt`, `orderedBy` for procurement tracking
- Added `hasExtendedShipping` flag
- Added `containers` field (JSON) for multi-container support
- Added complete measurement fields with units
- Added `measuredAt` and `measuredBy` tracking

**User Model:**
- Added `canBeSalesRep` flag to control dropdown appearance
- Added `manufacturer` relation for manufacturer accounts
- New role: "MANUFACTURER" for limited access

## Frontend Additions

### New Admin Pages

The following admin sections have been added:

1. **`/admin/change-password`** - Password management
2. **`/admin/commission-settings`** - Commission configuration
3. **`/admin/commissions`** - Commission tracking and reports
4. **`/admin/customers`** - Customer account management
5. **`/admin/kiosk`** - Kiosk display mode
6. **`/admin/manufacturers`** - Manufacturer management
7. **`/admin/notifications`** - Notification center
8. **`/admin/profile`** - User profile management
9. **`/admin/reports`** - Comprehensive reporting section
10. **`/admin/settings`** - System configuration
11. **`/admin/users`** - User management

### New App Sections

1. **`/history`** - Order history tracking
2. **`/config`** - Frontend configuration
3. **`/api`** - API route handlers

## Feature Implementations

### Manufacturer System

**New Capabilities:**
- Manufacturer user accounts with restricted access
- Item assignment to specific manufacturers
- Manufacturer portal with filtered views
- Measurement update capabilities for manufacturers
- Audit trail of manufacturer actions

**Access Restrictions:**
- Manufacturers cannot see pricing
- Cannot access reports
- Cannot lock/unlock orders
- Can only see assigned items
- Can update measurements and ordered status

### Notification System

**Features:**
- Real-time notification generation
- Multiple notification types:
  - Commission notifications
  - Order delays
  - Stage warnings/critical
  - System alerts
- Priority levels (LOW, NORMAL, HIGH, CRITICAL)
- Automatic expiration
- Read/dismiss tracking
- Role-based notification filtering

### Commission System

**Components:**
- Commission rate configuration
- Automatic commission calculation
- Commission reports by period
- Commission notifications
- Integration with order completion

### Enhanced Audit System

**Improvements:**
- Entity-agnostic audit logging
- Comprehensive change tracking
- Measurement-specific audit trails
- User action attribution
- Searchable audit history
- Metadata storage for context

### Multi-Container Shipping

**Implementation:**
- JSON-based container storage
- Multiple containers per item
- Container dimension tracking
- Weight distribution
- Shipping method per container

## API Changes

### New API Endpoints

**Manufacturer Management:**
- `GET/POST /manufacturers`
- `PUT/DELETE /manufacturers/:id`
- `GET /manufacturers/:id/items`

**Notifications:**
- `GET /notifications`
- `PUT /notifications/:id/read`
- `PUT /notifications/:id/dismiss`
- `POST /notifications/dismiss-all`

**Enhanced Reports:**
- `/reports/completion`
- `/reports/commission`
- `/reports/manufacturer-performance`

**System Settings:**
- `GET/PUT /settings/stage-thresholds`
- `GET/PUT /settings/system`
- `GET/PUT /settings/commission-rates`

### Modified Endpoints

**Orders:**
- Now filters based on user role
- Manufacturers see only assigned items
- Added discount handling

**Items:**
- Added manufacturer assignment
- Enhanced measurement updates
- Container management endpoints
- Ordered status management

## Security Enhancements

### Role-Based Access Control (RBAC)

**New Guards:**
- `nonManufacturerGuard` - Blocks manufacturer access
- Role-specific filtering in all endpoints
- Manufacturer-specific data isolation

### Audit Trail Security

- All critical actions logged
- User attribution required
- IP tracking capability
- Timestamp integrity

### Rate Limiting

- Implemented on public endpoints
- Configurable limits per endpoint
- DDoS protection

## Configuration Changes

### Environment Variables

**New Variables:**
- Commission-related settings
- Notification service configuration
- Manufacturer portal settings
- Audit retention policies

### System Settings

Now stored in database:
- Holiday season dates
- Business hours
- Default thresholds
- Commission rates
- Notification preferences

## Operational Improvements

### Performance Optimizations

- Modular loading reduces memory footprint
- Lazy loading of route modules
- Optimized database queries
- Caching strategies implemented

### Maintenance Benefits

- Easier to locate and modify code
- Reduced merge conflicts
- Clearer separation of concerns
- Simplified testing

### Deployment Improvements

- No more file truncation issues
- Safe GitHub-based editing
- Automated migration handling
- Better error recovery

## Breaking Changes

### API Response Format

Some endpoints now return different formats:
- Reports include additional metadata
- Manufacturer filtering affects response structure
- Notification system adds new fields

### Authentication

- Manufacturer role requires special handling
- New permission checks throughout
- Session management updated

### Database Migrations

Required migrations for:
- New models
- Field additions
- Index optimizations
- Constraint updates

## Migration Checklist

When updating from old system:

1. **Database Migration**
   - [ ] Run all pending migrations
   - [ ] Regenerate Prisma client
   - [ ] Verify schema integrity

2. **Configuration Updates**
   - [ ] Update environment variables
   - [ ] Configure system settings
   - [ ] Set stage thresholds

3. **User Management**
   - [ ] Create manufacturer accounts
   - [ ] Update user roles
   - [ ] Set commission rates

4. **Frontend Build**
   - [ ] Clear .next cache
   - [ ] Rebuild application
   - [ ] Test all new pages

5. **Testing**
   - [ ] Verify manufacturer access
   - [ ] Test notification system
   - [ ] Validate reports
   - [ ] Check audit logging

## Removed/Deprecated Features

### Removed Files
- Old monolithic index.js backup files
- Temporary patch files
- Legacy migration scripts

### Deprecated Fields
- Some fields repurposed (e.g., `sku` for sales rep)
- Legacy field names maintained for compatibility

### Changed Behaviors
- Order date now uses `orderDate` field instead of `createdAt`
- Sales reports use actual order dates
- Commission calculation methodology updated

## Best Practices Going Forward

### Code Organization
- Always add new endpoints to appropriate modules
- Keep index.js under 500 lines
- Use route factories pattern
- Maintain clear module boundaries

### Database Changes
- Always create migrations
- Document schema changes
- Update related modules
- Test rollback procedures

### Security
- Implement proper guards
- Audit sensitive operations
- Validate manufacturer restrictions
- Regular security reviews

### Performance
- Monitor module sizes
- Optimize database queries
- Implement caching where appropriate
- Regular performance audits

## Support & Resources

### Documentation
- Main documentation: order-tracker-documentation-2025.md
- API documentation: Generated from route modules
- Schema documentation: In schema.prisma comments

### Troubleshooting
- Check PM2 logs for errors
- Verify database migrations
- Clear caches if display issues
- Review audit logs for issues

### Contact
- GitHub repository for issues
- Internal team channels
- Documentation updates via PRs

---

*Migration Guide Version: 1.0*
*Created: November 2025*
*Status: Current*