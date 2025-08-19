# FND Automations Website Architecture & System Overview

## Executive Summary
FND Automations is a professional Node.js/Express web application featuring a public-facing website and comprehensive admin CMS. The platform showcases automation services, manages blog content, handles client inquiries, and provides secure administrative controls for content management.

## Technology Stack

### Core Framework
- **Backend**: Node.js 18/20 with Express.js (ESM modules)
- **Database**: MongoDB with Mongoose ODM
- **Template Engine**: EJS for server-side rendering
- **Styling**: Custom CSS with CSS custom properties + Tailwind CSS
- **Security**: Helmet, CORS, Rate Limiting, CSRF protection
- **Authentication**: Session-based auth with bcrypt password hashing

### Key Dependencies
```json
{
  "express": "^4.19.2",
  "mongoose": "^8.4.0",
  "ejs": "^3.1.10",
  "bcryptjs": "^2.4.3",
  "helmet": "^7.1.0",
  "express-session": "^1.18.0",
  "multer": "^1.4.5-lts.1",
  "cloudinary": "^2.2.0",
  "nodemailer": "^6.9.13",
  "winston": "^3.13.0"
}
```

## Application Architecture

### File Structure
```
fnd-automations/
├── app.js                    # Main application entry point
├── package.json              # Dependencies and scripts
├── setupAdmin.js            # Admin user creation utility
├── config/
│   └── logger.js            # Winston logging configuration
├── middleware/
│   ├── isAdmin.js           # Admin authentication middleware
│   └── validateMongoId.js   # MongoDB ID validation
├── models/                  # Mongoose data models
│   ├── AdminUser.js         # Admin user accounts
│   ├── AdminLog.js          # Admin action logging
│   ├── BlogPost.js          # Blog content management
│   ├── Projects.js          # Portfolio projects
│   ├── Testimonials.js      # Client testimonials
│   └── Contacts.js          # Contact form submissions
├── routes/                  # Express route handlers
│   ├── publicRoutes.js      # Public website pages
│   ├── apiPublic.js         # Public API endpoints
│   ├── apiContact.js        # Contact form handling
│   └── admin/               # Admin panel routes
│       ├── adminAuth.js     # Admin login/logout
│       ├── adminDashboard.js # Admin dashboard
│       ├── adminBlog.js     # Blog management
│       ├── adminProjects.js # Project management
│       └── adminTestimonials.js # Testimonial management
├── views/                   # EJS templates
│   ├── *.ejs               # Public pages (index, about, blog, etc.)
│   ├── admin/              # Admin panel templates
│   └── partials/           # Reusable template components
├── public/                  # Static assets
│   ├── css/                # Stylesheets
│   ├── js/                 # Client-side JavaScript
│   └── images/             # Static images
└── utils/                   # Utility functions
    ├── adminUploads.js     # File upload handling
    ├── email.js            # Email service
    ├── googleAuth.js       # Google authentication
    └── helpers.js          # General utilities
```

## Data Models & Relationships

### AdminUser Model
```javascript
{
  username: String (unique, lowercase),
  password: String (bcrypt hashed),
  fullName: String,
  role: ['admin', 'editor'],
  lastLogin: Date,
  failedLoginAttempts: Number,
  lockUntil: Date
}
```

### BlogPost Model
```javascript
{
  title: String (unique),
  slug: String (unique, URL-friendly),
  content: String (HTML content),
  excerpt: String (preview text),
  author: ObjectId -> AdminUser,
  authorDisplayName: String (public display),
  isPublished: Boolean,
  publishedDate: Date,
  featuredImage: String (URL),
  tags: [String] (categories),
  metaDescription: String (SEO)
}
```

### Project Model
```javascript
{
  title: String,
  slug: String (unique),
  description: String (HTML content),
  excerpt: String (preview),
  category: String (automation, ai, etc.),
  image: String (URL),
  link: String (project URL),
  isFeatured: Boolean,
  isPubliclyVisible: Boolean,
  clientName: String,
  technologiesUsed: [String],
  projectDate: Date
}
```

