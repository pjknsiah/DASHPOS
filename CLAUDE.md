# CLAUDE.md — POS System Project Requirements



> **Project:** Point of Sale (POS) System for Retail Business
> **Stack:** Web POS — React (Frontend) + Node.js/Express (Backend) + PostgreSQL (Database)
> **Target:** University student capstone / final-year project at production quality

---

## 1. Project Overview

Build a full-featured, web-based Point of Sale system that handles product management, real-time inventory tracking, sales transactions, multiple payment methods, customer loyalty, receipt generation, and business analytics. The system must be multi-role (Admin, Manager, Cashier), secure, and responsive enough to run on both desktop and tablet screens in a retail environment.

---

## 2. Architecture

Use a **three-tier architecture** throughout the project:

```
┌─────────────────────────────────────────────────┐
│  PRESENTATION LAYER (React SPA)                 │
│  Cashier POS Screen · Admin Dashboard ·         │
│  Product Search · Checkout · Reports Viewer      │
├─────────────────────────────────────────────────┤
│  APPLICATION LAYER (Node.js / Express REST API) │
│  Sales Processing · Inventory Control ·          │
│  Payment Handling · Report Generation ·          │
│  Auth & RBAC Middleware                          │
├─────────────────────────────────────────────────┤
│  DATA LAYER (PostgreSQL)                        │
│  Products · Sales · Sales_Items · Customers ·    │
│  Inventory · Payments · Users                    │
└─────────────────────────────────────────────────┘
```

**Key architectural rules:**

- Frontend communicates with Backend exclusively via REST API (JSON).
- No direct database access from the frontend.
- All business logic lives in the Application Layer (Express route handlers / service modules).
- Use environment variables (`.env`) for all secrets, database credentials, and config. Never hard-code secrets.

---

## 3. Tech Stack (Mandatory)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18+ with Vite | Use functional components and hooks only. No class components. |
| Styling | Tailwind CSS | Utility-first. Create a consistent design system (colors, spacing, typography). |
| State Management | React Context + useReducer | For cart state, auth state, and global UI state. Use Zustand only if Context becomes unwieldy. |
| Backend | Node.js 20+ with Express | RESTful API. Use `express-validator` for input validation. |
| ORM / Query | Prisma ORM | Schema-first approach. Use migrations for all schema changes. |
| Database | PostgreSQL 15+ | Use proper indexing, foreign keys, and constraints. |
| Auth | JWT (access + refresh tokens) | Access token: 15 min. Refresh token: 7 days. Store refresh tokens in httpOnly cookies. |
| Password Hashing | bcrypt (cost factor 12) | Never store plaintext passwords. |
| Testing | Vitest (frontend) + Jest/Supertest (backend) | Minimum 70% coverage on backend services. |
| Linting | ESLint + Prettier | Enforce consistent code style across the entire project. |

---

## 4. Database Schema

### 4.1 Required Tables

Implement **all** of the following tables using Prisma schema. Every table must have `created_at` and `updated_at` timestamp columns.

**Users**
- `id` (UUID, PK)
- `username` (unique, not null)
- `email` (unique, not null)
- `password_hash` (not null)
- `full_name` (not null)
- `role` (ENUM: `ADMIN`, `MANAGER`, `CASHIER`)
- `is_active` (boolean, default true)

**Products**
- `id` (UUID, PK)
- `name` (not null)
- `sku` (unique, not null)
- `barcode` (unique, nullable)
- `category_id` (FK → Categories)
- `price` (DECIMAL(10,2), not null, must be >= 0)
- `cost_price` (DECIMAL(10,2), nullable — for profit reporting)
- `quantity` (integer, not null, must be >= 0)
- `low_stock_threshold` (integer, default 10)
- `image_url` (nullable)
- `is_active` (boolean, default true)

**Categories**
- `id` (UUID, PK)
- `name` (unique, not null)
- `description` (nullable)

**Customers**
- `id` (UUID, PK)
- `name` (not null)
- `phone` (unique, nullable)
- `email` (unique, nullable)
- `address` (nullable)
- `loyalty_points` (integer, default 0)

