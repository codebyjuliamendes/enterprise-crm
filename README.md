# Enterprise-Ready Mini CRM/ERP

## The Why
This project demonstrates an enterprise-grade Mini CRM/ERP system with multi-layer security, robust Role-Based Access Control (RBAC), ACID-compliant database operations, and an append-only audit trail necessary for regulatory conformance like SOC2 and GDPR. It serves as a blueprint for building scalable, secure, and maintainable internal tools.

## Architecture Diagram

\`\`\`mermaid
graph TD
    Client[Web Client Vanilla JS] -->|HTTPS Requests| Router[Express Router]
    Router --> AuthMiddleware{JWT Auth & RBAC}
    AuthMiddleware -->|Approved| Controllers[Controllers]
    AuthMiddleware -->|Rejected| 403[403 Forbidden]
    Controllers --> Services[Transaction Manager]
    Controllers --> Audit[Audit Logger Middleware]
    Services --> DB[(SQLite - WAL Mode)]
    Audit --> DB
\`\`\`

## Trade-offs
- **JWT vs Sessions**: JWT chosen for stateless scalability and simpler token-based API authentication.
- **RBAC vs ABAC**: Role-Based Access Control is simpler to implement and reason about for a small-to-medium business app compared to complex Attribute-Based rules.
- **SQLite vs PostgreSQL**: SQLite with WAL (Write-Ahead Logging) mode and STRICT transactions is used for demo portability and zero-configuration while still demonstrating true ACID compliance.
- **Append-only Audit Logs**: Hard deletes are permitted on entities for GDPR, but audit logs are append-only to preserve the historical record of *who* deleted the data.

## Quick Start

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the server:
   \`\`\`bash
   npm start
   \`\`\`

3. Navigate to \`http://localhost:3000\`

### Default Credentials
The database automatically seeds with the following users (Password for all: \`admin123\`):
- **Admin**: admin@crm.com
- **Manager**: manager@crm.com
- **Sales**: sales@crm.com
- **Viewer**: viewer@crm.com

## Permission Matrix

| Feature | Admin | Manager | Sales | Viewer |
| :--- | :---: | :---: | :---: | :---: |
| View Dashboard | ✅ | ✅ | ✅ | ✅ |
| View Contacts/Deals | ✅ (All) | ✅ (All) | ✅ (Own) | ✅ (All) |
| Create Contacts/Deals | ✅ | ✅ | ✅ | ❌ |
| View Audit Logs | ✅ | ❌ | ❌ | ❌ |

## Audit Trail Documentation
The system implements a transparent `auditLog` middleware that automatically captures state changes. 
- **What gets logged**: `CREATE`, `UPDATE`, `DELETE` operations on core entities.
- **Fields captured**: User ID, Action Type, Entity Type, Entity ID, Timestamp, New State (JSON).
- **Compliance**: The `audit_logs` table does not allow updates, ensuring historical integrity.
