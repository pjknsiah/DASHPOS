const { v4: uuidv4 } = require('uuid')
const { initializeTransaction, verifyTransaction, validateWebhookSignature } = require('../services/paystackService')
const { ValidationError } = require('../utils/errors')
const { logger } = require('../middleware/logger')

async function initialize(req, res, next) {
  try {
    const { amount, email, metadata } = req.body

    // Generate a unique reference for this payment attempt
    const reference = `POS-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`

    const data = await initializeTransaction({ email, amount: parseFloat(amount), reference, metadata })

    res.status(200).json({
      success: true,
      data: {
        reference: data.reference,
        authorization_url: data.authorization_url,
        access_code: data.access_code,
      },
      message: 'Transaction initialized',
    })
  } catch (err) {
    next(err)
  }
}

async function verify(req, res, next) {
  try {
    const { reference } = req.params
    if (!reference) throw new ValidationError('Reference is required')

    const data = await verifyTransaction(reference)

    res.status(200).json({
      success: true,
      data: {
        status: data.status,           // 'success' | 'failed' | 'abandoned'
        amount: data.amount / 100,     // convert pesewas back to GHS
        reference: data.reference,
        channel: data.channel,         // 'card' | 'mobile_money' etc.
        paid_at: data.paid_at,
      },
      message: 'Transaction verified',
    })
  } catch (err) {
    next(err)
  }
}

async function webhook(req, res) {
  // Always respond 200 quickly — Paystack retries on non-200
  const signature = req.headers['x-paystack-signature']
  const rawBody = req.rawBody

  if (!validateWebhookSignature(rawBody, signature)) {
    logger.warn('Paystack webhook: invalid signature')
    return res.sendStatus(400)
  }

  const event = req.body

  if (event.event === 'charge.success') {
    logger.info(`Paystack webhook: charge.success for reference ${event.data?.reference}`)
    // The POS flow verifies synchronously before creating the sale, so
    // this webhook is primarily for logging / future async use cases.
  }

  res.sendStatus(200)
}

module.exports = { initialize, verify, webhook }
