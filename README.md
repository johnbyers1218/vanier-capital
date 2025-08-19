# fnd-automations-webapp

- Rich text editing uses TinyMCE; see AUTHORING_GUIDE.md for callout styles and content tips.

## Environment Variables

Core app vars and provider credentials are read from process.env. If using a .env file, add only what you need.

- PORT, NODE_ENV, MONGODB_URI, SESSION_SECRET
- SENDGRID_API_KEY, PUBLIC_SITE_URL, CORS_ORIGIN
- MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, MAILCHIMP_LIST_ID
- MAILCHIMP_FROM_EMAIL, MAILCHIMP_FROM_NAME
- MAILCHIMP_SYNC_ENABLED (optional; default false)

Notes:
- Set MAILCHIMP_SYNC_ENABLED="true" to propagate admin bulk Unsubscribe/Delete to Mailchimp. When omitted or falsey, bulk actions only affect the local database.