/**
 * Structured Logger Utility
 * Provides consistent logging with levels and context
 */
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogContext {
  requestId?: string;
  accountId?: string;
  region?: string;
  resourceId?: string;
  [key: string]: any;
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;

  private constructor() {
    // Set log level from environment or default to INFO
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    this.logLevel = LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.log("🔍", "DEBUG", message, context);
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    if (this.logLevel <= LogLevel.INFO) {
      this.log("ℹ️", "INFO", message, context);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    if (this.logLevel <= LogLevel.WARN) {
      this.log("⚠️", "WARN", message, context);
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: LogContext): void {
    if (this.logLevel <= LogLevel.ERROR) {
      const errorContext = error
        ? {
            ...context,
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
          }
        : context;

      this.log("❌", "ERROR", message, errorContext);
    }
  }

  /**
   * Log success message
   */
  success(message: string, context?: LogContext): void {
    this.log("✅", "SUCCESS", message, context);
  }

  /**
   * Internal logging method
   */
  private log(icon: string, level: string, message: string, context?: LogContext): void {
    // Use console.log for structured JSON in CloudWatch
    console.log(`${icon} [${level}] ${message}`, context ? JSON.stringify(context, null, 2) : "");
  }

  /**
   * Create a child logger with default context
   */
  child(defaultContext: LogContext): ChildLogger {
    return new ChildLogger(this, defaultContext);
  }
}

/**
 * Child logger that includes default context
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private defaultContext: LogContext
  ) {}

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, { ...this.defaultContext, ...context });
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, { ...this.defaultContext, ...context });
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, { ...this.defaultContext, ...context });
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.parent.error(message, error, { ...this.defaultContext, ...context });
  }

  success(message: string, context?: LogContext): void {
    this.parent.success(message, { ...this.defaultContext, ...context });
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
