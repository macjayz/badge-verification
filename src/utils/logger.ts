import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

// Console is always enabled: containers and PaaS platforms collect logs from
// stdout/stderr, so a file-only logger makes a deployed app look silent.
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isProduction
      ? winston.format.combine(winston.format.timestamp(), winston.format.json())
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  })
];

// File logs are opt-in. Set LOG_TO_FILE=true to also write error.log/combined.log
// (default on in development for convenience, off in production so the
// container's writable layer doesn't grow unbounded).
if (process.env.LOG_TO_FILE === 'true' || (!isProduction && process.env.LOG_TO_FILE !== 'false')) {
  transports.push(new winston.transports.File({ filename: 'error.log', level: 'error' }));
  transports.push(new winston.transports.File({ filename: 'combined.log' }));
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'badge-verification' },
  transports
});
