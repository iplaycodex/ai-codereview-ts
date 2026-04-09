import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Ensure log directory exists
const logDir = path.dirname(config.logFile);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFormat = winston.format.printf(({ timestamp, level, message, ..._meta }) => {
  return `${timestamp} - ${level.toUpperCase()} - ${message}`;
});

const logger = winston.createLogger({
  level: config.logLevel.toLowerCase(),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss,SSS' }),
    logFormat
  ),
  transports: [
    new winston.transports.File({
      filename: config.logFile,
      maxsize: config.logMaxBytes,
      maxFiles: config.logBackupCount,
    } as winston.transport.TransportStreamOptions),
    new winston.transports.Console(),
  ],
});

export default logger;
