# Blackbox BOM Management Tool — Data Dictionary

## Module: Parts

### Table: `parts`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `pn` | VARCHAR | No | — | Part number (unique, indexed) |
| `name` | VARCHAR | No | — | Part name |
| `description` | TEXT | Yes | NULL | Part description |
| `rev` | VARCHAR | Yes | 'A' | Revision letter |
| `qty` | INTEGER | Yes | 1 | Default quantity |
| `uom` | VARCHAR | Yes | 'EA' | Unit of measure |
| `category` | VARCHAR | Yes | NULL | Category (Electrical, Mechanical, etc.) (indexed) |
| `subCategory` | VARCHAR | Yes | NULL | Sub-category (Enclosure, Power Supply, etc.) |
| `mpn` | VARCHAR | Yes | NULL | Manufacturer Part Number (indexed) |
| `htsCode` | VARCHAR | Yes | NULL | Harmonized Tariff Schedule code |
| `unspscCode` | VARCHAR | Yes | NULL | UNSPSC code |
| `eccn` | VARCHAR | Yes | NULL | Export Control Classification Number |
| `vendor` | VARCHAR | Yes | NULL | Vendor name (indexed) |
| `manufacturer` | VARCHAR | Yes | NULL | Manufacturer name (indexed) |
| `cost` | FLOAT | Yes | 0.0 | Unit cost |
| `lead` | INTEGER | Yes | 0 | Lead time in days |
| `origin` | VARCHAR | Yes | NULL | Country of origin |
| `status` | VARCHAR | Yes | 'Released' | Lifecycle status (Draft, Review, Released, Deprecated, Obsolete, Archived) |
| `assembly` | BOOLEAN | Yes | false | Whether this part has children (is a BOM) |
| `barcode` | VARCHAR | Yes | NULL | Barcode (unique, indexed) |
| `material` | VARCHAR | Yes | NULL | Material description |
| `weight` | FLOAT | Yes | NULL | Weight in grams |
| `dimensions` | VARCHAR | Yes | NULL | L x W x H format |
| `imageUrl` | VARCHAR | Yes | NULL | URL to product image |
| `customFields` | JSON | Yes | {} | Custom field values |
| `tags` | TEXT | Yes | NULL | Comma-separated tags |
| `compliance` | TEXT | Yes | NULL | Comma-separated compliance standards |
| `freight` | FLOAT | Yes | 0.0 | Freight cost |
| `tax` | FLOAT | Yes | 0.0 | Tax cost |
| `landedCost` | FLOAT | Yes | 0.0 | Total landed cost |
| `countryHistory` | JSON | Yes | [] | Country history JSON array |
| `vendorPrices` | JSON | Yes | [] | Vendor pricing history JSON array |
| `cadUrl` | VARCHAR | Yes | NULL | Path or URL to CAD file |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Has many `bom_items` (BomItem.part)
- Has many `documents` (Document.part)
- Has many `purchase_orders` (PurchaseOrder.part)
- Has many `vendor_links` (PartVendor.part)
- Has many `price_history` (PriceHistory.part)
- Has many `capas` (CAPA.part)
- Has many `fai_reports` (FAIReport.part)
- Has many `deviations` (Deviation.part)
- Has many `make_vs_buy_analyses` (MakeVsBuyAnalysis.part)
- Has many `should_cost_models` (ShouldCostModel.part)
- Has many `demand_forecasts` (DemandForecast.part)
- Has many `serial_numbers` (SerialNumber.part)
- Has many `lot_batches` (LotBatch.part)
- Has many `kanban_triggers` (KanbanTrigger.part)
- Has many `pricing_agreements` (PricingAgreement.part)

### Table: `tags`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `name` | VARCHAR | No | — | Tag name (unique, indexed) |
| `description` | TEXT | Yes | NULL | Tag description |
| `isActive` | BOOLEAN | Yes | true | Whether tag is active |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

### Table: `part_tags` (Association)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `part_id` | INTEGER | No | FK → parts.id |
| `tag_id` | INTEGER | No | FK → tags.id |

### Table: `compliance`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `name` | VARCHAR | No | — | Compliance standard name (unique, indexed) |
| `description` | TEXT | Yes | NULL | Description |
| `isActive` | BOOLEAN | Yes | true | Whether active |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

### Table: `part_compliance` (Association)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `part_id` | INTEGER | No | FK → parts.id |
| `compliance_id` | INTEGER | No | FK → compliance.id |

---

## Module: BOMs

### Table: `bom_templates`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `name` | VARCHAR | No | — | BOM template name (indexed) |
| `description` | TEXT | Yes | NULL | BOM description |
| `bomData` | JSON | Yes | NULL | Full BOM tree structure |
| `partCount` | INTEGER | Yes | 0 | Total parts in BOM |
| `projectCode` | VARCHAR | Yes | NULL | Optional project code link |
| `createdById` | INTEGER | No | — | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `User` (createdBy)
- Has many `bom_items` (BomItem.bom_template)

### Table: `bom_items`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `bomTemplateId` | INTEGER | No | — | FK → bom_templates.id |
| `partId` | INTEGER | No | — | FK → parts.id |
| `quantity` | INTEGER | Yes | 1 | Quantity needed |
| `referenceDesignator` | VARCHAR | Yes | NULL | Ref designator (e.g. R1, C5) |
| `notes` | TEXT | Yes | NULL | Line item notes |
| `sortOrder` | INTEGER | Yes | 0 | Display order |
| `parentItemId` | INTEGER | Yes | NULL | FK → bom_items.id (sub-BOM hierarchy) |
| `unitCostSnapshot` | FLOAT | Yes | NULL | Cost at BOM creation time |
| `extendedCost` | FLOAT | Yes | NULL | quantity × unit cost |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `BomTemplate` (bom_template)
- Belongs to `Part` (part)
- Self-referential: has many children, belongs to parent (BomItem)