### Testimonial Model
```javascript
{
  author: String,
  content: String,
  company: String,
  position: String,
  rating: Number (1-5),
  isFeatured: Boolean,
  isVisible: Boolean,
  project: ObjectId -> Project
}
```

### Contact Model
```javascript
{
  name: String,
  email: String (validated),
  phone: String (optional),
  subject: Enum ['General Inquiry', 'Service Information', ...],
  message: String,
  ipAddress: String,
  status: Enum ['New', 'Contacted', 'In Progress', ...]
}
```

### AdminLog Model
```javascript
{
  adminUser: ObjectId -> AdminUser,
  action: Enum ['login_success', 'create_project', ...],
  details: String,
  ipAddress: String,
  createdAt: Date
}
```

## Application Flow & Routing

### Public Routes (`/routes/publicRoutes.js`)
- `GET /` - Homepage with hero, services, featured content
- `GET /about` - About page with team information
- `GET /services` - Services overview
- `GET /projects` - Portfolio with filtering by category
- `GET /projects/:slug` - Individual project details
- `GET /blog` - Blog listing with tag-based filtering
- `GET /blog/:slug` - Individual blog post
- `GET /testimonials` - Client testimonials display
- `GET /contact` - Contact form page
- `GET /privacy-policy` - Privacy policy
- `GET /terms-of-service` - Terms of service

### API Routes
**Public API (`/routes/apiPublic.js`)**
- `GET /api/projects` - JSON projects data
- `GET /api/testimonials` - JSON testimonials data

**Contact API (`/routes/apiContact.js`)**
- `POST /api/contact` - Handle contact form submissions

### Admin Routes (`/routes/admin/`)
**Authentication (`adminAuth.js`)**
- `GET /admin/login` - Admin login form
- `POST /admin/login` - Process login
- `POST /admin/logout` - Logout and session cleanup

**Dashboard (`adminDashboard.js`)**
- `GET /admin` - Main dashboard with statistics

**Blog Management (`adminBlog.js`)**
- `GET /admin/blog` - List all blog posts
- `GET /admin/blog/add` - Add new blog post form
- `POST /admin/blog/add` - Create new blog post
- `GET /admin/blog/edit/:id` - Edit blog post form
- `POST /admin/blog/edit/:id` - Update blog post
- `DELETE /admin/blog/delete/:id` - Delete blog post
- `POST /admin/blog/upload-cover-image` - Upload featured images

**Project Management (`adminProjects.js`)**
- `GET /admin/projects` - List all projects
- `GET /admin/projects/add` - Add new project form
- `POST /admin/projects/add` - Create new project
- `GET /admin/projects/edit/:id` - Edit project form
- `POST /admin/projects/edit/:id` - Update project
- `DELETE /admin/projects/delete/:id` - Delete project
- `POST /admin/projects/upload-cover-image` - Upload project images

**Testimonial Management (`adminTestimonials.js`)**
- `GET /admin/testimonials` - List all testimonials
- `GET /admin/testimonials/add` - Add testimonial form
- `POST /admin/testimonials/add` - Create testimonial
- `GET /admin/testimonials/edit/:id` - Edit testimonial form
- `POST /admin/testimonials/edit/:id` - Update testimonial
- `DELETE /admin/testimonials/delete/:id` - Delete testimonial

## Security Implementation

### Authentication & Authorization
- **Session Management**: Express-session with MongoDB store
- **Password Security**: bcrypt with 10 salt rounds
- **Account Locking**: Failed login attempt tracking
- **Role-Based Access**: Admin vs Editor permissions
- **CSRF Protection**: Token-based form protection

### Input Validation & Sanitization
- **express-validator**: Server-side input validation
- **DOMPurify**: HTML content sanitization
- **MongoDB Injection**: Mongoose schema validation
- **XSS Prevention**: Helmet security headers

### File Upload Security
- **Multer**: Secure file handling
- **Cloudinary**: Cloud-based image storage
- **File Type Validation**: Image format restrictions
- **Size Limits**: Upload size constraints

