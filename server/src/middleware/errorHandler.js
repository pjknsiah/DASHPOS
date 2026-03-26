const { logger } = require('./logger')
const { AppError } = require('../utils/errors')

function errorHandler(err, req, res, next) {
  // Log the error
  if (process.env.NODE_ENV === 'development') {
    logger.error(err.stack || err.message)
  } else {
    logger.error(err.message)
  }

  // Handle Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'A record with that value already exists',
      },
    })
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Record not found',
      },
    })
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
      },
    })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token expired',
      },
    })
  }

  // Handle operational errors (our custom AppErrors)
  if (err.isOperational) {
    const response = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    }
    if (err.details) {
      response.error.details = err.details
    }
    return res.status(err.statusCode).json(response)
  }

  // Unhandled/programming errors — don't leak details in production
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? err.message
          : 'An unexpected error occurred',
    },
  })
}

module.exports = errorHandler