### Table: `revisions`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `entityType` | VARCHAR | Yes | NULL | Entity type (part, project, bom) |
| `entityId` | INTEGER | No | — | Entity ID |
| `revisionNumber` | VARCHAR | No | — | Revision label (A, B, v1.0) |
| `revisionLabel` | VARCHAR | Yes | NULL | Human-readable label |
| `description` | TEXT | Yes | NULL | What changed |
| `bomSnapshot` | JSON | Yes | NULL | BOM structure snapshot |
| `createdById` | INTEGER | No | — | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `User` (createdBy)

---

## Module: Vendors

### Table: `vendors`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `name` | VARCHAR | No | — | Vendor name (unique, indexed) |
| `country` | VARCHAR | Yes | NULL | Country |
| `contactEmail` | VARCHAR | Yes | NULL | Contact email |
| `contactPhone` | VARCHAR | Yes | NULL | Contact phone |
| `address` | TEXT | Yes | NULL | Physical address |
| `leadTime` | INTEGER | Yes | 0 | Average lead time in days |
| `moq` | INTEGER | Yes | 1 | Minimum Order Quantity |
| `terms` | VARCHAR | Yes | NULL | Payment terms (Net 30, etc.) |
| `reliabilityRating` | FLOAT | Yes | 0.0 | 0-5 reliability scale |
| `notes` | TEXT | Yes | NULL | Notes |
| `active` | BOOLEAN | Yes | true | Whether vendor is active |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Has many `part_links` (PartVendor.vendor)
- Has many `purchase_orders` (PurchaseOrder.vendor)
- Has many `price_history` (PriceHistory.vendor)
- Has many `contracts` (Contract.vendor)
- Has many `scorecards` (SupplierScorecard.vendor)
- Has many `capas` (CAPA.vendor)
- Has many `lot_batches` (LotBatch.vendor)
- Has many `kanban_triggers` (KanbanTrigger.preferredVendor)
- Has many `pricing_agreements` (PricingAgreement.vendor)

### Table: `part_vendors`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `partId` | INTEGER | No | — | FK → parts.id (indexed) |
| `vendorId` | INTEGER | No | — | FK → vendors.id (indexed) |
| `isPreferred` | BOOLEAN | Yes | false | Preferred vendor for this part |
| `isAlternate` | BOOLEAN | Yes | false | Alternate/backup vendor |
| `vendorPn` | VARCHAR | Yes | NULL | Vendor's part number |
| `vendorCost` | FLOAT | Yes | NULL | Vendor-specific price |
| `vendorLead` | INTEGER | Yes | NULL | Vendor-specific lead time |
| `vendorMoq` | INTEGER | Yes | NULL | Vendor-specific MOQ |
| `qualityScore` | FLOAT | Yes | 5.0 | 0-5 quality score |
| `onTimeRate` | FLOAT | Yes | 100.0 | On-time delivery percentage |
| `notes` | VARCHAR | Yes | NULL | Notes |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Vendor` (vendor)

### Table: `price_history`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `partId` | INTEGER | No | — | FK → parts.id |
| `vendorId` | INTEGER | Yes | NULL | FK → vendors.id |
| `price` | FLOAT | No | — | Price at this point in time |
| `currency` | VARCHAR | Yes | 'USD' | Currency code |
| `effectiveDate` | TIMESTAMPTZ | Yes | NULL | When price became effective |
| `source` | VARCHAR | Yes | NULL | Source (vendor_quote, market_data, etc.) |
| `sourceReference` | VARCHAR | Yes | NULL | Reference to source document |
| `recordedAt` | TIMESTAMPTZ | Yes | now() | When recorded |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Vendor` (vendor)

---

## Module: Purchase Orders