**Sales**
- `id` (UUID, PK)
- `transaction_id` (unique, auto-generated, human-readable, e.g. `TXN-20260319-0001`)
- `user_id` (FK → Users, the cashier)
- `customer_id` (FK → Customers, nullable)
- `subtotal` (DECIMAL(10,2))
- `discount_amount` (DECIMAL(10,2), default 0)
- `tax_amount` (DECIMAL(10,2), default 0)
- `total_amount` (DECIMAL(10,2))
- `payment_method` (ENUM: `CASH`, `MOBILE_MONEY`, `CARD`)
- `payment_status` (ENUM: `COMPLETED`, `REFUNDED`, `PENDING`)
- `notes` (nullable)

**Sale_Items**
- `id` (UUID, PK)
- `sale_id` (FK → Sales)
- `product_id` (FK → Products)
- `quantity` (integer, not null)
- `unit_price` (DECIMAL(10,2) — price at time of sale)
- `discount` (DECIMAL(10,2), default 0)
- `total` (DECIMAL(10,2))

**Payments**
- `id` (UUID, PK)
- `sale_id` (FK → Sales)
- `method` (ENUM: `CASH`, `MOBILE_MONEY`, `CARD`)
- `amount_paid` (DECIMAL(10,2))
- `change_given` (DECIMAL(10,2), default 0)
- `reference` (nullable — for mobile money or card transaction refs)

**Inventory_Log**
- `id` (UUID, PK)
- `product_id` (FK → Products)
- `change_type` (ENUM: `SALE`, `RESTOCK`, `ADJUSTMENT`, `RETURN`)
- `quantity_change` (integer — positive for additions, negative for deductions)
- `previous_quantity` (integer)
- `new_quantity` (integer)
- `user_id` (FK → Users — who made the change)
- `notes` (nullable)

### 4.2 Database Rules

- Use UUIDs for all primary keys (use `gen_random_uuid()` in PostgreSQL).
- Define all foreign key relationships with appropriate `ON DELETE` behavior (e.g., `RESTRICT` for products referenced in sales, `SET NULL` for optional customer on a sale).
- Add database indexes on: `Products.barcode`, `Products.sku`, `Sales.transaction_id`, `Sales.created_at`, `Customers.phone`.
- Use database transactions for all sale operations (creating sale + sale items + payment + inventory deduction must be atomic).
- Seed the database with realistic sample data: at least 50 products across 5+ categories, 3 users (one per role), and 10 sample customers.

---

## 5. Module Specifications

### Module 1: Authentication & Role-Based Access Control

**Endpoints:**
- `POST /api/auth/login` — Authenticate user, return access + refresh tokens
- `POST /api/auth/logout` — Invalidate refresh token
- `POST /api/auth/refresh` — Issue new access token using refresh token
- `GET /api/auth/me` — Return current user profile

**Requirements:**
- Hash passwords with bcrypt (cost factor 12).
- JWT access tokens expire in 15 minutes. Refresh tokens expire in 7 days.
- Implement middleware `authenticate` (verifies JWT) and `authorize(roles[])` (checks user role).
- Role permissions:
  - **ADMIN**: Full access to everything (user management, settings, all reports, all CRUD).
  - **MANAGER**: Product management, inventory management, customer management, view all reports. Cannot manage users.
  - **CASHIER**: POS sales screen, process transactions, view own sales. Cannot access admin/manager panels.
- Lock accounts after 5 failed login attempts (unlock by Admin only).
- Log all authentication events (login, logout, failed attempts) to a separate `auth_log` table.

### Module 2: Product Management

**Endpoints:**
- `GET /api/products` — List products with pagination, search, and category filter
- `GET /api/products/:id` — Get single product
- `POST /api/products` — Create product (ADMIN, MANAGER)
- `PUT /api/products/:id` — Update product (ADMIN, MANAGER)
- `DELETE /api/products/:id` — Soft-delete product (ADMIN only)
- `GET /api/products/barcode/:code` — Lookup product by barcode
- `GET /api/categories` — List categories
- `POST /api/categories` — Create category (ADMIN, MANAGER)

