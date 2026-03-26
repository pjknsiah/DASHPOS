const prisma = require('./prismaClient')

/**
 * Generate a human-readable transaction ID in format TXN-YYYYMMDD-NNNN
 * Uses the count of today's sales to determine the sequence number.
 */
async function generateTransactionId() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const datePart = `${year}${month}${day}`

  const startOfDay = new Date(year, now.getMonth(), now.getDate(), 0, 0, 0)
  const endOfDay = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const count = await prisma.sale.count({
    where: {
      created_at: { gte: startOfDay, lte: endOfDay },
    },
  })

  const sequence = String(count + 1).padStart(4, '0')
  return `TXN-${datePart}-${sequence}`
}

module.exports = generateTransactionId
