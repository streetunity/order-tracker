# Manufacturing Tracker System - Technical White Paper
## Project Overview & Architecture Documentation

### Executive Summary
The Manufacturing Tracker is a full-stack web application for managing manufacturing orders through various production stages. It provides role-based access control, real-time order tracking, comprehensive audit logging, and customer relationship management.

---

## 1. Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Runtime**: React 18
- **Styling**: Custom CSS with CSS variables (dark theme)
- **Authentication**: JWT tokens stored in localStorage
- **State Management**: React useState hooks, Context API for auth
- **Routing**: Next.js App Router with dynamic routes

### Backend
- **Runtime**: Node.js with Express.js
- **Database**: SQLite with Prisma ORM
- **Authentication**: JWT (jsonwebtoken) with bcrypt for password hashing
- **API Design**: RESTful with JSON responses
- **CORS**: Configured for localhost:3000 (frontend)

### Infrastructure
- **Frontend Port**: 3000
- **Backend Port**: 4000
- **Database**: SQLite file (`/api/prisma/dev.db`)
- **Package Manager**: npm

---

## 2. Complete File Structure

```
manufacturing-tracker/
├── api/                          # Backend Express server
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema
│   │   ├── dev.db              # SQLite database
│   │   ├── migrations/         # Database migrations
│   │   └── seed.js            # Database seeding script
│   ├── src/
│   │   ├── index.js           # Main Express server
│   │   ├── state.js           # Stage management logic
│   │   ├── rateLimit.js       # Rate limiting config
│   │   ├── middleware/
│   │   │   └── auth.js        # JWT authentication
│   │   └── utils/
│   │       └── password.js    # Password hashing utilities
│   ├── package.json
│   └── .env                   # Environment variables
│
└── web/                       # Frontend Next.js application
    ├── app/
    │   ├── admin/
    │   │   ├── board/
    │   │   │   ├── page.jsx   # Main kanban board
    │   │   │   └── board.css  # Board-specific styles
    │   │   ├── customers/
    │   │   │   ├── page.jsx   # Customer management
    │   │   │   └── new/
    │   │   │       └── page.jsx
    │   │   ├── orders/
    │   │   │   ├── page.jsx   # Order management
    │   │   │   ├── new/
    │   │   │   │   └── page.jsx
    │   │   │   └── [id]/
    │   │   │       └── page.jsx
    │   │   ├── users/
    │   │   │   └── page.jsx   # User management (admin only)
    │   │   └── kiosk/
    │   │       └── page.jsx   # Display board view
    │   ├── api/                  # Next.js API routes (proxies)
    │   │   ├── accounts/
    │   │   ├── orders/
    │   │   ├── users/
    │   │   └── auth/
    │   ├── history/
    │   │   └── page.jsx       # Audit history viewer
    │   ├── login/
    │   │   └── page.jsx       # Login page
    │   ├── t/
    │   │   └── [token]/
    │   │       └── page.jsx   # Public tracking page
    │   ├── layout.jsx         # Root layout
    │   └── globals.css        # Global styles
    ├── contexts/
    │   └── AuthContext.jsx    # Authentication context
    ├── package.json
    └── next.config.js
```

---

## 3. Database Schema

### Core Models
- **Account**: Customer records with contact info and machine voltage
- **Order**: Manufacturing orders linked to accounts
- **OrderItem**: Individual items within orders
- **User**: System users with role-based access (ADMIN/AGENT)
- **AuditLog**: Flexible audit logging for all entities
- **OrderStatusEvent**: Order stage change history
- **OrderItemStatusEvent**: Item-level stage change history

### Key Relationships
- Orders belong to Accounts (many-to-one)
- Orders have many OrderItems
- All entities can have AuditLog entries
- Users can lock/unlock orders (with restrictions)

---

## 4. Critical Lessons Learned & Mistakes to Avoid

### 4.1 Database & ORM Issues

**Problem**: Foreign key constraints in audit logs
- **Issue**: Original `OrderAuditLog` table had foreign key to Order table, preventing logging of Account/User changes
- **Solution**: Created flexible `AuditLog` table without strict foreign key constraints
- **Lesson**: Design audit systems to be entity-agnostic from the start

**Problem**: SQLite doesn't support JSON fields in Prisma
- **Issue**: Tried to use `Json` type for audit log data
- **Solution**: Use `String` type and manually JSON.stringify/parse
- **Lesson**: Always check database provider limitations

### 4.2 Authentication & Security

**Problem**: Token expiration and validation
- **Issue**: Frontend doesn't gracefully handle expired tokens
- **Solution**: Implement token refresh or clear logout flow
- **Future**: Add refresh token mechanism

**Problem**: Missing auth checks on some routes
- **Issue**: Some API endpoints initially lacked proper authentication
- **Solution**: Systematic auth middleware application
- **Lesson**: Apply auth middleware consistently from the start

### 4.3 File Organization & Imports

**Problem**: Mixed file content during copy/paste
- **Issue**: Multiple files accidentally combined into single files
- **Solution**: Careful file separation and validation
- **Lesson**: Always verify complete file replacement, check for file separators

**Problem**: CSS class conflicts
- **Issue**: Global CSS classes conflicting with inline styles
- **Solution**: Consistent use of either CSS classes OR inline styles
- **Lesson**: Choose one styling approach and stick to it

### 4.4 API Proxy Configuration

**Problem**: Direct backend calls from frontend
- **Issue**: CORS issues, exposed backend URL
- **Solution**: Next.js API routes as proxy layer
- **Structure**: `/web/app/api/[entity]/route.js` proxies to backend

### 4.5 State Management

**Problem**: Stale data after mutations
- **Issue**: UI not updating after create/update/delete operations
- **Solution**: Consistent data refetching after mutations
- **Lesson**: Always reload data after mutations

