/**
 * Test Setup - Configuration for unit tests
 * Minimal setup to avoid AWS SDK dependency issues
 */

// Set environment variables for tests
process.env.NODE_ENV = "test";
process.env.AWS_REGION = "eu-south-2";
process.env.REPORTS_BUCKET = "test-reports";
process.env.FROM_EMAIL = "test@example.com";
process.env.TO_EMAILS = "recipient@example.com";
process.env.EMAIL_DISPLAY_NAME = "Test FinOps";

// Note: AWS SDK mocking is optional and can be added per-test-file if needed
// This avoids dependency issues with @smithy/core and other transitive deps
