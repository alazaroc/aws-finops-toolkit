import { EmailService } from "../../../src/infrastructure/email-service";
import {
  GetIdentityVerificationAttributesCommand,
  SendEmailCommand,
  SESClient,
} from "@aws-sdk/client-ses";

describe("EmailService - CRITICAL", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("should validate correct email addresses", () => {
    const valid = EmailService.validateEmails(["test@example.com"]);
    expect(valid).toContain("test@example.com");
  });

  it("should reject invalid email addresses", () => {
    const valid = EmailService.validateEmails(["invalid"]);
    expect(valid.length).toBe(0);
  });

  it("should format subject with account ID", () => {
    const subject = EmailService.formatSubject("Report", { accountId: "123456789012" });
    expect(subject).toContain("123456789012");
  });

  it("should extract email config from object", () => {
    const config = {
      email_config: {
        from: "sender@example.com",
        to: ["recipient@example.com"],
        display_name: "Test",
      },
    };
    const result = EmailService.getEmailConfig(config);
    expect(result.from).toBe("sender@example.com");
    expect(result.to).toContain("recipient@example.com");
  });

  it("should throw when from email missing", () => {
    const config = { email_config: { to: ["test@example.com"] } };
    expect(() => EmailService.getEmailConfig(config)).toThrow();
  });

  it("sends email to verified recipients when some SES identities are not verified", async () => {
    const sendSpy = jest.spyOn(SESClient.prototype, "send").mockImplementation(async (command) => {
      if (command instanceof SendEmailCommand) {
        const recipients = (command.input.Destination?.ToAddresses || []).join(",");
        if (recipients.includes("pending@example.com")) {
          const error = new Error(
            "Email address is not verified. The following identities failed the check in region EU-WEST-1: pending@example.com"
          );
          error.name = "MessageRejected";
          throw error;
        }
        return { MessageId: "msg-123" } as any;
      }

      if (command instanceof GetIdentityVerificationAttributesCommand) {
        return {
          VerificationAttributes: {
            "verified@example.com": { VerificationStatus: "Success" },
            "pending@example.com": { VerificationStatus: "Pending" },
          },
        } as any;
      }

      throw new Error("Unexpected command");
    });

    const errorSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const service = new EmailService("eu-west-1");

    await expect(
      service.sendHtmlEmail(
        ["verified@example.com", "pending@example.com"],
        "Report",
        "<p>hello</p>",
        undefined,
        "sender@example.com",
        "Toolkit"
      )
    ).resolves.toBeUndefined();

    const sendEmailCommands = sendSpy.mock.calls.filter(
      ([command]) => command instanceof SendEmailCommand
    );
    expect(sendEmailCommands).toHaveLength(2);
    expect(sendEmailCommands[0]?.[0].input.Destination?.ToAddresses).toEqual([
      "verified@example.com",
      "pending@example.com",
    ]);
    expect(sendEmailCommands[1]?.[0].input.Destination?.ToAddresses).toEqual([
      "verified@example.com",
    ]);

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("Recipient email pending@example.com is not verified in SES")
      )
    ).toBe(true);
  });

  it("does not throw when all SES recipients are unverified", async () => {
    jest.spyOn(SESClient.prototype, "send").mockImplementation(async (command) => {
      if (command instanceof SendEmailCommand) {
        const error = new Error(
          "Email address is not verified. The following identities failed the check in region EU-WEST-1: pending@example.com"
        );
        error.name = "MessageRejected";
        throw error;
      }

      if (command instanceof GetIdentityVerificationAttributesCommand) {
        return {
          VerificationAttributes: {
            "pending@example.com": { VerificationStatus: "Pending" },
          },
        } as any;
      }

      throw new Error("Unexpected command");
    });

    const errorSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const service = new EmailService("eu-west-1");

    await expect(
      service.sendHtmlEmail(
        ["pending@example.com"],
        "Report",
        "<p>hello</p>",
        undefined,
        "sender@example.com"
      )
    ).resolves.toBeUndefined();

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("No verified SES recipients are available")
      )
    ).toBe(true);
  });
});
