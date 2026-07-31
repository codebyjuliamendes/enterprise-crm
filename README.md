# Enterprise CRM

![NodeJS](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)

A robust, enterprise-grade Customer Relationship Management (CRM) built with an unyielding focus on Clean Architecture, ACID-compliant transactions, and a beautiful Tailwind CSS design system.

---

## 🏗️ Architecture

```mermaid
graph TD
    Client[Client Browser / Tailwind CSS]
    Router[Express Router]
    Auth[Auth Middleware]
    Controller[Controllers & Validation]
    DBHelper[Database Helper]
    SQLite[(SQLite DB)]

    Client -->|HTTP GET/POST| Router
    Router --> Auth
    Auth --> Controller
    Controller --> DBHelper
    DBHelper --> SQLite
```

## ✨ Built With
- **Frontend:** Vanilla JS, HTML5, and **Tailwind CSS** (via CDN for rapid prototyping and zero-build overhead). Glassmorphism UI patterns and responsive design natively built in.
- **Backend:** Node.js, Express.js.
- **Database:** `sql.js` (SQLite in-memory/file).
- **Security:** `helmet` for headers, `express-rate-limit`, bcrypt for password hashing, and JWT for stateless authentication.

## 🧠 Why & Trade-Offs
- **Tailwind CSS via CDN:** Chosen for zero-configuration, immediate UI iteration, and stripping away redundant `style.css` complexity. *Trade-off:* Slightly heavier initial HTML load and missing PurgeCSS for production. Ideal for proof-of-concept enterprise dashboards.
- **Synchronous SQLite (`sql.js`):** Ensures absolute predictability for small datasets and guarantees ACID properties strictly through manual rollback/commit mechanisms. *Trade-off:* Blocks the Node.js event loop on large queries. Fits well for single-tenant ERP solutions but requires scaling (e.g., PostgreSQL) for heavy concurrency.
- **Centralized Error Handling:** All controllers are wrapped in custom `asyncHandler` or `syncHandler` interceptors that pipe errors directly into Express's error middleware. *Trade-off:* Minor boilerplate in controller exports, but guarantees a 100% leak-proof HTTP response cycle.

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run the Server**
   ```bash
   npm start
   ```

3. **Access the Application**
   Navigate to `http://localhost:3000` in your web browser.

### Default Accounts
- **Admin:** `admin@crm.com` / `admin123`
- **Manager:** `manager@crm.com` / `admin123`
- **Sales:** `sales@crm.com` / `admin123`
- **Viewer:** `viewer@crm.com` / `admin123`

## ?? V3 Upgrades
- **Audit Log Transactional All-or-Nothing:** Audit logs are fully integrated inside the main controllers' transactions. In case of an audit failure, the whole transaction rolls back, guaranteeing data consistency.
- **LGPD Kill Switch:** A new path /api/lgpd/anonymize provides an instant PII hashing capability to immediately comply with data erasure protocols.
- **Async Controllers:** Implemented  syncHandler in controllers.

## 🚀 V4 Upgrades
- **Kubernetes Ready:** Added `k8s/` directory with Deployment, Service, and Ingress manifests for scalable orchestration on Port 3004.
- **CI/CD Pipelines:** Integrated GitHub Actions workflow (`.github/workflows/ci-cd.yml`) for automated testing and Docker image validation.
- **Swagger Documentation:** Automatically generated OpenAPI Swagger specification available at `/api-docs` to ease developer onboarding.
- **Health Checks:** Added a dedicated `/health` probe endpoint for container lifecycle management.
