const express = require('express')
const { body, param } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')
const { NotFoundError, ConflictError } = require('../utils/errors')

const router = express.Router()

router.use(authenticate)
router.use(authorize(['ADMIN']))

// List all users
router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, full_name: true, role: true, is_active: true, locked_until: true, created_at: true },
      orderBy: { created_at: 'asc' },
    })
    const now = new Date()
    const data = users.map((u) => ({
      ...u,
      is_locked: u.locked_until ? new Date(u.locked_until) > now : false,
    }))
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// Create user
router.post(
  '/',
  [
    body('username').notEmpty().trim().withMessage('Username is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('full_name').notEmpty().trim().withMessage('Full name is required'),
    body('role').isIn(['ADMIN', 'MANAGER', 'CASHIER']).withMessage('Valid role required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { username, email, password, full_name, role } = req.body
      const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } })
      if (existing) throw new ConflictError('Username or email already exists')
      const password_hash = await bcrypt.hash(password, 12)
      const user = await prisma.user.create({
        data: { username, email, password_hash, full_name, role },
        select: { id: true, username: true, email: true, full_name: true, role: true, is_active: true, created_at: true },
      })
      res.status(201).json({ success: true, data: user, message: 'User created successfully' })
    } catch (err) {
      next(err)
    }
  }
)

// Update user (role, active status, full_name, email)
router.put(
  '/:id',
  [
    param('id').isUUID(),
    body('role').optional().isIn(['ADMIN', 'MANAGER', 'CASHIER']),
    body('is_active').optional().isBoolean(),
    body('full_name').optional().notEmpty().trim(),
    body('email').optional().isEmail(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { role, is_active, full_name, email } = req.body
      const user = await prisma.user.findUnique({ where: { id: req.params.id } })
      if (!user) throw new NotFoundError('User not found')
      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: { ...(role !== undefined && { role }), ...(is_active !== undefined && { is_active }), ...(full_name && { full_name }), ...(email && { email }) },
        select: { id: true, username: true, email: true, full_name: true, role: true, is_active: true, created_at: true },
      })
      res.json({ success: true, data: updated, message: 'User updated successfully' })
    } catch (err) {
      next(err)
    }
  }
)

// Reset password
router.post(
  '/:id/reset-password',
  [param('id').isUUID(), body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')],
  validate,
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.params.id } })
      if (!user) throw new NotFoundError('User not found')
      const password_hash = await bcrypt.hash(req.body.password, 12)
      // Also unlock account
      await prisma.user.update({ where: { id: req.params.id }, data: { password_hash, failed_login_attempts: 0, locked_until: null } })
      res.json({ success: true, message: 'Password reset successfully' })
    } catch (err) {
      next(err)
    }
  }
)

// Unlock account
router.post('/:id/unlock', [param('id').isUUID()], validate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!user) throw new NotFoundError('User not found')
    await prisma.user.update({
      where: { id: req.params.id },
      data: { failed_login_attempts: 0, locked_until: null },
    })
    res.json({ success: true, message: 'Account unlocked successfully' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
