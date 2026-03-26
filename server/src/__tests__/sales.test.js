require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let cashierToken
let managerToken
let testCategory
let testProduct
let testProduct2
let testCustomer
let cashierUser
let managerUser

beforeAll(async () => {
  // Create test users
  const hash = await bcrypt.hash('testpass123', 12)
  cashierUser = await prisma.user.create({
    data: {
      username: 'sales_test_cashier',
      email: 'sales_test_cashier@test.com',
      password_hash: hash,
      full_name: 'Sales Test Cashier',
      role: 'CASHIER',
    },
  })
  managerUser = await prisma.user.create({
    data: {
      username: 'sales_test_manager',
      email: 'sales_test_manager@test.com',
      password_hash: hash,
      full_name: 'Sales Test Manager',
      role: 'MANAGER',
    },
  })

  // Login to get tokens
  const cashierLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'sales_test_cashier', password: 'testpass123' })
  cashierToken = cashierLogin.body.data.accessToken

  const managerLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'sales_test_manager', password: 'testpass123' })
  managerToken = managerLogin.body.data.accessToken

  // Create test category and products
  testCategory = await prisma.category.create({
    data: { name: 'SalesTest_Category_XYZ' },
  })
  testProduct = await prisma.product.create({
    data: {
      name: 'Sales Test Product A',
      sku: 'SALES-TEST-A',
      barcode: '1234560001111',
      category_id: testCategory.id,
      price: 10.0,
      cost_price: 5.0,
      quantity: 100,
      low_stock_threshold: 10,
    },
  })
  testProduct2 = await prisma.product.create({
    data: {
      name: 'Sales Test Product B',
      sku: 'SALES-TEST-B',
      barcode: '1234560002222',
      category_id: testCategory.id,
      price: 25.0,
      cost_price: 12.0,
      quantity: 5,
      low_stock_threshold: 5,
    },
  })
  testCustomer = await prisma.customer.create({
    data: {
      name: 'Sales Test Customer',
      phone: '0209990001',
      email: 'salescustomer@test.com',
      loyalty_points: 0,
    },
  })
})

afterAll(async () => {
  // Clean up in dependency order
  await prisma.inventoryLog.deleteMany({ where: { user_id: { in: [cashierUser.id, managerUser.id] } } })
  await prisma.payment.deleteMany({
    where: { sale: { user_id: { in: [cashierUser.id, managerUser.id] } } },
  })
  await prisma.saleItem.deleteMany({
    where: { sale: { user_id: { in: [cashierUser.id, managerUser.id] } } },
  })
  await prisma.sale.deleteMany({ where: { user_id: { in: [cashierUser.id, managerUser.id] } } })
  await prisma.customer.delete({ where: { id: testCustomer.id } })
  await prisma.product.deleteMany({ where: { category_id: testCategory.id } })
  await prisma.category.delete({ where: { id: testCategory.id } })
  await prisma.authLog.deleteMany({ where: { user_id: { in: [cashierUser.id, managerUser.id] } } })
  await prisma.user.deleteMany({ where: { id: { in: [cashierUser.id, managerUser.id] } } })
  await prisma.$disconnect()
})

