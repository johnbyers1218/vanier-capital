// utils/email.js (ESM Version)

// Import necessary modules using ESM syntax
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { logger } from "../config/logger.js";

// Destructure google.auth for easier access if preferred
const { OAuth2 } = google.auth;

/**
 * Asynchronously creates and configures a Nodemailer transport using
 * Google OAuth2 credentials from environment variables.
 * Throws an error if configuration is missing or authentication fails.
 * @returns {Promise<nodemailer.Transporter>} A Promise resolving to the configured transporter.
 */
export const createTransporter = async () => {
  logger.debug("Attempting to create Nodemailer OAuth2 transporter...");

  // 1. Check for required environment variables
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const refreshToken = process.env.REFRESH_TOKEN;
  const emailUser = process.env.EMAIL_USER; // The Gmail account sending the email

  if (!clientId || !clientSecret || !refreshToken || !emailUser) {
    logger.error(
      "FATAL: Missing required Google OAuth2 environment variables for email (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, EMAIL_USER)."
    );
    // Throwing here prevents proceeding if email config is broken
    throw new Error(
      "Email service configuration is incomplete. Required variables missing."
    );
  }

  // 2. Create OAuth2 client instance
  const oauth2Client = new OAuth2(
    clientId,
    clientSecret,
    "https://developers.google.com/oauthplayground" // Standard redirect URI for playground token generation
  );

  // 3. Set the refresh token credentials on the OAuth2 client
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  // 4. Attempt to get an access token using the refresh token
  try {
    logger.debug("Requesting new access token using refresh token...");
    const accessTokenResponse = await oauth2Client.getAccessToken();
    const accessToken = accessTokenResponse.token;

    if (!accessToken) {
      logger.error(
        "Failed to obtain access token from Google using refresh token."
      );
      throw new Error("Could not obtain access token for email service.");
    }
    logger.debug("Successfully obtained new access token for email.");

    // 5. Create Nodemailer transport object with OAuth2 authentication
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: emailUser,
        clientId: clientId,
        clientSecret: clientSecret,
        refreshToken: refreshToken,
        accessToken: accessToken,
      },
      logger: true,
      debug: true,
    });

    logger.info("Nodemailer OAuth2 transporter created successfully.");
    return transporter; // Return the ready-to-use transporter
  } catch (err) {
    // Log detailed error information
    logger.error("Failed to create email access token or transporter:", {
      errorMessage: err.message,
      errorCode: err.code, // Google API errors often have codes
      errorDetails: err.response?.data, // Google API error details might be here
      stack: err.stack,
    });
    // Rethrow a more generic error to avoid leaking details potentially
    throw new Error(
      `Failed to configure email service. Please check credentials and API access. Original error: ${err.message}`
    );
  }
};

export { createTransporter };