**Requirements:**
- Implement server-side pagination: default 20 items per page, max 100.
- Search must query `name`, `sku`, and `barcode` fields simultaneously.
- Soft-delete products (set `is_active = false`) — never hard-delete products that appear in past sales.
- Validate all inputs: price > 0, quantity >= 0, unique SKU and barcode, non-empty name.
- Support product image upload (store in `/uploads/products/`, serve as static files).

### Module 3: Inventory Management

**Endpoints:**
- `GET /api/inventory` — List all products with stock levels
- `GET /api/inventory/low-stock` — List products below their `low_stock_threshold`
- `POST /api/inventory/adjust` — Manual stock adjustment (ADMIN, MANAGER)
- `POST /api/inventory/restock` — Record restocking (ADMIN, MANAGER)
- `GET /api/inventory/log/:productId` — View inventory change history

**Requirements:**
- Every stock change (sale, restock, manual adjustment, return) must create an `Inventory_Log` entry.
- Automatic stock deduction happens as part of the sale transaction (within the same DB transaction).
- The `/low-stock` endpoint should be usable for dashboard alerts.
- Prevent sales of products with 0 stock (return clear error message to frontend).

### Module 4: Sales Processing (Core POS)

**Endpoints:**
- `POST /api/sales` — Create a new sale (processes the full transaction)
- `GET /api/sales` — List sales with date range filter, pagination
- `GET /api/sales/:id` — Get sale details including items
- `POST /api/sales/:id/refund` — Process full refund (ADMIN, MANAGER)

**Request body for `POST /api/sales`:**
```json
{
  "items": [
    { "product_id": "uuid", "quantity": 2, "discount": 0 }
  ],
  "customer_id": "uuid or null",
  "payment_method": "CASH",
  "amount_paid": 50.00,
  "discount_amount": 5.00,
  "notes": "optional"
}
```

**Requirements:**
- The entire sale operation must be wrapped in a database transaction. If any step fails, the entire transaction rolls back. Steps in order:
  1. Validate all items exist and have sufficient stock.
  2. Calculate subtotal, apply discounts, calculate tax (configurable tax rate, default 0%).
  3. Create `Sales` record.
  4. Create `Sale_Items` records (store `unit_price` at time of sale to preserve history).
  5. Create `Payment` record (calculate change for cash payments).
  6. Deduct stock from `Products` and log to `Inventory_Log`.
- Generate a human-readable `transaction_id` (format: `TXN-YYYYMMDD-NNNN`).
- Return the complete sale object (including items and payment) in the response.
- For refunds: restore stock, create negative inventory log entries, update payment status to `REFUNDED`.

### Module 5: Payment Processing

**Requirements:**
- Support three payment methods: `CASH`, `MOBILE_MONEY`, `CARD`.
- For CASH: calculate and return change (`amount_paid - total_amount`). Reject if `amount_paid < total_amount`.
- For MOBILE_MONEY and CARD: record a `reference` string (transaction reference number). In a real system this would integrate with a payment gateway; for this project, simulate it by accepting a reference string.
- Store all payment records in the `Payments` table linked to the sale.

### Module 6: Customer Management

**Endpoints:**
- `GET /api/customers` — List with search and pagination
- `GET /api/customers/:id` — Get customer with purchase history summary
- `POST /api/customers` — Create customer
- `PUT /api/customers/:id` — Update customer
- `GET /api/customers/:id/purchases` — List customer's purchase history

