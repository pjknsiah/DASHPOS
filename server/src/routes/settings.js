const express = require('express')
const { authenticate, authorize } = require('../middleware/auth')
const prisma = require('../utils/prismaClient')

const router = express.Router()

router.use(authenticate)

const DEFAULT_SETTINGS = {
  store_name: 'My POS Store',
  store_address: '',
  store_phone: '',
  tax_rate: '0',
  loyalty_points_rate: '10',
  currency_symbol: 'GH₵',
  receipt_footer: 'Thank you for your business!',
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.settings.findMany()
    const settings = { ...DEFAULT_SETTINGS }
    rows.forEach((r) => { settings[r.key] = r.value })
    res.json({ success: true, data: settings })
  } catch (err) {
    next(err)
  }
})

router.put('/', authorize(['ADMIN']), async (req, res, next) => {
  try {
    const allowed = Object.keys(DEFAULT_SETTINGS)
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k))
    await Promise.all(
      updates.map(([key, value]) =>
        prisma.settings.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        })
      )
    )
    const rows = await prisma.settings.findMany()
    const settings = { ...DEFAULT_SETTINGS }
    rows.forEach((r) => { settings[r.key] = r.value })
    res.json({ success: true, data: settings, message: 'Settings saved successfully' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
