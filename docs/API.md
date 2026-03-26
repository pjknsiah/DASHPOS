# API Reference

Base URL: `http://localhost:3001/api`

All endpoints (except `/auth/login`) require a valid JWT access token in the `Authorization: Bearer <token>` header.

---

## Standard Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Action completed"
}
```

**Success with pagination:**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": { "page": 1, "per_page": 20, "total": 150, "total_pages": 8 }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "field": "price", "message": "Price must be greater than 0" }]
  }
}
```

---

## Authentication

### POST /api/auth/login
Authenticate and receive tokens.

**Body:**
```json
{ "username": "admin", "password": "admin123" }
```

**Response:** `200`
```json
{
  "data": {
    "accessToken": "<jwt>",
    "user": { "id": "...", "username": "admin", "role": "ADMIN", "full_name": "..." }
  }
}
```
Refresh token is set as `httpOnly` cookie.

---

### POST /api/auth/logout
Invalidate the current refresh token.

**Auth required:** Yes

---

### POST /api/auth/refresh
Exchange the refresh token cookie for a new access token.

**Response:** `200` `{ "data": { "accessToken": "..." } }`

---

### GET /api/auth/me
Get the current authenticated user's profile.

**Response:** `200` `{ "data": { "id": "...", "username": "...", "role": "...", ... } }`

---

## Products

### GET /api/products
List products with pagination, search, and category filter.

**Query params:** `page`, `per_page` (max 100), `search`, `category_id`

### GET /api/products/:id
Get a single product by UUID.

### POST /api/products
Create a product. **Roles:** ADMIN, MANAGER

**Body:**
```json
{
  "name": "Milo 400g",
  "sku": "MLO-400",
  "barcode": "6001255001234",
  "category_id": "uuid",
  "price": 12.50,
  "cost_price": 9.00,
  "quantity": 50,
  "low_stock_threshold": 10
}
```

### PUT /api/products/:id
Update a product. **Roles:** ADMIN, MANAGER

### DELETE /api/products/:id
Soft-delete a product (sets `is_active = false`). **Roles:** ADMIN only

### GET /api/products/barcode/:code
Lookup a product by barcode — used by barcode scanner on POS screen.

---

## Categories

### GET /api/categories
List all categories.

### POST /api/categories
Create a category. **Roles:** ADMIN, MANAGER

**Body:** `{ "name": "Beverages", "description": "..." }`

---

## Inventory

### GET /api/inventory
List all products with stock levels. **Query params:** `page`, `per_page`, `search`, `status` (`out` = out-of-stock only)

### GET /api/inventory/low-stock
List products at or below their `low_stock_threshold`.

### POST /api/inventory/restock
Add stock to a product. **Roles:** ADMIN, MANAGER

**Body:** `{ "product_id": "uuid", "quantity": 50, "notes": "Supplier delivery" }`

### POST /api/inventory/adjust
Manual stock adjustment (positive or negative). **Roles:** ADMIN, MANAGER

**Body:** `{ "product_id": "uuid", "quantity_change": -3, "notes": "Damaged items" }`

### GET /api/inventory/log/:productId
View inventory change history for a product. **Query params:** `page`, `per_page`

---

## Sales

### POST /api/sales
Process a complete sale transaction.

**Body:**
```json
{
  "items": [
    { "product_id": "uuid", "quantity": 2, "discount": 0 }
  ],
  "customer_id": "uuid or null",
  "payment_method": "CASH",
  "amount_paid": 50.00,
  "discount_amount": 5.00,
  "notes": "optional",
  "reference": "MOMO-REF-001"
}
```

**Response:** `201` — complete sale object with items and payment.

### GET /api/sales
List sales. **Query params:** `page`, `per_page`, `start_date`, `end_date`

### GET /api/sales/:id
Get full sale details including items, payment, cashier, and customer.

### GET /api/sales/:id/receipt
Get receipt data as JSON for re-printing.

**Response:**
```json
{
  "data": {
    "store": { "name": "...", "address": "...", "phone": "..." },
    "sale": { ... }
  }
}
```

### POST /api/sales/:id/refund
Process a full refund. Restores stock, creates RETURN inventory log. **Roles:** ADMIN, MANAGER

---

## Customers

### GET /api/customers
List customers. **Query params:** `page`, `per_page`, `search`

### POST /api/customers
Create a customer.

**Body:** `{ "name": "Kwame Asante", "phone": "024-555-0001", "email": "kwame@example.com", "address": "..." }`

### GET /api/customers/:id
Get customer with loyalty points and summary stats.

### PUT /api/customers/:id
Update customer details.

### GET /api/customers/:id/purchases
Get paginated purchase history for a customer.

---

## Reports

All report endpoints accept `start_date` and `end_date` query parameters (ISO date format: `YYYY-MM-DD`). **Roles:** ADMIN

### GET /api/reports/sales-summary
Total revenue, transaction count, average transaction value, total items sold.

### GET /api/reports/sales-by-day
Daily sales breakdown. Returns `[{ label: "2026-03-01", value: 450.00 }, ...]`.

### GET /api/reports/top-products
Top selling products. **Query params:** `limit` (default 10), `by` (`revenue` or `quantity`)

### GET /api/reports/category-performance
Sales revenue and transaction count per category.

### GET /api/reports/cashier-performance
Sales per cashier.

### GET /api/reports/inventory-status
Current stock summary: total products, low stock count, out of stock count.

### GET /api/reports/profit
Profit report using `cost_price` on products.

---

## Users

**Roles:** ADMIN only for all user management endpoints.

### GET /api/users
List users. **Query params:** `page`, `per_page`, `search`

### POST /api/users
Create a user.

**Body:** `{ "username": "jane", "email": "jane@store.com", "password": "pass123", "full_name": "Jane Doe", "role": "CASHIER" }`

### GET /api/users/:id
Get a user by ID.

### PUT /api/users/:id
Update user (full_name, email, role, is_active).

### POST /api/users/:id/unlock
Unlock a locked account and reset failed login attempts.

---

## Settings

### GET /api/settings
Get all store settings. **Auth required.**

### PUT /api/settings
Update settings. **Roles:** ADMIN

**Body (any subset):**
```json
{
  "store_name": "GhanaShop POS",
  "store_address": "14 Liberation Road, Accra",
  "store_phone": "030-000-0000",
  "currency_symbol": "GH₵",
  "tax_rate": "0",
  "loyalty_points_rate": "10",
  "receipt_footer": "Thank you for shopping with us!"
}
```

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (insufficient role) |
| 404 | Not Found |
| 409 | Conflict (e.g., duplicate SKU) |
| 422 | Validation Error |
| 500 | Internal Server Error |

## Error Codes

| Code | Description |
|---|---|
| `VALIDATION_ERROR` | Input validation failed |
| `UNAUTHORIZED` | Authentication required or failed |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource does not exist |
| `CONFLICT` | Duplicate unique field |
| `INTERNAL_ERROR` | Unexpected server error |