**Requirements:**
- Loyalty points system: award 1 point per GHS 10 spent (configurable). Points accumulate automatically after each sale.
- Allow associating a customer with a sale at checkout (optional — walk-in customers don't need registration).
- Phone number must be unique if provided.
- Customer purchase history should show date, total, items count, and payment method.

### Module 7: Receipt Generation

**Requirements:**
- Generate a printable receipt after every completed sale.
- Receipt must include: store name and address (configurable), transaction ID, date and time, cashier name, itemized list (product name, quantity, unit price, line total), subtotal, discount (if any), tax (if any), total amount, payment method, amount paid, change given (if cash), and a "Thank you" message.
- Implement as an HTML template rendered on the frontend that can be printed via `window.print()` with proper print CSS (80mm thermal receipt width).
- Also provide a `GET /api/sales/:id/receipt` endpoint that returns receipt data as JSON for re-printing.

### Module 8: Reporting & Analytics

**Endpoints:**
- `GET /api/reports/sales-summary` — Total sales, revenue, transaction count for a date range
- `GET /api/reports/sales-by-day` — Daily sales breakdown (for charts)
- `GET /api/reports/top-products` — Top N selling products by revenue or quantity
- `GET /api/reports/category-performance` — Sales breakdown by product category
- `GET /api/reports/cashier-performance` — Sales per cashier for a date range
- `GET /api/reports/inventory-status` — Current stock levels, low stock items, out of stock items
- `GET /api/reports/profit` — Profit report (requires `cost_price` on products)

**Requirements:**
- All report endpoints accept `start_date` and `end_date` query parameters.
- Use SQL aggregation queries (SUM, COUNT, GROUP BY) — do not load all records into memory and calculate in JavaScript.
- Return data in a format ready for chart rendering (arrays of `{ label, value }` objects).
- Dashboard should display: today's revenue, today's transaction count, low stock alert count, and top 5 products.

---

## 6. Frontend Specifications

### 6.1 Page Structure

**Public Pages:**
- `/login` — Login form.

**Cashier Pages (role: CASHIER, MANAGER, ADMIN):**
- `/pos` — Main POS screen. This is the core of the application. Must include: product search bar (search by name, SKU, or barcode), product grid/list for quick selection, shopping cart panel (add, remove, adjust quantity), discount input, customer selection (optional), payment panel, and receipt preview/print.

**Management Pages (role: MANAGER, ADMIN):**
- `/products` — Product list with CRUD operations.
- `/products/new` — Add product form.
- `/products/:id/edit` — Edit product form.
- `/inventory` — Inventory overview with stock levels and low-stock alerts.
- `/customers` — Customer list and management.
- `/customers/:id` — Customer detail with purchase history.

**Admin Pages (role: ADMIN):**
- `/dashboard` — Analytics dashboard with charts and KPIs.
- `/reports` — Report viewer with date range selection and export.
- `/users` — User management (create, edit, activate/deactivate, reset password).
- `/settings` — Store settings (store name, address, tax rate, loyalty points rate).

### 6.2 POS Screen UX Requirements

The POS screen (`/pos`) is the most critical UI. Build it with these priorities:

1. **Speed**: A cashier must be able to complete a simple transaction (search → add to cart → pay → print receipt) in under 10 seconds using keyboard only.
2. **Keyboard shortcuts**: `F1` = focus search bar, `F2` = go to payment, `F4` = clear cart, `Enter` = confirm action. Display shortcuts as tooltips.
3. **Layout**: Two-panel — left side for product search/selection (≈60% width), right side for cart and payment (≈40% width).
4. **Barcode input**: The search bar should accept barcode scanner input (barcode scanners act as keyboard input ending with Enter). When a barcode match is found, immediately add the product to the cart.
5. **Cart interaction**: Click a cart item to edit quantity or remove. Show running subtotal and total at all times.
6. **Payment flow**: After clicking "Charge" or pressing F2, show a payment modal: select method → enter amount (for cash) or reference (for mobile money/card) → confirm → show receipt.

### 6.3 UI/Design Standards

- Use a clean, professional color scheme (e.g., primary blue `#2563EB`, success green `#16A34A`, danger red `#DC2626`, neutral grays).
- All tables must be paginated with sorting on relevant columns.
- All forms must show inline validation errors.
- Use toast notifications for success/error feedback (e.g., react-hot-toast).
- Loading states: show skeleton loaders for data fetching, spinner for form submissions.
- Responsive: the POS screen must work on a 10" tablet (1024px) and above. Admin pages should work on desktop (1280px+).
- Use consistent spacing, typography, and component patterns throughout.

---

## 7. API Standards

Every API response must follow this consistent format:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Product created successfully"
}
```

**Success with pagination:**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "price", "message": "Price must be greater than 0" }
    ]
  }
}
```

