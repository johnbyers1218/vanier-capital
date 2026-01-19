
<div align="center">

# Vanier Capital - Real Estate Investment Platform

A proprietary CMS and Investor Relations portal designed to manage multifamily assets, track performance metrics, and facilitate capital raising operations.

</div>

## System Overview

This platform enables **Vanier Capital** to showcase its portfolio, capture investor interest through a regulated funnel, and manage content via a unified administrative dashboard.

### Core Architecture

-   **Stack**: Node.js (Express), MongoDB (Mongoose), EJS Templates, Tailwind CSS.
-   **Security**: Helmet, CSRF protection, RBAC (Admin/Public), and input sanitization.
-   **Infrastructure**: Stateless application design suited for Heroku/Containerized environments with MongoDB Atlas persistence.

### Domain Model

1.  **Property (Core Entity)**
    -   Represents a real estate asset (Multifamily/Single Family).
    -   Key Attributes: Financial metrics (NOI, Cap Rate, LTV, IRR), occupancy status, gallery images, and location data.
2.  **Market**
    -   Defines geographic investment focus areas (e.g., "Southeast", "Sun Belt").
    -   Used for portfolio categorization and strategic analysis.
3.  **Article**
    -   Content management for investment theses, market updates, and quarterly reports.

---

## 🚀 Quick Start

### Prerequisites
-   Node.js v18+
-   MongoDB instance (Local or Atlas connection string)

### Installation

1.  **Clone & Install**
    ```bash
    git clone https://github.com/johnbyers1218/vanier-capital-webapp.git
    cd vanier-capital-webapp
    npm install
    ```

2.  **Configuration**
    Duplicate `.env.example` to `.env` and configure the essential variables (see below).

3.  **Build Styles**
    ```bash
    npm run build:public-css:once
    ```

4.  **Run Application**
    ```bash
    npm start
    ```

---

## ⚙️ Environment Configuration

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` or `production` |
| `PORT` | Application port (default: 3000) |
| `MONGODB_URI` | Connection string for MongoDB Atlas or local instance |
| `SESSION_SECRET` | Strong secret for session signing |
| `SENDGRID_API_KEY` | For transactional emails (Welcome, Reset Password) |
| `INVESTOR_CLUB_NOTIFY_EMAIL` | Recipient for new investor application alerts |
| `CLOUDINARY_URL` | (Optional) CDN for property image management |

---

## 🛠️ NPM Scripts

| Script | Description |
| --- | --- |
| `npm start` | Launch production server |
| `npm run dev` | Development mode with auto-reload (Nodemon) |
| `npm run build:css` | Watch and compile Tailwind CSS changes |
| `npm test` | Run functionality and unit tests (Jest) |
| `npm run setup-admin` | Create an initial admin user (Development only) |

---

## 🚢 Deployment

This application is **Heroku-ready**.

1.  **Provision Database**: Create a cluster on MongoDB Atlas.
2.  **Configure Environment**: Set the `MONGODB_URI` and `SESSION_SECRET` in your hosting provider's config vars.
3.  **Deploy**:
    ```bash
    git push heroku main
    ```
4.  **Scale**: Ensure at least one web dynamo is active.

---

© 2025 Vanier Capital, LLC. All rights reserved.