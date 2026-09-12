import { Resend } from "resend";
import { config } from "../../config/index.js";
import { logger } from "../logging/logger.js";

export interface SendVerificationEmailInput {
  to: string;
  fullName: string;
  verificationUrl: string;
}

export interface SendPasswordResetEmailInput {
  to: string;
  fullName: string;
  resetUrl: string;
}

export interface EmailSender {
  sendVerificationEmail(input: SendVerificationEmailInput): Promise<{ id?: string }>;
  sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<{ id?: string }>;
}

export const renderVerificationEmailHtml = (fullName: string, verificationUrl: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your FoodHub account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          <!-- Header with Brand Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #ea580c 0%, #f43f5e 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Food<span style="color: #fed7aa;">Hub</span></h1>
              <p style="margin: 6px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">Delicious meals, delivered fresh</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #09090b;">Hello ${escapeHtml(fullName)},</h2>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #52525b;">
                Thank you for joining FoodHub! To complete your registration and activate your account, please verify your email address by clicking the button below:
              </p>
              <!-- Call to Action Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #ea580c 0%, #f43f5e 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.6; color: #71717a;">
                This link will expire in <strong>1 hour</strong>. If you did not create a FoodHub account, you can safely ignore this email.
              </p>
              <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #a1a1aa; word-break: break-all;">
                Having trouble with the button? Copy and paste this URL into your browser:<br />
                <a href="${verificationUrl}" style="color: #ea580c; text-decoration: underline;">${verificationUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 20px 40px; text-align: center; border-top: 1px solid #f4f4f5;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                &copy; ${new Date().getFullYear()} FoodHub. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const renderPasswordResetEmailHtml = (fullName: string, resetUrl: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your FoodHub password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          <!-- Header with Brand Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #ea580c 0%, #f43f5e 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Food<span style="color: #fed7aa;">Hub</span></h1>
              <p style="margin: 6px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">Delicious meals, delivered fresh</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #09090b;">Hello ${escapeHtml(fullName)},</h2>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #52525b;">
                We received a request to reset your FoodHub account password. Click the button below to choose a new password:
              </p>
              <!-- Call to Action Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #ea580c 0%, #f43f5e 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.6; color: #71717a;">
                This link will expire in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not be changed.
              </p>
              <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #a1a1aa; word-break: break-all;">
                Having trouble with the button? Copy and paste this URL into your browser:<br />
                <a href="${resetUrl}" style="color: #ea580c; text-decoration: underline;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 20px 40px; text-align: center; border-top: 1px solid #f4f4f5;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                &copy; ${new Date().getFullYear()} FoodHub. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

export class ResendEmailSender implements EmailSender {
  private client: Resend | null = null;
  private fromEmail: string;

  constructor(apiKey = config.resend.apiKey, fromEmail = config.resend.fromEmail) {
    this.fromEmail = fromEmail;
    if (apiKey) {
      this.client = new Resend(apiKey);
    }
  }

  async sendVerificationEmail(input: SendVerificationEmailInput): Promise<{ id?: string }> {
    const { to, fullName, verificationUrl } = input;

    // In development and test environments, log the URL for easy local testing
    if (config.env !== "production") {
      logger.info(
        { to, verificationUrl },
        `[EmailService] Verification URL for ${to}: ${verificationUrl}`,
      );
    }

    if (!this.client) {
      logger.warn(
        { to },
        "[EmailService] Resend API key is not configured. Email delivery was skipped.",
      );
      return {};
    }

    const html = renderVerificationEmailHtml(fullName, verificationUrl);

    try {
      const response = await this.client.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: "Verify your FoodHub account",
        html,
      });

      if (response.error) {
        logger.error(
          { error: response.error, to },
          `[EmailService] Resend returned an error when sending email to ${to}: ${response.error.message}`,
        );
        return {};
      }

      logger.info(
        { emailId: response.data?.id, to },
        `[EmailService] Verification email dispatched to ${to}`,
      );
      return { id: response.data?.id };
    } catch (error) {
      logger.error(
        { error, to },
        `[EmailService] Unexpected error sending verification email to ${to}`,
      );
      return {};
    }
  }

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<{ id?: string }> {
    const { to, fullName, resetUrl } = input;

    // In development and test environments, log the URL for easy local testing
    if (config.env !== "production") {
      logger.info(
        { to, resetUrl },
        `[EmailService] Password reset URL for ${to}: ${resetUrl}`,
      );
    }

    if (!this.client) {
      logger.warn(
        { to },
        "[EmailService] Resend API key is not configured. Email delivery was skipped.",
      );
      return {};
    }

    const html = renderPasswordResetEmailHtml(fullName, resetUrl);

    try {
      const response = await this.client.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: "Reset your FoodHub password",
        html,
      });

      if (response.error) {
        logger.error(
          { error: response.error, to },
          `[EmailService] Resend returned an error when sending password reset email to ${to}: ${response.error.message}`,
        );
        return {};
      }

      logger.info(
        { emailId: response.data?.id, to },
        `[EmailService] Password reset email dispatched to ${to}`,
      );
      return { id: response.data?.id };
    } catch (error) {
      logger.error(
        { error, to },
        `[EmailService] Unexpected error sending password reset email to ${to}`,
      );
      return {};
    }
  }
}

export const emailService: EmailSender = new ResendEmailSender();