**Additional API rules:**
- Use proper HTTP status codes: 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 422 (Validation Error), 500 (Server Error).
- Use `express-validator` for all input validation on every endpoint.
- Implement rate limiting on auth endpoints (max 10 requests per minute per IP).
- Log all API requests (method, path, status code, response time) using a logging middleware.

---

## 8. Security Requirements

- **Password hashing**: bcrypt with cost factor 12. Never log or return password hashes.
- **JWT**: Sign with a strong secret (min 256-bit). Store refresh tokens in httpOnly, secure, SameSite cookies.
- **Input validation**: Validate and sanitize all user inputs on the server side. Reject unexpected fields.
- **SQL injection**: Prisma ORM handles parameterized queries. Never use raw SQL with string interpolation.
- **XSS**: React escapes output by default. Never use `dangerouslySetInnerHTML` with user input.
- **CORS**: Configure to allow only the frontend origin in production.
- **Audit trail**: Log all destructive operations (delete, refund, stock adjustment) with the user who performed them.
- **Database backups**: Provide a script (`npm run db:backup`) that creates a PostgreSQL dump file with a timestamped filename.

---

## 9. Project Structure

```
pos-system/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # Reusable UI components (Button, Input, Modal, Table, etc.)
│   │   ├── pages/             # Page components matching routes
│   │   ├── layouts/           # Layout wrappers (AuthLayout, DashboardLayout, POSLayout)
│   │   ├── hooks/             # Custom hooks (useAuth, useCart, useProducts, etc.)
│   │   ├── context/           # React Context providers (AuthContext, CartContext)
│   │   ├── services/          # API client functions (api.js + per-module service files)
│   │   ├── utils/             # Helper functions (formatCurrency, formatDate, etc.)
│   │   └── App.jsx            # Root component with routing
│   ├── index.html
│   ├── tailwind.config.js
│   └── package.json
│
├── server/                    # Node.js/Express backend
│   ├── src/
│   │   ├── routes/            # Express route definitions (one file per module)
│   │   ├── controllers/       # Request handlers (one file per module)
│   │   ├── services/          # Business logic (one file per module)
│   │   ├── middleware/        # auth.js, validate.js, errorHandler.js, logger.js
│   │   ├── utils/             # Helpers (generateTransactionId, etc.)
│   │   └── app.js             # Express app setup
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   ├── migrations/        # Prisma migrations
│   │   └── seed.js            # Database seeder
│   ├── .env.example           # Template for environment variables
│   └── package.json
│
├── docs/                      # Documentation
│   ├── API.md                 # API endpoint documentation
│   ├── DATABASE.md            # Schema documentation
│   └── SETUP.md               # Setup instructions
│
├── .gitignore
├── README.md                  # Project overview, setup, and usage
└── CLAUDE.md                  # This file
```

---

## 10. Development Workflow

### Phase 1 — Foundation (Do this first)

1. Initialize the project structure (client + server directories).
2. Set up the Express server with basic middleware (CORS, JSON parsing, error handler, logger).
3. Define the Prisma schema with all tables, relationships, and indexes.
4. Run migrations and seed the database.
5. Implement the Auth module (login, JWT middleware, role middleware).
6. Build the login page on the frontend.
7. Set up protected routing on the frontend (redirect unauthenticated users to `/login`).

### Phase 2 — Core POS

8. Build the Product Management API (full CRUD + barcode lookup).
9. Build the Product Management UI (list, add, edit pages).
10. Build the Sales Processing API (create sale with full transaction).
11. Build the POS screen UI (product search, cart, payment flow).
12. Implement receipt generation (HTML receipt with print CSS).
13. Implement Inventory Management (auto-deduction, manual adjustment, low-stock endpoint).

### Phase 3 — Supporting Features

14. Build Customer Management (CRUD + purchase history + loyalty points).
15. Build Payment Processing logic (cash change calculation, mobile money/card reference).
16. Build the Reporting API (all report endpoints with SQL aggregations).
17. Build the Admin Dashboard UI with charts (use Recharts or Chart.js).
18. Build the Report Viewer UI with date range pickers and data export.

