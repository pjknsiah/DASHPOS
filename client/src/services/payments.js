import api from './api'

export const paymentsService = {
  /**
   * Initialize a Paystack transaction.
   * @param {number} amount - Amount in GHS
   * @param {string} email  - Customer email
   * @param {object} [metadata] - Optional metadata
   */
  initialize: (amount, email, metadata = {}) =>
    api.post('/payments/paystack/initialize', { amount, email, metadata }),

  /**
   * Verify a Paystack transaction.
   * @param {string} reference
   */
  verify: (reference) =>
    api.get(`/payments/paystack/verify/${encodeURIComponent(reference)}`),
}