### Table: `purchase_orders`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `poNumber` | VARCHAR | No | — | PO number (unique, indexed) |
| `partId` | INTEGER | No | — | FK → parts.id |
| `vendorId` | INTEGER | No | — | FK → vendors.id |
| `qty` | INTEGER | No | — | Quantity ordered |
| `eta` | VARCHAR | Yes | NULL | Estimated Time of Arrival |
| `status` | VARCHAR | Yes | 'Not Ordered' | PO status |
| `unitCost` | FLOAT | Yes | NULL | Unit cost |
| `totalCost` | FLOAT | Yes | NULL | Total cost |
| `taxCost` | FLOAT | Yes | NULL | Tax amount |
| `freightCost` | FLOAT | Yes | NULL | Freight cost |
| `poReference` | VARCHAR | Yes | NULL | PO reference from vendor |
| `invoiceReference` | VARCHAR | Yes | NULL | Invoice number |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Vendor` (vendor)
- Has many `documents` (Document.purchaseOrder)
- Has many `serial_numbers` (SerialNumber.purchase_order)
- Has many `lot_batches` (LotBatch.purchase_order)

### Table: `po_headers`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `poNumber` | VARCHAR | No | — | PO number (unique, indexed) |
| `poDate` | VARCHAR | Yes | NULL | PO date (YYYY-MM-DD) |
| `vendorName` | VARCHAR | No | — | Vendor name |
| `project` | VARCHAR | Yes | NULL | Project name |
| `poTotal` | FLOAT | Yes | 0.0 | PO total |
| `status` | VARCHAR | Yes | NULL | Status |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Has many `po_line_items` (POLineItem.header)

### Table: `po_line_items`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `headerId` | INTEGER | No | — | FK → po_headers.id |
| `itemName` | TEXT | No | — | Item name |
| `itemDesc` | TEXT | Yes | NULL | Item description |
| `quantity` | INTEGER | Yes | 1 | Quantity |
| `itemPrice` | FLOAT | Yes | 0.0 | Unit price |
| `amount` | FLOAT | Yes | 0.0 | Amount |
| `gst` | FLOAT | Yes | 0.0 | GST |
| `total` | FLOAT | Yes | 0.0 | Total |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `POHeader` (header)

---

## Module: Projects

### Table: `projects`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `code` | VARCHAR | No | — | Project code (unique, indexed) |
| `name` | VARCHAR | No | — | Project name |
| `description` | TEXT | Yes | NULL | Description |
| `rev` | VARCHAR | Yes | 'A' | Project revision |
| `version` | VARCHAR | Yes | 'v1.0.0' | Semantic version |
| `status` | VARCHAR | Yes | 'Released' | Status (Draft, Review, Released, Deprecated, Archived) |
| `owner` | VARCHAR | Yes | NULL | Owner name |
| `updated` | TIMESTAMPTZ | Yes | NULL | Last updated timestamp |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Has many `documents` (Document.project)
- Has many `capas` (CAPA.project)
- Has many `fai_reports` (FAIReport.project)
- Has many `deviations` (Deviation.project)
- Has many `make_vs_buy_analyses` (MakeVsBuyAnalysis.project)

---

## Module: Documents

### Table: `documents`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `filename` | VARCHAR | No | — | Stored filename |
| `originalName` | VARCHAR | No | — | Original uploaded filename |
| `fileType` | VARCHAR | Yes | NULL | Extension or MIME type |
| `fileSize` | INTEGER | Yes | NULL | Size in bytes |
| `filePath` | VARCHAR | Yes | NULL | Path in storage system |
| `url` | VARCHAR | Yes | NULL | URL to access file |
| `category` | VARCHAR | Yes | NULL | Category (datasheet, cad, drawing, etc.) |
| `tags` | TEXT | Yes | NULL | Comma-separated tags |
| `partId` | INTEGER | Yes | NULL | FK → parts.id |
| `projectId` | INTEGER | Yes | NULL | FK → projects.id |
| `purchaseOrderId` | INTEGER | Yes | NULL | FK → purchase_orders.id |
| `isPublic` | BOOLEAN | Yes | false | Whether document is public |
| `accessLevel` | VARCHAR | Yes | 'private' | Access level (public, private, restricted) |
| `version` | INTEGER | Yes | 1 | Document version |
| `isLatest` | BOOLEAN | Yes | true | Whether this is the latest version |
| `replacesDocumentId` | INTEGER | Yes | NULL | FK → documents.id (self-ref) |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |
| `uploadedBy` | VARCHAR | Yes | NULL | User who uploaded |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Project` (project)
- Belongs to `PurchaseOrder` (purchaseOrder)
- Self-referential: replaces → Document

---

## Module: Users

### Table: `users`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `email` | VARCHAR | No | — | Email (unique, indexed) |
| `username` | VARCHAR | No | — | Username (unique, indexed) |
| `fullName` | VARCHAR | Yes | NULL | Full name |
| `hashedPassword` | VARCHAR | No | — | Hashed password |
| `isActive` | BOOLEAN | Yes | true | Whether account is active |
| `isSuperuser` | BOOLEAN | Yes | false | Whether user is superuser |
| `avatarUrl` | VARCHAR | Yes | NULL | Avatar URL |
| `department` | VARCHAR | Yes | NULL | Department |
| `jobTitle` | VARCHAR | Yes | NULL | Job title |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |
| `lastLoginAt` | TIMESTAMPTZ | Yes | NULL | Last login timestamp |

**Relationships:**
- Has many `sessions` (UserSession.user)
- Has many `audit_logs` (AuditLog.user)
- Has many `notifications` (Notification.user)
- Has many `comments` (Comment.user)
- Has many `bom_templates` (BomTemplate.createdBy)
- Has many `revisions_created` (Revision.createdBy)
- Has many `approvals_requested` (Approval.requestedBy)
- Has many `approvals_approved` (Approval.approvedBy)
- M2M with `roles` via `user_roles`

### Table: `roles`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `name` | VARCHAR | No | — | Role name (unique, indexed) |
| `description` | TEXT | Yes | NULL | Description |
| `isActive` | BOOLEAN | Yes | true | Whether role is active |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- M2M with `users` via `user_roles`
- M2M with `permissions` via `role_permissions`

### Table: `user_roles` (Association)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `user_id` | INTEGER | No | FK → users.id |
| `role_id` | INTEGER | No | FK → roles.id |

### Table: `permissions`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `name` | VARCHAR | No | — | Permission name (unique, indexed) |
| `resource` | VARCHAR | Yes | NULL | Resource type |
| `action` | VARCHAR | Yes | NULL | Action type |
| `description` | TEXT | Yes | NULL | Description |
| `isActive` | BOOLEAN | Yes | true | Whether active |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

### Table: `role_permissions` (Association)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `role_id` | INTEGER | No | FK → roles.id |
| `permission_id` | INTEGER | No | FK → permissions.id |

### Table: `user_sessions`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `userId` | INTEGER | No | — | FK → users.id |
| `sessionToken` | VARCHAR | No | — | Session token (unique, indexed) |
| `ipAddress` | VARCHAR | Yes | NULL | Client IP address |
| `userAgent` | VARCHAR | Yes | NULL | User agent string |
| `lastActivity` | TIMESTAMPTZ | Yes | now() | Last activity timestamp |
| `expiresAt` | TIMESTAMPTZ | No | — | Expiration timestamp |
| `isActive` | BOOLEAN | Yes | true | Whether session is active |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `User` (user)