## Content Management Features

### Rich Text Editing
- **TinyMCE Integration**: WYSIWYG editor for blog/project content
- **HTML Sanitization**: DOMPurify for safe content storage
- **Image Uploads**: Cloudinary integration for media management

### SEO Optimization
- **Dynamic Meta Tags**: Page-specific titles and descriptions
- **URL Slugs**: SEO-friendly URLs for content
- **Structured Data**: Schema markup for search engines
- **Sitemap**: XML sitemap generation

### Content Organization
- **Tagging System**: Categorization for blog posts
- **Project Categories**: Automation, AI, etc.
- **Featured Content**: Homepage showcasing
- **Visibility Controls**: Public/private content management

## Frontend Architecture

### Template System
- **EJS Templating**: Server-side rendering with partials
- **Responsive Design**: Mobile-first CSS approach
- **Component Reuse**: Header, footer, pagination partials
- **Dynamic Content**: Database-driven page generation

### Styling Framework
- **Custom CSS**: Brand-specific design system
- **CSS Custom Properties**: Consistent theming
- **Glass-morphism**: Modern UI effects
- **Responsive Breakpoints**: Mobile/tablet/desktop support

### Interactive Features
- **Filter Systems**: JavaScript-powered content filtering
- **Form Validation**: Client and server-side validation
- **Image Optimization**: Lazy loading and responsive images
- **Smooth Animations**: CSS transitions and transforms

## Database Design

### Indexing Strategy
```javascript
// Performance-optimized indexes
BlogPost.index({ isPublished: 1, publishedDate: -1 });
Project.index({ category: 1, isFeatured: -1 });
Testimonial.index({ isVisible: 1, isFeatured: -1 });
AdminLog.index({ adminUser: 1, createdAt: -1 });
```

### Relationships
- **Blog Posts** → Admin Users (author relationship)
- **Testimonials** → Projects (optional association)
- **Admin Logs** → Admin Users (action tracking)
- **Soft Deletes**: isVisible/isPublished flags instead of deletion

## Deployment & Environment

### Environment Configuration
- **Development**: `.env.development` for local setup
- **Production**: Heroku Config Vars
- **Database**: MongoDB Atlas cloud hosting
- **File Storage**: Cloudinary for images
- **Email**: Nodemailer for contact form notifications

### Logging & Monitoring
- **Winston Logger**: Structured logging with levels
- **Admin Action Tracking**: Comprehensive audit trail
- **Error Handling**: Global error handlers
- **Request Logging**: HTTP request/response tracking

## Email & Communication

### Contact Form System
- **Form Validation**: Multi-layer input validation
- **Email Notifications**: Nodemailer integration
- **Admin Notifications**: New contact alerts
- **Status Tracking**: Lead management workflow

### Potential Integrations
- **Google Calendar**: Consultation scheduling
- **CRM Integration**: Lead management
- **Email Marketing**: Newsletter subscriptions

## Performance & Optimization

### Caching Strategy
- **Static Assets**: Long-term browser caching
- **Database Queries**: Mongoose lean() queries
- **Session Storage**: MongoDB session store
- **Image Optimization**: Cloudinary transformations

### Security Headers
```javascript
// Helmet security configuration
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      scriptSrc: ["'self'", "cdn.tiny.cloud"],
      imgSrc: ["'self'", "data:", "res.cloudinary.com"]
    }
  }
})
```

## Development Workflow

### Scripts & Commands
```bash
npm start          # Production server
npm run dev        # Development with nodemon
npm run setup-admin # Create admin user
npm run build:css   # Compile Tailwind CSS
```

### Code Organization
- **ESM Modules**: Modern JavaScript imports/exports
- **Separation of Concerns**: Models, routes, views, utilities
- **Error Handling**: Comprehensive try-catch blocks
- **Code Documentation**: Inline comments and JSDoc

This architecture provides a robust foundation for content management, secure administration, and scalable business growth while maintaining professional standards and modern web development practices.
