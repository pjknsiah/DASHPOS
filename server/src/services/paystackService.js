const https = require('https')
const { AppError } = require('../utils/errors')

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY

function paystackRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    if (!PAYSTACK_SECRET) {
      return reject(new AppError('Paystack secret key is not configured', 500))
    }

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new AppError('Invalid response from Paystack', 502))
        }
      })
    })

    req.on('error', (err) => reject(new AppError(`Paystack request failed: ${err.message}`, 502)))

    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

/**
 * Initialize a Paystack transaction.
 * @param {object} params
 * @param {string} params.email     - Customer email (required by Paystack)
 * @param {number} params.amount    - Amount in GHS (will be converted to pesewas)
 * @param {string} params.reference - Unique transaction reference
 * @param {object} [params.metadata] - Optional metadata
 */
async function initializeTransaction({ email, amount, reference, metadata = {} }) {
  const body = {
    email,
    // Paystack expects amount in the smallest currency unit (pesewas for GHS)
    amount: Math.round(amount * 100),
    reference,
    currency: 'GHS',
    metadata,
  }

  const result = await paystackRequest('POST', '/transaction/initialize', body)

  if (!result.status) {
    throw new AppError(result.message || 'Failed to initialize Paystack transaction', 502)
  }

  return result.data // { authorization_url, access_code, reference }
}

/**
 * Verify a Paystack transaction by reference.
 * @param {string} reference
 * @returns {object} Paystack transaction data
 */
async function verifyTransaction(reference) {
  const result = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`)

  if (!result.status) {
    throw new AppError(result.message || 'Failed to verify Paystack transaction', 502)
  }

  return result.data // { status, amount, reference, channel, ... }
}

/**
 * Validate Paystack webhook signature.
 * @param {string} body   - Raw request body string
 * @param {string} signature - x-paystack-signature header value
 */
function validateWebhookSignature(body, signature) {
  const crypto = require('crypto')
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex')
  return hash === signature
}

module.exports = { initializeTransaction, verifyTransaction, validateWebhookSignature }