---

## Module: Audit & Activity

### Table: `audit_logs`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `action` | VARCHAR | No | — | Action (CREATE, UPDATE, DELETE, LOGIN, LOGOUT) |
| `entityType` | VARCHAR | Yes | NULL | Entity type |
| `entityId` | INTEGER | Yes | NULL | Entity ID |
| `entityName` | VARCHAR | Yes | NULL | Human-readable entity name |
| `changes` | TEXT | Yes | NULL | JSON string of changes |
| `userId` | INTEGER | Yes | NULL | FK → users.id |
| `userEmail` | VARCHAR | Yes | NULL | User email (denormalized) |
| `userIp` | VARCHAR | Yes | NULL | Client IP |
| `timestamp` | TIMESTAMPTZ | Yes | now() | Action timestamp |
| `userAgent` | VARCHAR | Yes | NULL | User agent |
| `requestId` | VARCHAR | Yes | NULL | Request tracing ID |

**Relationships:**
- Belongs to `User` (user)

### Table: `notifications`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `title` | VARCHAR | No | — | Notification title |
| `message` | TEXT | No | — | Notification message |
| `type` | VARCHAR | Yes | 'info' | Type (info, warning, error, success) |
| `status` | VARCHAR | Yes | 'unread' | Status (unread, read, archived) |
| `entityType` | VARCHAR | Yes | NULL | Related entity type |
| `entityId` | INTEGER | Yes | NULL | Related entity ID |
| `userId` | INTEGER | No | — | FK → users.id |
| `actionUrl` | VARCHAR | Yes | NULL | URL for action button |
| `actionLabel` | VARCHAR | Yes | NULL | Text for action button |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `readAt` | TIMESTAMPTZ | Yes | NULL | When read |
| `expiresAt` | TIMESTAMPTZ | Yes | NULL | Expiration timestamp |

**Relationships:**
- Belongs to `User` (user)

### Table: `comments`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `content` | TEXT | No | — | Comment content |
| `entityType` | VARCHAR | Yes | NULL | Entity type (part, project, po, document) |
| `entityId` | INTEGER | No | — | Entity ID |
| `userId` | INTEGER | No | — | FK → users.id |
| `parentId` | INTEGER | Yes | NULL | FK → comments.id (threading) |
| `mentions` | TEXT | Yes | NULL | JSON array of mentioned user IDs |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `User` (user)
- Self-referential: has replies, belongs to parent

### Table: `approvals`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `title` | VARCHAR | No | — | Approval title |
| `description` | TEXT | Yes | NULL | Description |
| `type` | VARCHAR | No | — | Type (ecr, eco, ncr, capa, document, purchase) |
| `status` | VARCHAR | Yes | 'pending' | Status (pending, approved, rejected, cancelled) |
| `entityType` | VARCHAR | Yes | NULL | Entity type |
| `entityId` | INTEGER | No | — | Entity ID |
| `requestedById` | INTEGER | No | — | FK → users.id |
| `approvedById` | INTEGER | Yes | NULL | FK → users.id |
| `approvalComments` | TEXT | Yes | NULL | Comments on decision |
| `rejectionReason` | TEXT | Yes | NULL | Reason for rejection |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |
| `decidedAt` | TIMESTAMPTZ | Yes | NULL | When decided |
| `expiresAt` | TIMESTAMPTZ | Yes | NULL | Expiration timestamp |

**Relationships:**
- Belongs to `User` (requestedBy)
- Belongs to `User` (approvedBy)

---

## Module: Phase 3 — Supply Chain Depth

### Table: `make_vs_buy_analyses`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `partId` | INTEGER | No | — | FK → parts.id |
| `projectId` | INTEGER | Yes | NULL | FK → projects.id |
| `decision` | VARCHAR | No | — | Decision (Make, Buy, TBD) |
| `makeMaterialCost` | FLOAT | Yes | 0.0 | Make: material cost |
| `makeLaborCost` | FLOAT | Yes | 0.0 | Make: labor cost |
| `makeOverheadCost` | FLOAT | Yes | 0.0 | Make: overhead cost |
| `makeToolingCost` | FLOAT | Yes | 0.0 | Make: tooling cost |
| `makeTotalCost` | FLOAT | Yes | 0.0 | Make: total cost |
| `buyUnitPrice` | FLOAT | Yes | 0.0 | Buy: unit price |
| `buyNreCost` | FLOAT | Yes | 0.0 | Buy: non-recurring engineering |
| `buyTotalCost` | FLOAT | Yes | 0.0 | Buy: total cost |
| `qualityScore` | INTEGER | Yes | 5 | Quality score (1-10) |
| `leadTimeDays` | INTEGER | Yes | 0 | Lead time in days |
| `capacityScore` | INTEGER | Yes | 5 | Internal capacity (1-10) |
| `ipRiskScore` | INTEGER | Yes | 5 | IP protection risk (1-10) |
| `supplyRiskScore` | INTEGER | Yes | 5 | Supply risk (1-10) |
| `recommendation` | VARCHAR | Yes | NULL | AI/manual recommendation |
| `rationale` | TEXT | Yes | NULL | Rationale |
| `status` | VARCHAR | Yes | 'Draft' | Status (Draft, Submitted, Approved, Rejected) |
| `attachments` | JSON | Yes | [] | Attachment references |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `approvedBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Project` (project)

