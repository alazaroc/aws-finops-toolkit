import {
  GetIdentityVerificationAttributesCommand,
  SendEmailCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import { logger } from "../core/logger";

interface SubjectFormatOptions {
  accountId?: string;
  accountAlias?: string;
  additionalInfo?: string;
}

/**
 * Email Service
 * Centralizes email sending logic to eliminate duplication
 */
export class EmailService {
  private sesClient: SESClient;

  constructor(region?: string) {
    this.sesClient = new SESClient({
      region: region || process.env.SES_REGION || "us-east-1",
    });
  }

  /**
   * Send HTML email report
   * @param to - Recipient email addresses
   * @param subject - Email subject
   * @param htmlBody - HTML email body
   * @param textBody - Plain text fallback (optional)
   * @param fromEmail - Optional sender email (if not provided, uses first recipient)
   */
  async sendHtmlEmail(
    to: string[],
    subject: string,
    htmlBody: string,
    textBody?: string,
    fromEmail?: string,
    displayName?: string
  ): Promise<void> {
    const validRecipients = EmailService.validateEmails(to);
    if (validRecipients.length === 0) {
      logger.error(
        "Skipping email delivery because there are no valid recipient addresses",
        undefined,
        {
          subject,
        }
      );
      return;
    }

    const senderEmail =
      fromEmail ||
      process.env.FROM_EMAIL ||
      (validRecipients.length > 0 ? validRecipients[0] : "finops@company.com");
    const resolvedDisplayName = this.resolveDisplayName(displayName);
    const sourceAddress = this.formatSourceAddress(senderEmail, resolvedDisplayName);

    try {
      await this.deliverEmail(validRecipients, subject, htmlBody, textBody, sourceAddress);
    } catch (error) {
      if (this.isIdentityVerificationError(error)) {
        const recovery = await this.handleIdentityVerificationFailure(
          error,
          validRecipients,
          subject,
          htmlBody,
          textBody,
          sourceAddress
        );
        if (recovery.recovered) {
          return;
        }
      }

      logger.error("Failed to send email", error as Error, {
        to: validRecipients.length,
        subject,
        fromEmail: senderEmail,
        displayName: resolvedDisplayName,
      });
      throw error;
    }
  }

  /**
   * Validate email addresses
   * @param emails - Array of email addresses to validate
   * @returns Array of valid email addresses
   */
  static validateEmails(emails: string[]): string[] {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emails.filter((email) => {
      const isValid = emailRegex.test(email);
      if (!isValid) {
        logger.warn("Invalid email address", { email });
      }
      return isValid;
    });
  }

  /**
   * Format email subject with account info
   * @param baseSubject - Base subject line
   * @param accountId - AWS account ID
   * @param additionalInfo - Additional info to append
   * @returns Formatted subject
   */
  static formatSubject(baseSubject: string, options?: SubjectFormatOptions): string {
    let subject = baseSubject;

    if (options?.accountId) {
      subject += ` - Account ${options.accountId}`;
      if (options.accountAlias) {
        subject += ` (${options.accountAlias})`;
      }
    }

    if (options?.additionalInfo) {
      subject += ` - ${options.additionalInfo}`;
    }

    return subject;
  }

  /**
   * Get email configuration from config
   * @param config - FinOps configuration
   * @returns Object with from, to, and displayName
   */
  static getEmailConfig(config: any): { from: string; to: string[]; displayName: string } {
    if (!config?.email_config?.from) {
      throw new Error("Missing required config: email_config.from");
    }

    const from = config.email_config.from;
    const fromValid = EmailService.validateEmails([from]);
    if (fromValid.length === 0) {
      throw new Error("Invalid email_config.from");
    }

    const toList = Array.isArray(config.email_config.to)
      ? config.email_config.to
      : config.email_config.to
        ? [config.email_config.to]
        : [];
    const validTo = EmailService.validateEmails(toList);
    if (validTo.length === 0) {
      throw new Error("No valid email_config.to addresses configured");
    }

    const displayName =
      (config?.email_config?.display_name && String(config.email_config.display_name).trim()) ||
      (config?.email_config?.displayName && String(config.email_config.displayName).trim()) ||
      process.env.EMAIL_DISPLAY_NAME?.trim() ||
      process.env.EMAIL_SENDER_NAME?.trim() ||
      "aws-finops-toolkit";

    return {
      from,
      to: validTo,
      displayName,
    };
  }

  private resolveDisplayName(displayName?: string): string {
    const fallback =
      process.env.EMAIL_DISPLAY_NAME?.trim() ||
      process.env.EMAIL_SENDER_NAME?.trim() ||
      "aws-finops-toolkit";

    const candidate = displayName?.trim();
    return candidate && candidate.length > 0 ? candidate : fallback;
  }

  private formatSourceAddress(email: string, displayName?: string): string {
    if (!displayName) {
      return email;
    }

    const sanitizedDisplayName = displayName.replace(/["<>]/g, "").trim();
    if (!sanitizedDisplayName) {
      return email;
    }

    return `${sanitizedDisplayName} <${email}>`;
  }

  private async deliverEmail(
    to: string[],
    subject: string,
    htmlBody: string,
    textBody: string | undefined,
    sourceAddress: string
  ): Promise<void> {
    const command = new SendEmailCommand({
      Source: sourceAddress,
      Destination: {
        ToAddresses: to,
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: "UTF-8",
          },
          ...(textBody && {
            Text: {
              Data: textBody,
              Charset: "UTF-8",
            },
          }),
        },
      },
    });

    await (this.sesClient as any).send(command);
  }

  private isIdentityVerificationError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      error.name === "MessageRejected" &&
      message.includes("not verified") &&
      (message.includes("identity") || message.includes("identities"))
    );
  }

  private async handleIdentityVerificationFailure(
    error: unknown,
    recipients: string[],
    subject: string,
    htmlBody: string,
    textBody: string | undefined,
    sourceAddress: string
  ): Promise<{ recovered: boolean }> {
    const verificationState = await this.getRecipientVerificationState(recipients);
    const skippedRecipients = verificationState.unverified.length
      ? verificationState.unverified
      : this.extractUnverifiedEmailsFromError(error as Error);

    for (const recipient of skippedRecipients) {
      logger.error(
        `Recipient email ${recipient} is not verified in SES and will not receive this report`
      );
    }

    if (verificationState.verified.length === 0) {
      logger.error(
        "No verified SES recipients are available; skipping email delivery for this report",
        error as Error,
        {
          attemptedRecipients: recipients,
        }
      );
      return { recovered: true };
    }

    try {
      await this.deliverEmail(
        verificationState.verified,
        subject,
        htmlBody,
        textBody,
        sourceAddress
      );
      logger.warn("Email sent only to SES-verified recipients", {
        deliveredRecipients: verificationState.verified,
        skippedRecipients,
      });
      return { recovered: true };
    } catch (retryError) {
      logger.error("Failed to send email to SES-verified recipients", retryError as Error, {
        deliveredRecipients: verificationState.verified,
        skippedRecipients,
      });
      return { recovered: false };
    }
  }

  private async getRecipientVerificationState(recipients: string[]): Promise<{
    verified: string[];
    unverified: string[];
  }> {
    try {
      const command = new GetIdentityVerificationAttributesCommand({
        Identities: recipients,
      });
      const response = await (this.sesClient as any).send(command);
      const attributes = response.VerificationAttributes || {};

      return recipients.reduce(
        (result, recipient) => {
          const status = attributes[recipient]?.VerificationStatus;
          if (status === "Success") {
            result.verified.push(recipient);
          } else if (status) {
            result.unverified.push(recipient);
          }
          return result;
        },
        { verified: [] as string[], unverified: [] as string[] }
      );
    } catch (lookupError) {
      logger.warn("Unable to resolve SES recipient verification state", {
        recipients,
        error:
          lookupError instanceof Error
            ? { name: lookupError.name, message: lookupError.message }
            : String(lookupError),
      });

      return {
        verified: [],
        unverified: [],
      };
    }
  }

  private extractUnverifiedEmailsFromError(error: Error): string[] {
    const emails = error.message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    return [...new Set(emails)];
  }
}
