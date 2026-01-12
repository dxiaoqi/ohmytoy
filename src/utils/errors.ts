export class AgentError extends Error {
  public readonly details: Record<string, any>;
  public readonly cause?: Error;

  constructor(
    message: string,
    details: Record<string, any> = {},
    cause?: Error
  ) {
    super(message);
    this.name = "AgentError";
    this.details = details;
    this.cause = cause;
  }

  toString(): string {
    let base = this.message;
    if (Object.keys(this.details).length > 0) {
      const detailStr = Object.entries(this.details)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      base = `${base} (${detailStr})`;
    }
    if (this.cause) {
      base = `${base} [caused by: ${this.cause}]`;
    }
    return base;
  }

  toDict(): Record<string, any> {
    return {
      type: this.constructor.name,
      message: this.message,
      details: this.details,
      cause: this.cause?.toString() || null,
    };
  }
}

export class ConfigError extends AgentError {
  public readonly configKey?: string;
  public readonly configFile?: string;

  constructor(
    message: string,
    options: {
      configKey?: string;
      configFile?: string;
      details?: Record<string, any>;
      cause?: Error;
    } = {}
  ) {
    const details = options.details || {};
    if (options.configKey) {
      details.configKey = options.configKey;
    }
    if (options.configFile) {
      details.configFile = options.configFile;
    }
    super(message, details, options.cause);
    this.name = "ConfigError";
    this.configKey = options.configKey;
    this.configFile = options.configFile;
  }
}