### Table: `should_cost_models`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `partId` | INTEGER | No | — | FK → parts.id |
| `rawMaterialCost` | FLOAT | Yes | 0.0 | Raw material cost |
| `materialWastePct` | FLOAT | Yes | 5.0 | Material waste percentage |
| `materialTotal` | FLOAT | Yes | 0.0 | Total material cost |
| `laborHours` | FLOAT | Yes | 0.0 | Labor hours |
| `laborRatePerHour` | FLOAT | Yes | 0.0 | Hourly rate |
| `laborTotal` | FLOAT | Yes | 0.0 | Total labor cost |
| `overheadPct` | FLOAT | Yes | 30.0 | Overhead percentage |
| `overheadTotal` | FLOAT | Yes | 0.0 | Total overhead |
| `toolingCost` | FLOAT | Yes | 0.0 | Tooling cost |
| `toolingAmortizedQty` | INTEGER | Yes | 1000 | Quantity to amortize over |
| `toolingPerUnit` | FLOAT | Yes | 0.0 | Tooling per unit |
| `profitMarginPct` | FLOAT | Yes | 15.0 | Profit margin percentage |
| `profitAmount` | FLOAT | Yes | 0.0 | Profit amount |
| `shouldCostPerUnit` | FLOAT | Yes | 0.0 | Calculated should-cost |
| `actualVendorPrice` | FLOAT | Yes | 0.0 | Actual vendor price |
| `variancePct` | FLOAT | Yes | 0.0 | Variance percentage |
| `notes` | TEXT | Yes | NULL | Notes |
| `Assumptions` | TEXT | Yes | NULL | Assumptions |
| `status` | VARCHAR | Yes | 'Draft' | Status (Draft, Active, Archived) |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)

### Table: `supplier_scorecards`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `vendorId` | INTEGER | No | — | FK → vendors.id |
| `period` | VARCHAR | No | — | Period (e.g., "2026-Q1") |
| `year` | INTEGER | No | — | Year |
| `quarter` | INTEGER | Yes | NULL | Quarter (1-4) |
| `qualityScore` | FLOAT | Yes | 0.0 | Quality score (0-100) |
| `deliveryScore` | FLOAT | Yes | 0.0 | Delivery score (0-100) |
| `costScore` | FLOAT | Yes | 0.0 | Cost score (0-100) |
| `responsivenessScore` | FLOAT | Yes | 0.0 | Responsiveness score (0-100) |
| `complianceScore` | FLOAT | Yes | 0.0 | Compliance score (0-100) |
| `qualityWeight` | FLOAT | Yes | 0.30 | Quality weight |
| `deliveryWeight` | FLOAT | Yes | 0.25 | Delivery weight |
| `costWeight` | FLOAT | Yes | 0.20 | Cost weight |
| `responsivenessWeight` | FLOAT | Yes | 0.15 | Responsiveness weight |
| `complianceWeight` | FLOAT | Yes | 0.10 | Compliance weight |
| `weightedScore` | FLOAT | Yes | 0.0 | Final weighted score |
| `grade` | VARCHAR | Yes | NULL | Grade (A, B, C, D, F) |
| `totalOrders` | INTEGER | Yes | 0 | Total orders in period |
| `onTimeDeliveries` | INTEGER | Yes | 0 | On-time deliveries |
| `defectCount` | INTEGER | Yes | 0 | Defect count |
| `totalUnitsReceived` | INTEGER | Yes | 0 | Total units received |
| `avgLeadTimeDays` | FLOAT | Yes | 0.0 | Average lead time |
| `avgResponseTimeHours` | FLOAT | Yes | 0.0 | Average response time |
| `trend` | VARCHAR | Yes | NULL | Trend (Improving, Stable, Declining) |
| `notes` | TEXT | Yes | NULL | Notes |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Vendor` (vendor)

### Table: `capas`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `capaNumber` | VARCHAR | No | — | CAPA number (unique) |
| `title` | VARCHAR | No | — | Title |
| `type` | VARCHAR | No | — | Type (Corrective, Preventive) |
| `source` | VARCHAR | Yes | NULL | Source |
| `problemDescription` | TEXT | No | — | Problem description |
| `immediateAction` | TEXT | Yes | NULL | Immediate action taken |
| `rootCauseMethod` | VARCHAR | Yes | NULL | Root cause method (5 Whys, Fishbone, FMEA) |
| `rootCause` | TEXT | Yes | NULL | Root cause |
| `correctiveAction` | TEXT | Yes | NULL | Corrective action |
| `preventiveAction` | TEXT | Yes | NULL | Preventive action |
| `actionOwner` | VARCHAR | Yes | NULL | Action owner |
| `targetDate` | TIMESTAMPTZ | Yes | NULL | Target completion date |
| `verificationMethod` | VARCHAR | Yes | NULL | Verification method |
| `verificationResult` | VARCHAR | Yes | NULL | Verification result |
| `verifiedBy` | INTEGER | Yes | NULL | FK → users.id |
| `verifiedDate` | TIMESTAMPTZ | Yes | NULL | Verification date |
| `status` | VARCHAR | Yes | 'Open' | Status (Open, In Progress, Pending Verification, Closed, Overdue) |
| `effectivenessCheckDate` | TIMESTAMPTZ | Yes | NULL | Effectiveness check date |
| `effectivenessResult` | VARCHAR | Yes | NULL | Effectiveness result |
| `partId` | INTEGER | Yes | NULL | FK → parts.id |
| `projectId` | INTEGER | Yes | NULL | FK → projects.id |
| `vendorId` | INTEGER | Yes | NULL | FK → vendors.id |
| `attachments` | JSON | Yes | [] | Attachment references |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Project` (project)
- Belongs to `Vendor` (vendor)
- Has many `deviations` (Deviation.capa)

