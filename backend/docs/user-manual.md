# Blackbox BOM Management Tool — User Manual

## 1. Getting Started

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd "bom tool/backend"

# Install Python dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### First Run

1. Navigate to `http://localhost:3000` in your browser.
2. Register a new account, or seed an admin account by setting the `SEED_ADMIN_PASSWORD`
   environment variable (and optionally `SEED_ADMIN_EMAIL`) before running `python seed_db.py`.
   There is no built-in default password — if `SEED_ADMIN_PASSWORD` is unset, no admin is created,
   and seeding is refused entirely in production environments.
3. You will be prompted to change the password on first login.

### Login

- Navigate to the login page.
- Enter your email and password.
- Optionally use SSO (Google, GitHub, Microsoft) if configured by your administrator.
- Sessions persist for 8 hours; refresh tokens last 30 days.

---

## 2. Dashboard Overview

The dashboard provides a real-time summary of your BOM operations:

- **Parts Summary** — Total parts, by category, by status.
- **BOM Overview** — Active BOMs, recent changes, revision history.
- **Procurement Status** — Open POs, pending approvals, delivery ETA.
- **Cost Insights** — Total BOM cost trends, price change alerts.
- **Recent Activity** — Audit log feed of recent actions across the system.
- **AI Recommendations** — Interchangeability suggestions, demand forecasts.

---

## 3. BOM Management

### Creating a BOM

1. Navigate to **Projects** and select or create a project.
2. Click **New BOM** or **Add BOM Template**.
3. Add parts from the Component Library or create new parts inline.
4. Set quantities, reference designators, and notes per line item.
5. Save the BOM. A revision is automatically created.

### Editing a BOM

- Open the BOM and click **Edit**.
- Add, remove, or reorder line items.
- Changes create a new revision snapshot automatically.
- Use **Compare** to diff two revisions side by side.

### Versioning

- Each save increments the revision (A, B, C...).
- Revisions store a full JSON snapshot of the BOM structure.
- Previous revisions are read-only for audit compliance.
- Click **View History** to see all revisions with timestamps and authors.

### Comparing BOMs

1. Select two BOM revisions.
2. Click **Compare**.
3. View a diff showing added, removed, and changed line items.
4. Export the comparison as PDF or CSV.

---

## 4. Component Library

### Adding Parts

1. Navigate to **Parts** in the sidebar.
2. Click **New Part** and fill in required fields:
   - Part Number (unique, required)
   - Name (required)
   - Category, Description, Vendor, Manufacturer
3. Add optional fields: MPN, HTS code, ECCN, barcode, dimensions.
4. Save the part.

### Vendors

1. Navigate to **Vendors**.
2. Add vendor details: name, country, contact, lead time, MOQ, reliability rating.
3. Link vendors to parts via **Part-Vendors** with vendor-specific pricing and lead times.

### Pricing

- Track cost, freight, tax, and landed cost per part.
- View price history charts over time.
- Set up vendor-specific pricing with volume tiers.
- Use **Should-Cost Analysis** to estimate fair pricing.

---

## 5. Procurement

### PO Workflow

1. Navigate to **Procurement** or **PO Orders**.
2. Create a new PO by selecting parts and vendors.
3. Set quantity, unit cost, and ETA.
4. Submit for approval if required.
5. Track status: Not Ordered → RFQ Sent → Ordered → In Transit → Received → Approved.

### Vendor Management

- Rate suppliers via **Supplier Scorecards** (quality, delivery, cost, responsiveness).
- Manage contracts and pricing agreements.
- Track vendor reliability over time.

### Cost Tracking

- View total spend by vendor, project, and time period.
- Compare actual vs. should-cost per part.
- Export procurement reports to CSV/PDF.

---

## 6. Documents & PDM

### Uploading Documents

1. Navigate to **Documents**.
2. Click **Upload** and select files (PDF, DOCX, XLSX, CAD files, images).
3. Categorize: datasheet, drawing, CAD, invoice, certificate.
4. Link to parts, projects, or POs.

### Organizing

- Tag documents for searchability.
- Set access levels: public, private, restricted.
- Version documents — upload new versions while retaining history.

### CAD Vault

- Upload STEP, IGES, SolidWorks files via the **CAD** module.
- CAD files are linked to parts and stored in S3/MinIO.
- Download directly from the part detail view.

---

## 7. Analytics

### Dashboards

- **BOM Cost Trends** — Track cost changes over time.
- **Parts by Category** — Pie/bar charts of your parts inventory.
- **Procurement Pipeline** — PO status funnel.
- **Vendor Performance** — Scorecard trends.
- **AI Insights** — Demand forecasts, interchangeability recommendations.

### Reports

- Generate CSV/PDF exports from any data view.
- Custom report builder for KPIs and summaries.
- Schedule recurring reports via the API.

### KPIs

- Average lead time by category.
- BOM cost variance from estimates.
- On-time delivery rate by vendor.
- Parts with no supplier assigned (risk flag).

---

## 8. AI Features

### Demand Forecasting

- View AI-predicted demand quantities per part.
- Confidence scores indicate prediction reliability.
- Based on historical PO data and usage patterns.

### Interchangeability

- AI suggests alternative parts based on specifications.
- Review and accept/reject suggestions.
- Accepted interchanges are added as alternate vendors.

### Validation

- Automated BOM validation rules check for:
  - Missing vendor assignments
  - Duplicate part numbers
  - Cost anomalies
  - Lead time risks
- Results shown per part with severity levels.

---

## 9. Administration

### Users & Roles

- Navigate to **Admin → Users** to manage accounts.
- Assign roles: Admin, Engineering, Procurement, Finance, Viewer.
- Roles control access to modules and actions.

### Settings

- Configure SSO providers (Google, GitHub, Microsoft).
- Set rate limits, encryption keys, and storage endpoints.
- Manage API keys and webhook subscriptions.

---

## 10. Troubleshooting

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Expired or invalid token | Re-login or refresh token |
| `429 Too Many Requests` | Rate limit exceeded | Wait 1 minute, reduce request frequency |
| `404 Not Found` | Invalid resource ID | Verify the resource exists |
| `500 Internal Server Error` | Server-side issue | Check server logs, contact admin |

### FAQ

**Q: Can I import parts from Excel?**
A: Yes. Navigate to **Import** and upload a CSV/XLSX file. Map columns to part fields using the mapping wizard.

**Q: How do I restore a deleted part?**
A: Deleted parts are soft-deleted. Contact your administrator to restore from the audit log.

**Q: Can I use the API without the UI?**
A: Yes. Full REST API documentation is available at `/api/docs` (Swagger UI) and `/api/redoc` (ReDoc).

---

## 11. API Reference

Interactive API documentation is available at:

- **Swagger UI**: `http://localhost:8000/api/docs`
- **ReDoc**: `http://localhost:8000/api/redoc`
- **OpenAPI JSON**: `http://localhost:8000/api/v1/openapi.json`

All endpoints require JWT authentication via `Authorization: Bearer <token>`.
