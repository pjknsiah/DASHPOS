const { v4: uuidv4 } = require('uuid')
const { initializeTransaction, verifyTransaction, validateWebhookSignature } = require('../services/paystackService')
const { ValidationError } = require('../utils/errors')
const { logger } = require('../middleware/logger')
const { completePaystackRefund, failPaystackRefund } = require('../services/salesService')

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
  const signature = req.headers['x-paystack-signature']
  const rawBody = req.rawBody

  if (!validateWebhookSignature(rawBody, signature)) {
    logger.warn('Paystack webhook: invalid signature')
    return res.sendStatus(400)
  }

  const { event, data = {} } = req.body

  try {
    if (event === 'charge.success') {
      // The POS flow verifies synchronously before creating the sale, so
      // this is only logged
      logger.info(`Paystack webhook: charge.success for reference ${data.reference}`)
    } else if (event === 'refund.processed' || event === 'refund.failed') {
      const reference = refundTransactionReference(data)
      if (!reference) {
        logger.warn(`Paystack webhook: ${event} without a transaction reference`)
      } else if (event === 'refund.processed') {
        const refunded = await completePaystackRefund(reference)
        logger.info(`Paystack webhook: refund.processed for ${reference}${refunded ? ', sale refunded' : ', nothing to update'}`)
      } else {
        const cleared = await failPaystackRefund(reference)
        logger.warn(`Paystack webhook: refund.failed for ${reference}${cleared ? ', refund request cleared' : ''}`)
      }
    }
  } catch (err) {
    // A non-200 makes Paystack retry; handling the same event twice is safe
    logger.error(`Paystack webhook: failed to handle ${event}: ${err.message}`)
    return res.sendStatus(500)
  }

  res.sendStatus(200)
}

// Refund events carry the original transaction's reference; accept the
// documented field and the nested form in case the payload shape differs
function refundTransactionReference(data) {
  return data.transaction_reference || data.transaction?.reference || null
}

module.exports = { initialize, verify, webhook }