### Table: `fai_reports`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `faiNumber` | VARCHAR | No | — | FAI number (unique) |
| `partId` | INTEGER | No | — | FK → parts.id |
| `projectId` | INTEGER | Yes | NULL | FK → projects.id |
| `partName` | VARCHAR | Yes | NULL | Part name |
| `partNumber` | VARCHAR | Yes | NULL | Part number |
| `partRevision` | VARCHAR | Yes | NULL | Part revision |
| `serialNumber` | VARCHAR | Yes | NULL | Serial number |
| `lotBatchNumber` | VARCHAR | Yes | NULL | Lot/batch number |
| `rawMaterial` | TEXT | Yes | NULL | Material certifications |
| `specialProcessSource` | TEXT | Yes | NULL | Special process suppliers |
| `characteristics` | JSON | Yes | [] | List of {name, nominal, tolerance, actual, pass} |
| `totalCharacteristics` | INTEGER | Yes | 0 | Total characteristics |
| `passedCharacteristics` | INTEGER | Yes | 0 | Passed count |
| `failedCharacteristics` | INTEGER | Yes | 0 | Failed count |
| `result` | VARCHAR | Yes | NULL | Result (Pass, Fail, Conditional) |
| `inspectorName` | VARCHAR | Yes | NULL | Inspector name |
| `inspectorApprovalDate` | TIMESTAMPTZ | Yes | NULL | Inspector approval date |
| `qualityApprovalDate` | TIMESTAMPTZ | Yes | NULL | Quality approval date |
| `customerApprovalDate` | TIMESTAMPTZ | Yes | NULL | Customer approval date |
| `status` | VARCHAR | Yes | 'Draft' | Status (Draft, In Progress, Pending Approval, Approved, Rejected) |
| `notes` | TEXT | Yes | NULL | Notes |
| `deviations` | TEXT | Yes | NULL | Deviation notes |
| `attachments` | JSON | Yes | [] | Attachment references |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Project` (project)

### Table: `deviations`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `deviationNumber` | VARCHAR | No | — | Deviation number (unique) |
| `title` | VARCHAR | No | — | Title |
| `type` | VARCHAR | No | — | Type (Deviation, Waiver, Concession) |
| `partId` | INTEGER | Yes | NULL | FK → parts.id |
| `projectId` | INTEGER | Yes | NULL | FK → projects.id |
| `specification` | TEXT | Yes | NULL | Specification being deviated from |
| `deviationDescription` | TEXT | No | — | Description of deviation |
| `impactAssessment` | TEXT | Yes | NULL | Impact assessment |
| `riskLevel` | VARCHAR | Yes | NULL | Risk level (Low, Medium, High, Critical) |
| `affectedQuantity` | INTEGER | Yes | 0 | Affected quantity |
| `affectedLotNumbers` | JSON | Yes | [] | Affected lot numbers |
| `requestType` | VARCHAR | Yes | NULL | Request type (One-time, Permanent, Temporary) |
| `expirationDate` | TIMESTAMPTZ | Yes | NULL | Expiration date |
| `engineeringApproval` | VARCHAR | Yes | NULL | Engineering approval |
| `qualityApproval` | VARCHAR | Yes | NULL | Quality approval |
| `customerApproval` | VARCHAR | Yes | NULL | Customer approval |
| `allApprovalsReceived` | VARCHAR | Yes | 'No' | All approvals received (Yes, No) |
| `disposition` | VARCHAR | Yes | NULL | Disposition (Use As Is, Rework, Scrap, Return to Vendor) |
| `status` | VARCHAR | Yes | 'Draft' | Status (Draft, Submitted, Under Review, Approved, Rejected, Expired) |
| `capaId` | INTEGER | Yes | NULL | FK → capas.id |
| `attachments` | JSON | Yes | [] | Attachment references |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Project` (project)
- Belongs to `CAPA` (capa)

### Table: `serial_numbers`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `serialNumber` | VARCHAR | No | — | Serial number (unique) |
| `partId` | INTEGER | No | — | FK → parts.id |
| `lotBatchNumber` | VARCHAR | Yes | NULL | Lot/batch number (indexed) |
| `poId` | INTEGER | Yes | NULL | FK → purchase_orders.id |
| `status` | VARCHAR | Yes | 'In Stock' | Status (In Stock, Installed, Consumed, Scrapped, Quarantine) |
| `currentLocation` | VARCHAR | Yes | NULL | Current location |
| `installedOnAsset` | VARCHAR | Yes | NULL | Asset it's installed on |
| `installationDate` | TIMESTAMPTZ | Yes | NULL | Installation date |
| `statusHistory` | JSON | Yes | [] | History: [{status, date, location, user}] |
| `incomingInspectionResult` | VARCHAR | Yes | NULL | Inspection result (Pass, Fail, Conditional) |
| `certificationUrl` | VARCHAR | Yes | NULL | Material cert URL |
| `manufactureDate` | TIMESTAMPTZ | Yes | NULL | Manufacture date |
| `expirationDate` | TIMESTAMPTZ | Yes | NULL | Expiration date |
| `receivedDate` | TIMESTAMPTZ | Yes | NULL | Received date |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `PurchaseOrder` (purchase_order)

