import { SimpleFinOpsConfig } from "../types/finops-config";

/**
 * Base class for all FinOps services to share common logic
 */
export abstract class BaseFinOpsService {
  protected config: SimpleFinOpsConfig;

  constructor(config: SimpleFinOpsConfig) {
    this.config = config;
  }

  /**
   * Helper to get safe Account ID
   */
  protected getAccountId(): string {
    return process.env.AWS_ACCOUNT_ID || this.config.account_id || "unknown";
  }

  /**
   * Type-safe wrapper for AWS SDK v3 .send() to circumvent current environment type issues.
   * This is a temporary measure while the environment's SDK type definitions are being resolved.
   */
  protected async sendCommand<TResponse>(client: any, command: any): Promise<TResponse> {
    return await client.send(command);
  }
}
