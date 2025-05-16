// utils/googleAuth.js (ESM Version - CALENDAR FUNCTIONALITY TEMPORARILY COMMENTED OUT)

// import { google } from 'googleapis';
// import { logger } from './config/logger.js';
// import { Buffer } from 'buffer';

// const { JWT } = google.auth;

/**
 * Asynchronously creates and authorizes a Google API JWT client
 * using Service Account credentials.
 * THIS FUNCTION IS CURRENTLY NOT USED AS DIRECT CALENDAR INTEGRATION IS DISABLED.
 * @returns {Promise<object>} A Promise resolving to the authorized JWT client instance.
 */
export const getGoogleAuth = async () => {
    // logger.debug('Attempting Google API authentication (Currently Disabled for Calendar)...');
    logger.warn('[googleAuth.js] getGoogleAuth called, but Calendar integration is currently disabled. No action will be taken for Calendar API.');
    // Return a placeholder or throw an error if it were to be used unexpectedly.
    // For now, just logging and returning null to avoid breaking anything if it were called.
    return null;

    // --- PREVIOUS SERVICE ACCOUNT JWT LOGIC (COMMENTED OUT) ---
    /*
    const keyJsonString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
    const userToImpersonate = process.env.GOOGLE_WORKSPACE_USER_TO_IMPERSONATE; // If using DWD

    if (!keyJsonString) {
        logger.error('FATAL: GOOGLE_SERVICE_ACCOUNT_KEY_JSON environment variable is not set.');
        throw new Error('Server configuration error: Missing Google API service account credentials.');
    }

    let key;
    try {
        logger.debug('Attempting direct JSON parse of Google Service Account Key.');
        key = JSON.parse(keyJsonString);
    } catch (e) {
        logger.debug('Direct JSON parse failed, attempting Base64 decode for Service Account Key.');
        try {
            const decodedKeyString = Buffer.from(keyJsonString, 'base64').toString('utf-8');
            key = JSON.parse(decodedKeyString);
            logger.debug('Successfully decoded Base64 Google Service Account Key.');
        } catch (decodeError) {
            logger.error('Failed to parse Google Service Account Key JSON (tried direct and Base64). Check format.', { error: decodeError.message });
            throw new Error('Server configuration error: Invalid Google API credentials format.');
        }
    }

    if (!key.client_email || !key.private_key) {
        logger.error('Google Service Account Key JSON is missing required fields (client_email or private_key).');
        throw new Error('Server configuration error: Incomplete Google API credentials.');
    }

    const scopes = ['https://www.googleapis.com/auth/calendar.events'];

    const jwtClientOptions = {
        email: key.client_email,
        key: key.private_key,
        scopes: scopes,
    };

    if (userToImpersonate) { // If DWD and impersonation is configured
        jwtClientOptions.subject = userToImpersonate;
        logger.debug(`Configuring JWT client to impersonate: ${userToImpersonate}`);
    }


    const jwtClient = new JWT(jwtClientOptions);

    try {
        logger.debug(`Authorizing Google API client for scopes: ${scopes.join(', ')}`);
        await jwtClient.authorize();
        if (userToImpersonate) {
            logger.info(`Google API JWT client authorized successfully for Calendar via DWD, impersonating ${userToImpersonate}.`);
        } else {
            logger.info('Google API JWT client authorized successfully for Calendar using service account key.');
        }
        return jwtClient;
    } catch (authError) {
        logger.error('Google API JWT client authorization failed:', {
            errorMessage: authError.message,
            errorCode: authError.code,
            errorDetails: authError.response?.data,
            stack: authError.stack
        });
        throw new Error(`Server could not authorize with Google Calendar API. Check Service Account permissions and key. Original error: ${authError.message}`);
    }
    */
};