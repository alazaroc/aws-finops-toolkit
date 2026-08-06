/**
 * AWS Organizations detection and account listing.
 * Used by cost analysis lambdas to provide multi-account breakdowns.
 */

import {
  OrganizationsClient,
  DescribeOrganizationCommand,
  ListAccountsCommand,
} from "@aws-sdk/client-organizations";
import { logger } from "./logger";

export interface OrganizationInfo {
  id: string;
  masterAccountId: string;
  accounts: OrganizationAccount[];
}

export interface OrganizationAccount {
  id: string;
  name: string;
  email?: string;
  status?: string;
}

/**
 * Detect whether we're running in an Organizations context and list accounts.
 * Only works from the management account or a delegated administrator.
 */
export class OrganizationService {
  private client: OrganizationsClient;

  constructor() {
    // Organizations API only works in us-east-1
    this.client = new OrganizationsClient({ region: "us-east-1" });
  }

  /**
   * Detect if the current account has Organizations access.
   * Returns "organization" if yes, "single-account" otherwise.
   */
  async detectMode(): Promise<"organization" | "single-account"> {
    try {
      await (this.client as any).send(new DescribeOrganizationCommand({}));
      return "organization";
    } catch {
      return "single-account";
    }
  }

  /**
   * Get full organization info including all member accounts.
   * Returns null if not in an org context or access is denied.
   */
  async getOrganizationInfo(): Promise<OrganizationInfo | null> {
    try {
      const orgResponse = await (this.client as any).send(new DescribeOrganizationCommand({}));
      const org = orgResponse.Organization;
      if (!org) {
        return null;
      }

      const accounts = await this.listAllAccounts();

      return {
        id: org.Id!,
        masterAccountId: org.MasterAccountId!,
        accounts,
      };
    } catch (error) {
      logger.warn("Could not retrieve organization info (expected in single-account mode)", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * List all accounts in the organization (handles pagination).
   */
  private async listAllAccounts(): Promise<OrganizationAccount[]> {
    const accounts: OrganizationAccount[] = [];
    let nextToken: string | undefined;

    do {
      const response: any = await (this.client as any).send(
        new ListAccountsCommand({ NextToken: nextToken })
      );

      for (const acc of response.Accounts || []) {
        if (acc.Status === "ACTIVE") {
          accounts.push({
            id: acc.Id!,
            name: acc.Name || acc.Id!,
            email: acc.Email,
            status: acc.Status,
          });
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return accounts;
  }
}
