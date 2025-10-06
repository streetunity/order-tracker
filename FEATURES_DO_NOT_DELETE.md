# Order Tracker - Current Features Documentation

## System Overview
The Order Tracker is a comprehensive order management system with real-time tracking, customer portals, and administrative controls. Built with Next.js (frontend) and Node.js/Express (backend), using Prisma ORM with SQLite database.

## Core Features

### 1. Order Management System

#### Order Creation & Editing
- **Multi-item orders**: Each order can contain multiple items with individual tracking
- **Customer information**: Name, email, phone, delivery address
- **Order metadata**: 
  - Automatic order number generation
  - Creation and update timestamps
  - Archive/restore functionality
  - Order locking mechanism

#### Item-Level Features
- **Individual item tracking**: Each item has its own status
- **Item fields**:
  - Item name and description
  - Quantity
  - Status (multiple stages)
  - Price (admin-only)
  - Private notes (admin-only)
  - Customer documentation links
  - Physical measurements (height, width, length, weight, units)
  - Laser wattage settings
  - ETA dates

### 2. Status Management

#### Available Statuses
- QUOTE
- APPROVED
- ORDERED
- PRODUCTION
- READY
- SHIPPED
- DELIVERED
- CANCELLED

#### Status Features
- Visual color coding for each status
- Automatic progression tracking
- Status update timestamps
- Bulk status updates
- Status filtering on board view

### 3. Customer Portal

#### Public Tracking Page (`/t/[token]`)
- Unique token-based access (no login required)
- Real-time order status viewing
- Item-by-item status display
- Delivery information
- Mobile-responsive design
- Auto-refresh capability

### 4. Administrative Dashboard

#### Board View (`/admin/board`)
- Real-time order status board
- Filter by status
- Quick status updates
- Visual indicators for:
  - Locked orders
  - Archived orders
  - Orders with ETAs
- Search functionality
- Bulk operations

#### Kiosk Mode
- Full-screen display option
- Auto-refresh
- Optimized for wall displays
- Status summary statistics

### 5. Order Locking System

#### Lock Mechanism
- Prevents accidental edits
- Visual lock indicators
- Admin override capabilities

#### Admin-Only Fields (Editable Even When Locked)
- `itemPrice` - Pricing information
- `privateItemNote` - Internal notes
- `height`, `width`, `length`, `weight`, `units` - Physical measurements
- `archivedAt` - Archive/restore status
- `customerDocsLink` - Documentation links
- `laserWattage` - Equipment settings

### 6. Reporting System

#### Available Reports
- **Daily Revenue**: Today's sales summary
- **Weekly Revenue**: Current week analysis
- **Monthly Revenue**: Current month overview
- **Yearly Revenue**: Annual performance
- **Custom Date Range**: Flexible reporting periods

#### Report Metrics
- Total revenue
- Order count
- Average ticket value
- Status distribution
- Top items by revenue
- Customer analytics

#### Report Access
- RESTful API endpoints
- JSON format responses
- Authentication required
- Real-time data

### 7. Authentication & Security

#### JWT-Based Authentication
- Secure token generation
- Token expiration handling
- Protected API endpoints
- Role-based access (Admin/User)

#### Security Features
- Password hashing (bcrypt)
- CORS configuration
- Environment variable protection
- SQL injection prevention (Prisma ORM)

### 8. Archive System

#### Archive Features
- Soft delete functionality
- Archive/restore capabilities
- Hidden from main board view
- Preserved in database
- Searchable archive

### 9. Search & Filter

#### Search Capabilities
- Order number search
- Customer name search
- Email search
- Phone number search
- Item name search
- Status filtering
- Date range filtering

### 10. Measurement System

#### Supported Measurements
- **Dimensions**: Height, Width, Length
- **Weight**: With unit selection
- **Units**: 
  - Imperial (inches, lbs)
  - Metric (cm, kg)
- **Laser Settings**: Wattage configuration

### 11. ETA Management

#### ETA Features
- Item-level ETA dates
- Visual indicators for overdue items
- ETA-based sorting
- Backfill capabilities for existing orders

### 12. Notification System (Planned)

#### Email Notifications
- Order confirmation
- Status updates
- Delivery notifications
- Admin alerts

### 13. API Endpoints

#### Order Management
- `GET /api/orders` - List all orders
- `GET /api/orders/:id` - Get single order
- `POST /api/orders` - Create order
- `PATCH /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete order
- `POST /api/orders/:id/archive` - Archive order
- `POST /api/orders/:id/restore` - Restore order

#### Item Management
- `PATCH /api/orders/:orderId/items/:itemId` - Update item
- `DELETE /api/orders/:orderId/items/:itemId` - Delete item

#### Reporting
- `GET /api/reports/daily` - Daily report
- `GET /api/reports/weekly` - Weekly report
- `GET /api/reports/monthly` - Monthly report
- `GET /api/reports/yearly` - Yearly report
- `GET /api/reports/custom` - Custom date range

#### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/verify` - Verify token

#### Public Tracking
- `GET /api/track/:token` - Get order by tracking token

### 14. User Interface Features

#### Responsive Design
- Mobile-first approach
- Tablet optimization
- Desktop layouts
- Touch-friendly controls

#### Dark Mode
- System-wide dark theme
- Reduced eye strain
- OLED-friendly colors

#### Real-time Updates
- WebSocket connections (planned)
- Auto-refresh options
- Live status changes

### 15. Data Export (Planned)

#### Export Formats
- CSV export
- PDF reports
- Excel compatibility
- JSON data dumps

### 16. Backup System

#### Database Backups
- SQLite file backups
- Automated scheduling (planned)
- Version control integration

### 17. Performance Features

#### Optimization
- Next.js static generation
- API response caching
- Database query optimization
- Image optimization
- Code splitting

### 18. Development Features

#### Developer Tools
- Hot reload
- Debug mode
- API documentation
- Error logging
- Performance monitoring

## Technology Stack

### Frontend
- **Framework**: Next.js 14
- **Styling**: Tailwind CSS
- **State Management**: React Context
- **HTTP Client**: Fetch API
- **Authentication**: JWT tokens

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: SQLite
- **Authentication**: JWT/bcrypt

### Deployment
- **Server**: AWS EC2
- **Process Manager**: PM2
- **Reverse Proxy**: Nginx (optional)
- **Version Control**: Git/GitHub

## Environment Variables

### Backend (.env)
- `DATABASE_URL` - Database connection
- `JWT_SECRET` - Token signing secret
- `PORT` - Server port (3001)
- `NODE_ENV` - Environment mode

### Frontend (.env.local)
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_APP_URL` - Frontend URL

## Browser Support
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## Known Limitations
1. SQLite database (not suitable for very high traffic)
2. Single server deployment (no load balancing)
3. No real-time WebSocket updates (yet)
4. Manual backup process

## Upcoming Features
1. Email notifications
2. WebSocket real-time updates
3. Advanced analytics dashboard
4. Multi-language support
5. Customer self-service portal
6. Invoice generation
7. Payment integration
8. Mobile app

## Version History
- **v2.0** - Current version with all features listed above
- **v1.0** - Initial release with basic order management

Last Updated: October 2025