### Phase 4 — Polish & Hardening

19. Add User Management UI (Admin-only: create/edit/deactivate users).
20. Add Settings page (store info, tax rate, loyalty rate).
21. Add comprehensive input validation on all API endpoints.
22. Add loading states, error states, and empty states across all pages.
23. Add keyboard shortcuts to the POS screen.
24. Write backend tests for sales processing and inventory management.
25. Write the `README.md` with setup instructions, screenshots, and feature list.
26. Create the database backup script.

---

## 11. Quality Checklist

Before considering any module complete, verify:

- [ ] All API endpoints return the standard response format (success/error with proper status codes).
- [ ] All inputs are validated on the server side.
- [ ] All database operations that should be atomic use transactions.
- [ ] No passwords, secrets, or tokens are logged or returned in API responses.
- [ ] Role-based access is enforced on every protected endpoint.
- [ ] Frontend shows appropriate loading, error, and empty states.
- [ ] Forms display inline validation errors and prevent submission of invalid data.
- [ ] The POS screen works with keyboard-only operation.
- [ ] All monetary values use DECIMAL(10,2) in the database and are formatted to 2 decimal places in the UI.
- [ ] Product prices in sale records are stored as `unit_price` at time of sale (not looked up from current product price).
- [ ] Stock cannot go negative — the API rejects sales for out-of-stock products.
- [ ] Every stock change creates an `Inventory_Log` entry.
- [ ] The receipt prints correctly at 80mm width.
- [ ] Reports use SQL aggregation, not in-memory calculation.
- [ ] The README includes: project description, tech stack, setup instructions (with prerequisites), environment variable documentation, database setup commands, and at least 3 screenshots.

---

## 12. Non-Functional Requirements

- **Performance**: API response time < 200ms for standard CRUD operations. Sales processing < 500ms.
- **Error handling**: Global error handler in Express catches all unhandled errors and returns a structured error response. Frontend has an error boundary at the app level.
- **Code quality**: No `any` types if using TypeScript. No `console.log` left in production code — use a proper logger (e.g., `winston` or `pino`). No commented-out code in final submission.
- **Git**: Use meaningful commit messages. Commit after each completed feature (not one giant commit at the end).
- **Environment**: All configuration via `.env` file. Provide a `.env.example` with all required variables documented.

---

## 13. Currency & Locale

- Default currency: **GHS (Ghana Cedis)** with symbol `GH₵`.
- Format: `GH₵ 1,234.56` (comma thousands separator, dot decimal).
- Create a `formatCurrency(amount)` utility function used consistently throughout the frontend.
- The currency symbol should be configurable in settings for reuse in other locales.

---

## 14. Sample Seed Data Requirements

The database seeder (`prisma/seed.js`) must create:

- **3 Users**: one Admin (`admin / admin123`), one Manager (`manager / manager123`), one Cashier (`cashier / cashier123`). Hash all passwords.
- **6 Categories**: Beverages, Snacks, Dairy, Household, Personal Care, Stationery.
- **50+ Products**: Realistic product names, prices in GHS (range: GH₵ 1.00 to GH₵ 500.00), varied quantities (0 to 200), barcodes (13-digit EAN format), distributed across all categories.
- **10 Customers**: Realistic Ghanaian names, phone numbers (format: `0XX-XXX-XXXX`), emails, varied loyalty points.
- **20 Sample Sales**: Spread over the past 30 days with realistic items and payment methods, to populate reports and dashboard on first load.

---

## 15. Key Reminders for Claude Code

- **Always run `npx prisma migrate dev` after schema changes.** Never manually edit the database.
- **Use `npx prisma db seed` to populate test data** after migrations.
- **Test the complete sale flow end-to-end** after any change to sales, inventory, or payment logic.
- **Do not skip error handling.** Every API endpoint must have try-catch and return structured errors.
- **Do not use `alert()` or `confirm()` in the frontend.** Use toast notifications and modal dialogs.
- **Format all monetary values consistently** using the `formatCurrency` utility.
- **When in doubt about a requirement, re-read this document.** It is the single source of truth.
