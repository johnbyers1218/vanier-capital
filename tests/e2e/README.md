# E2E testing with Playwright

- Requires a reachable admin account for login. Provide env vars before running:
  - E2E_ADMIN_USER
  - E2E_ADMIN_PASS

- The Playwright webServer starts the app in NODE_ENV=test with an in-memory MongoDB (USE_IN_MEMORY_DB=1).
- You can seed an admin in your real DB with `npm run setup-admin` for development.