### Table: `lot_batches`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `lotBatchNumber` | VARCHAR | No | — | Lot/batch number (unique) |
| `partId` | INTEGER | No | — | FK → parts.id |
| `vendorId` | INTEGER | Yes | NULL | FK → vendors.id |
| `poId` | INTEGER | Yes | NULL | FK → purchase_orders.id |
| `quantityReceived` | INTEGER | Yes | 0 | Quantity received |
| `quantityInspected` | INTEGER | Yes | 0 | Quantity inspected |
| `quantityAccepted` | INTEGER | Yes | 0 | Quantity accepted |
| `quantityRejected` | INTEGER | Yes | 0 | Quantity rejected |
| `manufactureDate` | TIMESTAMPTZ | Yes | NULL | Manufacture date |
| `receivedDate` | TIMESTAMPTZ | Yes | NULL | Received date |
| `expirationDate` | TIMESTAMPTZ | Yes | NULL | Expiration date |
| `incomingInspectionResult` | VARCHAR | Yes | NULL | Inspection result |
| `certificationUrl` | VARCHAR | Yes | NULL | Cert URL |
| `status` | VARCHAR | Yes | 'Received' | Status (Received, Inspected, Accepted, Rejected, Quarantine, Depleted) |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Vendor` (vendor)
- Belongs to `PurchaseOrder` (purchase_order)

### Table: `kanban_triggers`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `partId` | INTEGER | No | — | FK → parts.id |
| `minStock` | INTEGER | No | — | Reorder trigger level |
| `maxStock` | INTEGER | No | — | Order up to level |
| `reorderQuantity` | INTEGER | No | — | EOQ or fixed qty |
| `safetyStock` | INTEGER | Yes | 0 | Safety stock level |
| `currentStock` | INTEGER | Yes | 0 | Current stock level |
| `openOrderQty` | INTEGER | Yes | 0 | Quantities on order |
| `autoReorder` | BOOLEAN | Yes | false | Auto-reorder enabled |
| `preferredVendorId` | INTEGER | Yes | NULL | FK → vendors.id |
| `preferredPoTemplate` | VARCHAR | Yes | NULL | PO template |
| `status` | VARCHAR | Yes | 'Normal' | Status (Normal, Low, Critical, Overstock) |
| `active` | BOOLEAN | Yes | true | Whether trigger is active |
| `lastTriggeredAt` | TIMESTAMPTZ | Yes | NULL | Last triggered timestamp |
| `lastPoCreated` | VARCHAR | Yes | NULL | Last PO created |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Part` (part)
- Belongs to `Vendor` (preferredVendor)

