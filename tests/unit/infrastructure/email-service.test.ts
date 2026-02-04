import { EmailService } from "../../../src/infrastructure/email-service";

describe("EmailService - CRITICAL", () => {
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
});