describe('POST /api/sales — create sale', () => {
  it('creates a CASH sale successfully and deducts stock', async () => {
    const initialProduct = await prisma.product.findUnique({ where: { id: testProduct.id } })
    const initialQty = initialProduct.quantity

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 2, discount: 0 }],
        payment_method: 'CASH',
        amount_paid: 30.0,
        discount_amount: 0,
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)

    const sale = res.body.data
    expect(sale.transaction_id).toMatch(/^TXN-\d{8}-\d{4}$/)
    expect(sale.payment_method).toBe('CASH')
    expect(sale.payment_status).toBe('COMPLETED')
    expect(parseFloat(sale.total_amount)).toBe(20.0)
    expect(sale.sale_items).toHaveLength(1)
    expect(sale.sale_items[0].unit_price).toBe('10.00')
    expect(sale.payments[0].change_given).toBe('10.00')

    // Verify stock was deducted
    const updatedProduct = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(updatedProduct.quantity).toBe(initialQty - 2)

    // Verify inventory log was created
    const log = await prisma.inventoryLog.findFirst({
      where: { product_id: testProduct.id, change_type: 'SALE' },
      orderBy: { created_at: 'desc' },
    })
    expect(log).not.toBeNull()
    expect(log.quantity_change).toBe(-2)
  })

  it('creates a MOBILE_MONEY sale with reference', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 1 }],
        payment_method: 'MOBILE_MONEY',
        amount_paid: 10.0,
        reference: 'MOMO-REF-12345',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.payment_method).toBe('MOBILE_MONEY')
    expect(res.body.data.payments[0].reference).toBe('MOMO-REF-12345')
  })

  it('awards loyalty points when customer is linked', async () => {
    const beforeCustomer = await prisma.customer.findUnique({ where: { id: testCustomer.id } })
    const beforePoints = beforeCustomer.loyalty_points

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 3 }],
        customer_id: testCustomer.id,
        payment_method: 'CASH',
        amount_paid: 30.0,
      })

    expect(res.status).toBe(201)

    // 3 * 10 = 30 GHS → 3 points at default rate of 10 GHS/point
    const afterCustomer = await prisma.customer.findUnique({ where: { id: testCustomer.id } })
    expect(afterCustomer.loyalty_points).toBeGreaterThan(beforePoints)
  })

  it('rejects sale when cash amount_paid is less than total', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 2 }],
        payment_method: 'CASH',
        amount_paid: 5.0, // total is 20
      })

    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it('rejects sale when product has insufficient stock', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: testProduct2.id, quantity: 999 }],
        payment_method: 'CASH',
        amount_paid: 99999.0,
      })

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/insufficient stock/i)
  })

  it('rejects sale with non-existent product_id', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
        payment_method: 'CASH',
        amount_paid: 100.0,
      })

    expect(res.status).toBe(404)
  })

  it('returns 422 when items array is empty', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [],
        payment_method: 'CASH',
        amount_paid: 10.0,
      })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/sales').send({
      items: [{ product_id: testProduct.id, quantity: 1 }],
      payment_method: 'CASH',
      amount_paid: 10.0,
    })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/sales — list sales', () => {
  it('returns paginated sales list', async () => {
    const res = await request(app)
      .get('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.meta).toHaveProperty('page')
    expect(res.body.meta).toHaveProperty('total')
  })

  it('filters by date range', async () => {
    const today = new Date().toISOString().split('T')[0]
    const res = await request(app)
      .get(`/api/sales?start_date=${today}&end_date=${today}`)
      .set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    // All returned sales should be from today
    res.body.data.forEach((s) => {
      const saleDate = new Date(s.created_at).toISOString().split('T')[0]
      expect(saleDate).toBe(today)
    })
  })
})

describe('GET /api/sales/:id', () => {
  let saleId

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 1 }],
        payment_method: 'CARD',
        amount_paid: 10.0,
        reference: 'CARD-TEST-001',
      })
    saleId = res.body.data.id
  })

  it('returns full sale details with items and payment', async () => {
    const res = await request(app)
      .get(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(saleId)
    expect(res.body.data.sale_items).toBeDefined()
    expect(res.body.data.payments).toBeDefined()
    expect(res.body.data.user).toBeDefined()
  })

  it('returns 404 for non-existent sale', async () => {
    const res = await request(app)
      .get('/api/sales/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(404)
  })
})

describe('GET /api/sales/:id/receipt', () => {
  let saleId

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 1 }],
        payment_method: 'CASH',
        amount_paid: 15.0,
      })
    saleId = res.body.data.id
  })

  it('returns receipt data with store info', async () => {
    const res = await request(app)
      .get(`/api/sales/${saleId}/receipt`)
      .set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.store).toBeDefined()
    expect(res.body.data.sale).toBeDefined()
    expect(res.body.data.sale.transaction_id).toMatch(/^TXN-/)
  })
})

describe('POST /api/sales/:id/refund', () => {
  let saleId
  let productQtyBeforeRefund

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 2 }],
        payment_method: 'CASH',
        amount_paid: 25.0,
      })
    saleId = res.body.data.id
    const p = await prisma.product.findUnique({ where: { id: testProduct.id } })
    productQtyBeforeRefund = p.quantity
  })

  it('refunds a sale and restores stock (ADMIN/MANAGER only)', async () => {
    const res = await request(app)
      .post(`/api/sales/${saleId}/refund`)
      .set('Authorization', `Bearer ${managerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.payment_status).toBe('REFUNDED')

    // Verify stock was restored
    const updatedProduct = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(updatedProduct.quantity).toBe(productQtyBeforeRefund + 2)

    // Verify RETURN inventory log was created
    const log = await prisma.inventoryLog.findFirst({
      where: { product_id: testProduct.id, change_type: 'RETURN' },
      orderBy: { created_at: 'desc' },
    })
    expect(log).not.toBeNull()
    expect(log.quantity_change).toBe(2)
  })

  it('rejects double refund', async () => {
    const res = await request(app)
      .post(`/api/sales/${saleId}/refund`)
      .set('Authorization', `Bearer ${managerToken}`)

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/already refunded/i)
  })

  it('returns 403 when cashier tries to refund', async () => {
    // Create a new sale to try to refund
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 1 }],
        payment_method: 'CASH',
        amount_paid: 10.0,
      })

    const newSaleId = saleRes.body.data.id

    const res = await request(app)
      .post(`/api/sales/${newSaleId}/refund`)
      .set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(403)
  })
})