### Table: `contracts`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `contractNumber` | VARCHAR | No | — | Contract number (unique) |
| `title` | VARCHAR | No | — | Title |
| `vendorId` | INTEGER | No | — | FK → vendors.id |
| `contractType` | VARCHAR | Yes | NULL | Type (Blanket PO, Volume Discount, LTA, NDA) |
| `effectiveDate` | TIMESTAMPTZ | Yes | NULL | Effective date |
| `expirationDate` | TIMESTAMPTZ | Yes | NULL | Expiration date |
| `autoRenew` | BOOLEAN | Yes | false | Auto-renew |
| `paymentTerms` | VARCHAR | Yes | NULL | Payment terms |
| `minimumOrderQty` | INTEGER | Yes | NULL | Minimum order quantity |
| `maximumOrderValue` | FLOAT | Yes | NULL | Maximum order value |
| `currency` | VARCHAR | Yes | 'USD' | Currency |
| `pricingTiers` | JSON | Yes | [] | Pricing tiers array |
| `partIds` | JSON | Yes | [] | List of covered part IDs |
| `leadTimeDays` | INTEGER | Yes | NULL | Lead time SLA |
| `qualityRequirements` | TEXT | Yes | NULL | Quality requirements |
| `status` | VARCHAR | Yes | 'Draft' | Status (Draft, Active, Suspended, Expired, Terminated) |
| `attachments` | JSON | Yes | [] | Attachment references |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Vendor` (vendor)
- Has many `pricing_agreements` (PricingAgreement.contract)

### Table: `pricing_agreements`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `contractId` | INTEGER | No | — | FK → contracts.id |
| `partId` | INTEGER | No | — | FK → parts.id |
| `vendorId` | INTEGER | No | — | FK → vendors.id |
| `agreedPrice` | FLOAT | No | — | Agreed price |
| `currency` | VARCHAR | Yes | 'USD' | Currency |
| `effectiveDate` | TIMESTAMPTZ | Yes | NULL | Effective date |
| `expirationDate` | TIMESTAMPTZ | Yes | NULL | Expiration date |
| `volumeTiers` | JSON | Yes | [] | Volume tiers |
| `status` | VARCHAR | Yes | 'Active' | Status (Active, Expired, Superseded) |
| `createdBy` | INTEGER | Yes | NULL | FK → users.id |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Belongs to `Contract` (contract)
- Belongs to `Part` (part)
- Belongs to `Vendor` (vendor)

---

## Module: Phase 4 — Integration

### Table: `webhook_subscriptions`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `url` | VARCHAR | No | — | Webhook URL |
| `events` | VARCHAR | No | — | Comma-separated event types |
| `secret` | VARCHAR | Yes | NULL | HMAC signing secret |
| `active` | BOOLEAN | Yes | true | Whether subscription is active |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Has many `webhook_deliveries` (WebhookDelivery.subscription)

### Table: `webhook_deliveries`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `subscriptionId` | INTEGER | No | — | FK → webhook_subscriptions.id |
| `event` | VARCHAR | No | — | Event type |
| `payload` | TEXT | Yes | NULL | JSON payload |
| `status` | VARCHAR | Yes | 'pending' | Status (pending, success, failed) |
| `statusCode` | INTEGER | Yes | NULL | HTTP response code |
| `responseText` | TEXT | Yes | NULL | Response body |
| `retryCount` | INTEGER | Yes | 0 | Retry count |
| `nextRetryAt` | TIMESTAMPTZ | Yes | NULL | Next retry time |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `WebhookSubscription` (subscription)

### Table: `bulk_import_jobs`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `filename` | VARCHAR | No | — | Source filename |
| `status` | VARCHAR | Yes | 'pending' | Status (pending, processing, completed, failed) |
| `totalRows` | INTEGER | Yes | 0 | Total rows |
| `processedRows` | INTEGER | Yes | 0 | Processed rows |
| `errorRows` | INTEGER | Yes | 0 | Rows with errors |
| `mappingConfig` | JSON | Yes | {} | Column mapping configuration |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `completedAt` | TIMESTAMPTZ | Yes | NULL | Completion timestamp |

**Relationships:**
- Has many `bulk_import_rows` (BulkImportRow.job)

### Table: `bulk_import_rows`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `jobId` | INTEGER | No | — | FK → bulk_import_jobs.id |
| `rowData` | JSON | Yes | {} | Row data |
| `status` | VARCHAR | Yes | 'pending' | Status (pending, success, error) |
| `errors` | TEXT | Yes | NULL | Error messages |

**Relationships:**
- Belongs to `BulkImportJob` (job)

### Table: `erp_connectors`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `name` | VARCHAR | No | — | Connector name |
| `type` | VARCHAR | No | — | ERP type |
| `baseUrl` | VARCHAR | Yes | NULL | Base URL |
| `apiKey` | VARCHAR | Yes | NULL | API key |
| `active` | BOOLEAN | Yes | true | Whether active |
| `lastSyncAt` | TIMESTAMPTZ | Yes | NULL | Last sync timestamp |
| `config` | JSON | Yes | {} | Configuration |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |

**Relationships:**
- Has many `erp_sync_logs` (ERPSyncLog.connector)

### Table: `erp_sync_logs`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `connectorId` | INTEGER | No | — | FK → erp_connectors.id |
| `direction` | VARCHAR | No | — | Sync direction (inbound, outbound) |
| `entityType` | VARCHAR | No | — | Entity type |
| `recordsCount` | INTEGER | Yes | 0 | Records synced |
| `status` | VARCHAR | Yes | 'pending' | Status (pending, success, failed) |
| `errors` | TEXT | Yes | NULL | Error messages |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `ERPConnector` (connector)

### Table: `supplier_users`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `vendorId` | INTEGER | No | — | FK → vendors.id |
| `email` | VARCHAR | No | — | Email (unique) |
| `name` | VARCHAR | No | — | Name |
| `passwordHash` | VARCHAR | No | — | Password hash |
| `active` | BOOLEAN | Yes | true | Whether active |
| `lastLoginAt` | TIMESTAMPTZ | Yes | NULL | Last login |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `Vendor` (vendor)
- Has many `supplier_price_updates` (SupplierPriceUpdate.supplierUser)

### Table: `supplier_price_updates`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `supplierUserId` | INTEGER | No | — | FK → supplier_users.id |
| `partId` | INTEGER | No | — | FK → parts.id |
| `oldPrice` | FLOAT | Yes | 0.0 | Previous price |
| `newPrice` | FLOAT | Yes | 0.0 | New proposed price |
| `status` | VARCHAR | Yes | 'pending' | Status (pending, approved, rejected) |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `reviewedAt` | TIMESTAMPTZ | Yes | NULL | Review timestamp |

**Relationships:**
- Belongs to `SupplierUser` (supplierUser)
- Belongs to `Part` (part)

---

## Module: Phase 5 — AI Models

### Table: `demand_forecasts`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `partId` | INTEGER | No | — | FK → parts.id (indexed) |
| `forecastDate` | VARCHAR | No | — | Forecast target date |
| `predictedQuantity` | INTEGER | Yes | 0 | Predicted demand quantity |
| `confidence` | FLOAT | Yes | 0.0 | Confidence score (0-1) |
| `model` | VARCHAR | Yes | 'statistical' | Model used |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `Part` (part)

### Table: `interchangeability_suggestions`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `partId1` | INTEGER | No | — | FK → parts.id (indexed) |
| `partId2` | INTEGER | No | — | FK → parts.id (indexed) |
| `similarity` | FLOAT | Yes | 0.0 | Similarity score (0-1) |
| `reason` | TEXT | Yes | NULL | Reason for suggestion |
| `status` | VARCHAR | Yes | 'pending' | Status (pending, accepted, rejected) |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `Part` (partId1)
- Belongs to `Part` (partId2)

### Table: `validation_results`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `partId` | INTEGER | No | — | FK → parts.id (indexed) |
| `ruleName` | VARCHAR | No | — | Rule name |
| `passed` | BOOLEAN | Yes | false | Whether validation passed |
| `message` | TEXT | Yes | NULL | Validation message |
| `severity` | VARCHAR | Yes | 'info' | Severity (info, warning, error) |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |

**Relationships:**
- Belongs to `Part` (part)

### Table: `approval_automation_rules`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | No | auto | Primary key |
| `name` | VARCHAR | No | — | Rule name |
| `description` | TEXT | Yes | NULL | Description |
| `entityType` | VARCHAR | No | — | Entity type to apply to |
| `conditionField` | VARCHAR | No | — | Field to evaluate |
| `conditionOperator` | VARCHAR | No | — | Operator (eq, gt, lt, contains, etc.) |
| `conditionValue` | VARCHAR | No | — | Value to compare |
| `action` | VARCHAR | Yes | 'auto_approve' | Action to take |
| `isActive` | BOOLEAN | Yes | true | Whether rule is active |
| `priority` | INTEGER | Yes | 0 | Rule priority |
| `createdAt` | TIMESTAMPTZ | Yes | now() | Creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Yes | NULL | Last update timestamp |
