# Blackbox BOM - Complete API Reference

## Table of Contents

1. [Authentication](#authentication)
2. [BOM Endpoints](#bom-endpoints)
3. [SolidWorks Integration API](#solidworks-integration-api)
4. [Order Tracking API](#order-tracking-api)
5. [User Management API](#user-management-api)
6. [Project Management API](#project-management-api)
7. [Image Management API](#image-management-api)
8. [Webhook API](#webhook-api)
9. [Bulk Import API](#bulk-import-api)
10. [ERP Integration API](#erp-integration-api)
11. [Supplier Portal API](#supplier-portal-api)
12. [AI Features API](#ai-features-api)
13. [Monitoring API](#monitoring-api)
14. [Error Handling](#error-handling)
15. [Rate Limiting](#rate-limiting)

---

## Base URL

```
Production: https://api.blackboxbom.com/api/v1
Development: http://localhost:8000/api/v1
```

## Common Headers

```http
Content-Type: application/json
Authorization: Bearer <token>
X-API-Key: <api-key>
X-Request-ID: <uuid>
```

> **Note:** Web clients can use httpOnly cookies instead of the `Authorization` header.
> Login/Register endpoints set `access_token` and `refresh_token` as httpOnly, SameSite=Lax cookies.
> For cookie-based auth, include `credentials: 'include'` in fetch requests.

---

## Authentication

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "editor"
  }
}
```

### Register

```http
POST /auth/register
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "securepassword",
  "full_name": "New User"
}
```

### Refresh Token

```http
POST /auth/refresh
Authorization: Bearer <refresh_token>
```

Alternatively, the `refresh_token` httpOnly cookie (set by login) is used automatically when no body is provided.

### Logout

```http
POST /auth/logout
Authorization: Bearer <token>
```

Clears auth cookies server-side. Requires valid authentication (cookie or header).

### Plugin Authentication

```http
POST /auth/plugin-login
Content-Type: application/json

{
  "api_key": "your-api-key",
  "client_type": "solidworks_addin",
  "client_version": "1.0.0"
}
```

---

## BOM Endpoints

### List BOM Items

```http
GET /bom?skip=0&limit=100&search=steel&project_id=1
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| skip | int | 0 | Number of items to skip |
| limit | int | 100 | Maximum items to return |
| search | string | - | Search in part_number, description |
| project_id | int | - | Filter by project |
| material | string | - | Filter by material |
| vendor | string | - | Filter by vendor |

**Response:**
```json
{
  "items": [
    {
      "id": 1,
      "part_number": "PART-001",
      "description": "Hex Bolt M8x30",
      "quantity": 4,
      "material": "Steel",
      "weight": "0.025 kg",
      "vendor": "Fastenal",
      "cost": "0.15",
      "cad_url": null,
      "custom_properties": {
        "finish": "Zinc Plated",
        "grade": "8.8"
      },
      "mass_properties": {
        "mass": 0.025,
        "volume": 3183.09,
        "surface_area": 1507.96
      },
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 150,
  "skip": 0,
  "limit": 100
}
```

### Create BOM Item

```http
POST /bom
Content-Type: application/json

{
  "part_number": "PART-002",
  "description": "Nut M8",
  "quantity": 4,
  "material": "Steel",
  "weight": "0.010 kg",
  "vendor": "Fastenal",
  "cost": "0.08",
  "project_id": 1,
  "custom_properties": {
    "finish": "Zinc Plated",
    "thread": "M8x1.25"
  }
}
```

**Response:** `201 Created`
```json
{
  "id": 2,
  "part_number": "PART-002",
  "description": "Nut M8",
  "quantity": 4,
  "created_at": "2024-01-15T11:00:00Z"
}
```

### Get BOM Item

```http
GET /bom/{item_id}
```

### Update BOM Item

```http
PUT /bom/{item_id}
Content-Type: application/json

{
  "description": "Updated Description",
  "quantity": 6
}
```

### Delete BOM Item

```http
DELETE /bom/{item_id}
```

### Get BOM Statistics

```http
GET /bom/stats?project_id=1
```

**Response:**
```json
{
  "total_items": 150,
  "unique_parts": 45,
  "total_quantity": 1250,
  "total_cost": "12500.00",
  "by_material": {
    "Steel": 80,
    "Aluminum": 40,
    "Plastic": 30
  },
  "by_vendor": {
    "Fastenal": 50,
    "McMaster": 45,
    "Grainger": 35
  }
}
```

---

## SolidWorks Integration API

### Sync BOM from SolidWorks

```http
POST /cad/sync
Content-Type: application/json

{
  "source_file": "C:\\Projects\\Assembly.SLDASM",
  "model_type": "Assembly",
  "extracted_at": "2024-01-15T10:30:00Z",
  "total_components": 25,
  "total_unique_parts": 15,
  "items": [
    {
      "component_name": "Part1^Assembly",
      "part_number": "PART-001",
      "description": "Hex Bolt M8x30",
      "quantity": 4,
      "material": "Steel",
      "weight": "0.025 kg",
      "configuration": "Default",
      "custom_properties": {
        "finish": "Zinc Plated"
      },
      "mass_properties": {
        "mass": 0.025,
        "volume": 3183.09,
        "surface_area": 1507.96
      },
      "bounding_box": {
        "width": 8.0,
        "height": 30.0,
        "depth": 8.0
      },
      "features": [
        {
          "name": "Extrude1",
          "type": "ExtrudeBoss",
          "parameters": {
            "depth": 30.0,
            "direction": "Forward"
          },
          "dimensions": [
            {
              "name": "D1@Sketch1",
              "value": 8.0
            }
          ]
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "session_id": "session_20240115103000",
  "items_added": 15,
  "items_updated": 10,
  "items_deleted": 0,
  "conflicts": [],
  "success": true,
  "message": "BOM synced: 15 added, 10 updated"
}
```

### Apply Sync with Conflict Resolution

```http
POST /cad/apply-sync
Content-Type: application/json

{
  "source_file": "Assembly.SLDASM",
  "items": [
    {
      "part_number": "PART-001",
      "quantity": 6,
      "description": "Updated description"
    }
  ]
}
```

### Get BOM for File

```http
GET /cad/bom?file=Assembly.SLDASM
```

### Upload Component Images

```http
POST /cad/images
Content-Type: application/json

{
  "part_number": "PART-001",
  "part_name": "Hex Bolt M8x30",
  "thumbnail_32": "base64-encoded-image...",
  "thumbnail_64": "base64-encoded-image...",
  "thumbnail_128": "base64-encoded-image...",
  "thumbnail_256": "base64-encoded-image...",
  "isometric_view": "base64-encoded-image...",
  "front_view": "base64-encoded-image...",
  "dimensions": {
    "width": 8.0,
    "height": 30.0,
    "depth": 8.0,
    "units": "mm"
  }
}
```

### Get Component Image

```http
GET /cad/images/{part_number}
```

**Response:**
```json
{
  "part_number": "PART-001",
  "part_name": "Hex Bolt M8x30",
  "thumbnail_256": "base64-encoded-image...",
  "isometric_view": "base64-encoded-image...",
  "front_view": "base64-encoded-image..."
}
```

### Send Update Notification

```http
POST /cad/notify
Content-Type: application/json

{
  "type": "component_added",
  "model_name": "Assembly.SLDASM",
  "user_name": "john.doe",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "component": "PART-003",
    "quantity": 2
  }
}
```

### Get Pending Updates

```http
GET /cad/updates?session=abc123
```

### Get Pending Changes

```http
GET /cad/changes?model=Assembly.SLDASM
```

**Response:**
```json
[
  {
    "change_id": "CHG-001",
    "type": "custom_property",
    "part_number": "PART-001",
    "property": "Description",
    "old_value": "Old Description",
    "new_value": "New Description",
    "user_name": "jane.smith",
    "timestamp": "2024-01-15T09:00:00Z",
    "reason": "Customer requested change"
  }
]
```

### Apply Changes

```http
POST /cad/apply-changes
Content-Type: application/json

{
  "model": "Assembly.SLDASM",
  "changes": [
    {
      "change_id": "CHG-001",
      "type": "custom_property",
      "part_number": "PART-001",
      "property": "Description",
      "new_value": "New Description"
    }
  ]
}
```

### Extract Attributes

```http
POST /cad/extract-attrs
Content-Type: application/json

{
  "file_path": "C:\\Projects\\Part.SLDPRT"
}
```

**Response:**
```json
{
  "file_path": "C:\\Projects\\Part.SLDPRT",
  "attributes": {
    "part_number": "PART-001",
    "description": "Extracted Component",
    "material": "Steel",
    "weight": "1.5 kg",
    "volume": "190985.93 mm³",
    "surface_area": "12566.37 mm²"
  }
}
```

### Get Vault Statistics

```http
GET /cad/vault/stats
```

**Response:**
```json
{
  "total_files": 1250,
  "total_parts": 850,
  "total_assemblies": 150,
  "total_drawings": 250,
  "total_size_mb": 5120.5,
  "last_synced": "2024-01-15T10:30:00Z"
}
```

### Get Vault Tree

```http
GET /cad/vault/tree
```

---

## Order Tracking API

### List Purchase Orders

```http
GET /orders?status=approved&supplier=Fastenal&skip=0&limit=50
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status |
| supplier | string | Filter by supplier |
| start_date | string | Filter by start date |
| end_date | string | Filter by end date |

**Response:**
```json
{
  "items": [
    {
      "id": 1,
      "po_number": "PO-2024-001",
      "supplier": "Fastenal",
      "status": "approved",
      "total_amount": 12500.00,
      "currency": "USD",
      "line_items_count": 15,
      "created_at": "2024-01-15T10:30:00Z",
      "milestones": [
        {
          "type": "created",
          "status": "completed",
          "date": "2024-01-15"
        },
        {
          "type": "approved",
          "status": "completed",
          "date": "2024-01-16"
        },
        {
          "type": "shipped",
          "status": "pending",
          "planned_date": "2024-01-20"
        }
      ]
    }
  ],
  "total": 25
}
```

### Create Purchase Order

```http
POST /orders
Content-Type: application/json

{
  "po_number": "PO-2024-002",
  "supplier": "McMaster-Carr",
  "line_items": [
    {
      "line_number": 1,
      "part_number": "PART-001",
      "description": "Hex Bolt M8x30",
      "quantity": 100,
      "unit_price": 0.15
    },
    {
      "line_number": 2,
      "part_number": "PART-002",
      "description": "Nut M8",
      "quantity": 100,
      "unit_price": 0.08
    }
  ]
}
```

### Get Purchase Order

```http
GET /orders/{order_id}
```

### Update Purchase Order

```http
PUT /orders/{order_id}
Content-Type: application/json

{
  "status": "shipped",
  "tracking_number": "1Z999AA10123456784"
}
```

### Get Order Milestones

```http
GET /orders/{order_id}/milestones
```

### Add Shipment Update

```http
POST /orders/{order_id}/shipments
Content-Type: application/json

{
  "tracking_number": "1Z999AA10123456784",
  "carrier": "UPS",
  "status": "in_transit",
  "estimated_delivery": "2024-01-25",
  "current_location": "Chicago, IL"
}
```

### Get Order Timeline

```http
GET /orders/{order_id}/timeline
```

**Response:**
```json
{
  "events": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "event": "created",
      "description": "PO created by John Doe",
      "user": "john.doe"
    },
    {
      "timestamp": "2024-01-16T09:00:00Z",
      "event": "approved",
      "description": "PO approved by Jane Smith",
      "user": "jane.smith"
    },
    {
      "timestamp": "2024-01-20T14:00:00Z",
      "event": "shipped",
      "description": "Order shipped via UPS",
      "tracking": "1Z999AA10123456784"
    }
  ]
}
```

---

## User Management API

### List Users

```http
GET /users?role=editor&active=true
```

### Create User

```http
POST /users
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "securepassword",
  "full_name": "New User",
  "role": "editor"
}
```

### Get User

```http
GET /users/{user_id}
```

### Update User

```http
PUT /users/{user_id}
Content-Type: application/json

{
  "full_name": "Updated Name",
  "role": "manager"
}
```

### Delete User

```http
DELETE /users/{user_id}
```

### Change Password

```http
POST /users/{user_id}/password
Content-Type: application/json

{
  "current_password": "oldpassword",
  "new_password": "newpassword"
}
```

---

## Project Management API

### List Projects

```http
GET /projects?status=active
```

### Create Project

```http
POST /projects
Content-Type: application/json

{
  "name": "New Project",
  "description": "Project description",
  "status": "active"
}
```

### Get Project

```http
GET /projects/{project_id}
```

### Update Project

```http
PUT /projects/{project_id}
Content-Type: application/json

{
  "status": "completed"
}
```

### Delete Project

```http
DELETE /projects/{project_id}
```

### Get Project Statistics

```http
GET /projects/{project_id}/stats
```

---

## Image Management API

### Upload Image

```http
POST /images/upload
Content-Type: multipart/form-data

file: [binary data]
part_number: PART-001
image_type: isometric
```

### Get Image

```http
GET /images/{image_id}
```

### List Images

```http
GET /images?part_number=PART-001&image_type=thumbnail
```

### Delete Image

```http
DELETE /images/{image_id}
```

---

## Webhook API

### List Webhooks

```http
GET /webhooks
```

### Create Webhook

```http
POST /webhooks
Content-Type: application/json

{
  "url": "https://example.com/webhook",
  "events": ["bom.updated", "order.shipped"],
  "secret": "webhook-secret"
}
```

### Update Webhook

```http
PUT /webhooks/{webhook_id}
Content-Type: application/json

{
  "active": false
}
```

### Delete Webhook

```http
DELETE /webhooks/{webhook_id}
```

### Test Webhook

```http
POST /webhooks/{webhook_id}/test
```

---

## Bulk Import API

### Import BOM from CSV

```http
POST /bulk/import/bom
Content-Type: multipart/form-data

file: [CSV file]
project_id: 1
```

### Import BOM from Excel

```http
POST /bulk/import/bom/excel
Content-Type: multipart/form-data

file: [Excel file]
project_id: 1
sheet_name: Sheet1
```

### Import Purchase Orders

```http
POST /bulk/import/orders
Content-Type: multipart/form-data

file: [CSV/Excel file]
```

### Check Import Status

```http
GET /bulk/import/{import_id}/status
```

**Response:**
```json
{
  "import_id": "imp_123456",
  "status": "processing",
  "progress": 75,
  "total_rows": 100,
  "processed_rows": 75,
  "errors": 0
}
```

---

## ERP Integration API

### List ERP Connectors

```http
GET /erp/connectors
```

### Create ERP Connector

```http
POST /erp/connectors
Content-Type: application/json

{
  "name": "SAP Connector",
  "type": "sap",
  "config": {
    "host": "sap.example.com",
    "client": "100",
    "username": "api_user"
  }
}
```

### Sync with ERP

```http
POST /erp/sync/{connector_id}
Content-Type: application/json

{
  "direction": "export",
  "data_type": "bom",
  "items": [1, 2, 3]
}
```

### Get Sync Status

```http
GET /erp/sync/{sync_id}/status
```

---

## Supplier Portal API

### List Suppliers

```http
GET /suppliers?category=fasteners
```

### Create Supplier

```http
POST /suppliers
Content-Type: application/json

{
  "name": "Fastenal",
  "category": "fasteners",
  "contact_email": "orders@fastenal.com",
  "lead_time_days": 5
}
```

### Get Supplier Scorecard

```http
GET /suppliers/{supplier_id}/scorecard
```

**Response:**
```json
{
  "supplier_id": 1,
  "name": "Fastenal",
  "overall_score": 85,
  "metrics": {
    "on_time_delivery": 92,
    "quality": 88,
    "cost_competitiveness": 78,
    "responsiveness": 82
  },
  "trend": "improving"
}
```

---

## AI Features API

### Get BOM Suggestions

```http
POST /ai/suggest
Content-Type: application/json

{
  "part_number": "PART-001",
  "context": "replacement_for_discontinued"
}
```

### Forecast Demand

```http
POST /ai/forecast
Content-Type: application/json

{
  "part_number": "PART-001",
  "historical_data": true,
  "forecast_months": 6
}
```

### Detect Interchangeability

```http
POST /ai/interchangeable
Content-Type: application/json

{
  "part_number": "PART-001",
  "tolerance": 0.1
}
```

### Validate BOM

```http
POST /ai/validate
Content-Type: application/json

{
  "bom_items": [1, 2, 3, 4, 5]
}
```

---

## Monitoring API

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "disk_space": "healthy"
  }
}
```

### Get Metrics

```http
GET /metrics
```

### Get System Status

```http
GET /status
```

---

## Error Handling

### Error Response Format

```json
{
  "detail": "Error message",
  "status": 400,
  "error": "Bad Request",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "part_number",
      "message": "Part number already exists"
    }
  ]
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 429 | Rate Limited |
| 500 | Internal Server Error |

### Error Codes

| Code | Description |
|------|-------------|
| VALIDATION_ERROR | Request validation failed |
| AUTHENTICATION_ERROR | Authentication required |
| AUTHORIZATION_ERROR | Insufficient permissions |
| NOT_FOUND | Resource not found |
| CONFLICT | Resource conflict |
| RATE_LIMITED | Rate limit exceeded |
| INTERNAL_ERROR | Server error |

---

## Rate Limiting

### Limits

| Tier | Requests/minute | Requests/hour |
|------|-----------------|---------------|
| Free | 60 | 1000 |
| Pro | 300 | 10000 |
| Enterprise | 1000 | 100000 |

### Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1705312200
```

### Rate Limited Response

```json
{
  "detail": "Rate limit exceeded",
  "status": 429,
  "error": "Too Many Requests",
  "retry_after": 30
}
```

---

## Pagination

### Request

```http
GET /bom?skip=0&limit=20
```

### Response

```json
{
  "items": [...],
  "total": 150,
  "skip": 0,
  "limit": 20,
  "has_more": true
}
```

### Cursor-based Pagination

```http
GET /bom?cursor=eyJpZCI6MTAwfQ==&limit=20
```

---

## Filtering

### Basic Filtering

```http
GET /bom?material=Steel&vendor=Fastenal
```

### Advanced Filtering

```http
GET /bom?filter[material][eq]=Steel&filter[quantity][gt]=10
```

### Operators

| Operator | Description |
|----------|-------------|
| eq | Equals |
| ne | Not equals |
| gt | Greater than |
| lt | Less than |
| gte | Greater than or equal |
| lte | Less than or equal |
| like | Contains |
| in | In list |

---

## Sorting

```http
GET /bom?sort=part_number:asc,quantity:desc
```

---

## Field Selection

```http
GET /bom?fields=part_number,description,quantity
```

---

## Search

```http
GET /bom/search?q=hex+bolt&fields=part_number,description
```

---

## Batch Operations

### Batch Create

```http
POST /bom/batch
Content-Type: application/json

{
  "items": [
    {"part_number": "PART-001", "description": "Part 1"},
    {"part_number": "PART-002", "description": "Part 2"}
  ]
}
```

### Batch Update

```http
PUT /bom/batch
Content-Type: application/json

{
  "items": [
    {"id": 1, "quantity": 10},
    {"id": 2, "quantity": 20}
  ]
}
```

### Batch Delete

```http
DELETE /bom/batch
Content-Type: application/json

{
  "ids": [1, 2, 3]
}
```

---

*Last Updated: January 2024*