---

## 5. System Limitations & Considerations

### 5.1 Database Limitations
- **SQLite**: Not suitable for high concurrency in production
- **No real-time updates**: Requires polling or manual refresh
- **Migration complexity**: SQLite has limited ALTER TABLE support
- **File-based**: Database corruption risk with improper shutdowns

### 5.2 Authentication Limitations
- **No refresh tokens**: Users must re-login when token expires
- **localStorage**: Vulnerable to XSS attacks
- **No session management**: Can't revoke active sessions
- **Single-factor**: No 2FA implementation

### 5.3 Scalability Limitations
- **No caching layer**: Every request hits database
- **No pagination on board view**: Performance issues with many orders
- **No background jobs**: All processing is synchronous
- **Single server**: No load balancing or redundancy

### 5.4 UI/UX Limitations
- **No real-time updates**: Manual refresh required
- **Limited mobile responsiveness**: Desktop-first design
- **No drag-and-drop**: Stage changes require button clicks
- **Basic search**: No advanced filtering options

---

## 6. Production Stage Flow

```
MANUFACTURING → POWDER COATING → SANDING → PAINTING → 
PACKING → READY TO SHIP → SHIPPED → DELIVERED → COMPLETED
```

**Rules**:
- Sequential progression (no skipping stages normally)
- Fast-forward allowed with explicit permission
- Backward moves allowed for corrections
- Items can progress independently of orders

---

## 7. API Endpoints Summary

### Authentication
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout

### Orders
- `GET /orders` - List all orders
- `POST /orders` - Create order
- `PATCH /orders/:id` - Update order
- `DELETE /orders/:id` - Delete order
- `POST /orders/:id/lock` - Lock order
- `POST /orders/:id/unlock` - Unlock order (admin only)

### Accounts
- `GET /accounts` - List accounts
- `POST /accounts` - Create account
- `PATCH /accounts/:id` - Update account
- `DELETE /accounts/:id` - Delete account

### Audit
- `GET /comprehensive-audit/:entityId` - Get audit logs for any entity

---

## 8. Critical Implementation Details

### 8.1 Audit Logging System
```javascript
// Flexible audit log structure
{
  entityType: "Order|Account|User|OrderItem",
  entityId: "cuid",
  parentEntityId: "optional parent reference",
  action: "CREATED|UPDATED|DELETED|LOCKED",
  changes: JSON.stringify([{field, oldValue, newValue}]),
  metadata: JSON.stringify({additional data}),
  performedByUserId: "user cuid",
  performedByName: "cached username"
}
```

### 8.2 Authentication Flow
1. User submits credentials to `/auth/login`
2. Backend validates and returns JWT token
3. Frontend stores token in localStorage
4. All API requests include `Authorization: Bearer {token}`
5. Backend validates token on each request

### 8.3 Lock/Unlock Mechanism
- Any user can lock an order
- Only ADMIN users can unlock
- Unlock requires reason (min 10 characters)
- Locked orders prevent most modifications
- Archive/restore allowed even when locked

---

## 9. Quick Start Commands

### Development Setup
```bash
# Backend
cd api
npm install
npx prisma generate
npx prisma migrate dev
node prisma/seed.js  # Create default users
npm run dev

# Frontend (new terminal)
cd web
npm install
npm run dev
```

### Database Reset
```bash
cd api
rm prisma/dev.db
npx prisma migrate dev
node prisma/seed.js
```

### Default Credentials
- Admin: `admin@stealthmachinetools.com` / `admin123`
- Agent: `john@stealthmachinetools.com` / `agent123`

---

## 10. Common Troubleshooting

### "Invalid credentials" on login
- Run seed script: `node prisma/seed.js`
- Check if users exist in database: `npx prisma studio`

### 500 errors on API calls
- Check if backend is running on port 4000
- Verify proxy routes exist in `/web/app/api/`
- Check for foreign key constraint errors in backend logs

### Changes not saving
- Check browser console for errors
- Verify authentication token is valid
- Check if order is locked
- Look for validation errors in backend logs

### CSS/Styling issues
- Clear browser cache
- Check for conflicting global styles
- Verify CSS file imports in components

---

## 11. Future Improvements Roadmap

### High Priority
1. Implement refresh token mechanism
2. Add WebSocket for real-time updates
3. Implement proper pagination
4. Add comprehensive error handling
5. Improve mobile responsiveness

### Medium Priority
1. Add export functionality (CSV/PDF)
2. Implement advanced search/filtering
3. Add bulk operations
4. Create dashboard with analytics
5. Implement email notifications

### Low Priority
1. Add drag-and-drop for stage changes
2. Implement dark/light theme toggle
3. Add customizable stage definitions
4. Create API documentation (Swagger)
5. Add integration tests

---

## 12. Security Considerations

### Current Security Measures
- Password hashing with bcrypt
- JWT authentication
- Role-based access control
- SQL injection prevention (Prisma ORM)
- CORS configuration

### Security Gaps to Address
- No rate limiting on login attempts
- localStorage vulnerable to XSS
- No HTTPS enforcement
- No audit log for failed login attempts
- No password complexity requirements
- No session timeout
- No CSRF protection

---

## Conclusion

This Manufacturing Tracker system provides a solid foundation for order management with comprehensive audit logging and role-based access control. The main architectural decisions (Next.js + Express + Prisma + SQLite) provide good developer experience for a small-to-medium scale application but would need infrastructure changes for high-scale production use.

Key strengths include the flexible audit system, clear separation of concerns, and comprehensive stage tracking. Main areas for improvement include real-time updates, better error handling, and enhanced security measures.

When continuing development, prioritize maintaining consistency in styling approaches, ensuring proper error handling, and keeping the audit log system flexible for future entity types.
