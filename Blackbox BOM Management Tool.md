# **Blackbox BOM Management Tool**

### **Product Requirement Document (PRD)**

## **1. Project Overview**

**Blackbox BOM** is an internal BOM (Bill of Materials) management
platform designed to improve component tracking, procurement visibility,
vendor management, lifecycle control, and engineering collaboration.

The tool should serve as a centralized system connecting **design,
procurement, costing, documentation, and analytics** for
mechanical/electrical components used in internal product development.

The platform should take inspiration from
[**[OpenBOM]{.underline}**](https://www.openbom.com?utm_source=chatgpt.com),
but tailored to Blackbox's workflow, branding, and manufacturing needs.

# **2. Primary Objectives**

The system should:

-   Centralize BOM and component data.

-   Improve engineering-to-purchase visibility.

-   Reduce sourcing and procurement inefficiencies.

-   Improve cost tracking and vendor comparison.

-   Maintain BOM lifecycle/version traceability.

-   Support design documentation and file storage.

-   Enable team collaboration across departments.

-   Provide analytics for procurement and engineering decisions.

# **3. Core Modules**

## **3.1 Component Management Module**

A centralized database for all parts/components.

### **Functional Requirements**

Each component should support:

-   Unique Part Number / ID

-   Component Name

-   Description

-   Category / Sub-category

-   Material

-   Weight

-   Dimensions

-   Specifications

-   Manufacturer

-   Custom fields (user-defined)

-   Part images

-   Datasheets

-   Actual product images

-   Comments / Notes

-   Tags

-   Barcode / QR code mapping

-   Active / Obsolete status

### **Advanced Features**

-   OCR extraction from uploaded datasheets or invoices

-   Auto internet scraping for public component information

-   Duplicate part detection

-   Search and filtering

## **3.2 SolidWorks Integration Module**

Integration with SolidWorks assemblies.

### **Functional Requirements**

-   Pull BOM directly from SolidWorks.

-   Script/API integration for component sync.

-   Auto snapshot generation of components.

-   Isometric-view image capture.

-   Associate snapshots with part records.

-   Detect BOM changes from CAD revisions.

### **Output**

Each synced part should include:

-   CAD reference

-   Thumbnail preview

-   Assembly relationship

-   Parent-child hierarchy

## **3.3 BOM Management Module**

Central BOM creation and tracking.

### **Functional Requirements**

-   Create multi-level BOMs

-   Parent-child hierarchy

-   Sub-system level tracking

-   Nested assemblies

-   Part quantity tracking

-   BOM duplication

-   BOM templates

-   BOM compare tool

### **Lifecycle**

Track:

-   Draft

-   Under Review

-   Approved

-   Released

-   Deprecated

-   Archived

## **3.4 Version Control & Lifecycle Management**

Track historical changes.

### **Requirements**

-   Revision history (V1, V2, V3...)

-   Change logs

-   Timestamp tracking

-   User tracking

-   Rollback capability

-   Difference comparison between revisions

-   Approval workflow

## **3.5 Vendor Management Module**

Each part can have multiple vendors.

### **Functional Requirements**

Vendor details:

-   Vendor name

-   Contact information

-   Lead time

-   MOQ

-   Payment terms

-   Reliability rating

-   Vendor notes

-   Active / inactive status

### **Features**

-   Multiple vendors per part

-   Preferred vendor tagging

-   Alternate vendors

-   Vendor risk analysis

## **3.6 Cost Management & Trend Analysis**

Track component costs.

### **Functional Requirements**

For each component:

-   Current price

-   Historical price

-   Currency

-   Vendor-wise price

-   Purchase price history

-   Freight/logistics cost

-   Tax cost

-   Total landed cost

### **Analytics**

-   Cost trend charts

-   Price fluctuation alerts

-   Inflation analysis

-   Cost variance across vendors

-   BOM total cost roll-up

-   Procurement budget tracking

## **3.7 Country of Origin Management**

Track sourcing origin.

### **Requirements**

Each part should support:

-   Single or multiple origin countries

-   Country history tracking

-   Compliance tagging

-   Supplier-country mapping

## **3.8 Barcode / QR Integration**

Barcode-enabled part traceability.

### **Functional Requirements**

-   Generate barcode

-   Generate QR code

-   Scan barcode via camera/device

-   Lookup part by scan

-   Warehouse tracking compatibility

## **3.9 Procurement / Purchase Management**

BOM → Purchase flow.

### **Workflow**

Convert BOM into procurement pipeline.

### **Functional Requirements**

Track statuses:

-   Not Ordered

-   RFQ Sent

-   Under Review

-   Ordered

-   In Transit

-   Received

-   Quality Check

-   Approved

-   Rejected

-   Closed

### **Features**

-   Vendor-linked purchasing

-   PO references

-   Quantity tracking

-   Delivery ETA

-   Purchase history

-   File attachment for invoices/POs

-   Drawing storage

-   Procurement alerts

## **3.10 Document Management System**

Store engineering and purchase files.

### **File Types**

-   Datasheets

-   CAD exports

-   Drawings

-   PDFs

-   Images

-   Vendor quotations

-   Invoices

-   Compliance docs

-   Test reports

### **Features**

-   Versioned files

-   Tagging

-   Search

-   Access control

-   File preview

-   Folder structure

-   Bulk upload

## **3.11 OCR & Intelligent Data Extraction**

Automate data capture.

### **Input Sources**

-   Datasheets

-   Invoices

-   Vendor quotes

-   Spec sheets

-   PDFs

### **Extract:**

-   Part number

-   Specifications

-   Dimensions

-   Cost

-   Currency

-   Vendor name

-   Quantity

-   Material

### **AI Layer**

-   Confidence score

-   Manual correction

-   Learning from corrections

## **3.12 Team Collaboration Module**

Cross-functional collaboration.

### **Features**

-   Comments on parts

-   Mentions (@user)

-   Activity logs

-   Notifications

-   Approval requests

-   Audit trail

-   Change ownership

### **Roles**

-   Admin

-   Engineering

-   Procurement

-   Finance

-   Viewer

## **3.13 Export & Reporting**

Export BOM and insights.

### **Export formats**

-   PDF

-   XLSX

-   CSV

-   JSON

### **Reports**

-   BOM summary

-   Vendor cost comparison

-   Procurement aging

-   Cost trends

-   Revision reports

-   Country-of-origin reports

## **3.14 Analytics Dashboard**

Decision-making dashboards.

### **KPIs**

-   Total parts

-   Active BOMs

-   BOM cost

-   Cost changes over time

-   Vendor performance

-   Procurement delays

-   Part duplication

-   Obsolete parts

-   Country dependency

-   High-risk suppliers

### **Visualization**

-   Trend graphs

-   Heat maps

-   Pie charts

-   Vendor scorecards

-   Cost distribution

## **3.15 Internet Data Scraping Engine**

Automatic enrichment.

### **Capabilities**

For a given part:

-   Pull datasheets

-   Public specs

-   Market pricing

-   Alternate vendors

-   Manufacturer data

-   Image references

### **Rules**

-   User approval before import

-   Confidence validation

-   Manual override

# **4. Search & Filtering**

Global search should support:

-   Part number

-   Vendor

-   BOM ID

-   Category

-   Country

-   Cost

-   Barcode

-   Status

-   Revision

-   Custom fields

Advanced filtering + saved filters.

# **5. UI/UX Requirements**

Theme: **Blackbox styling**

### **Design language**

-   Minimal industrial design

-   Dark Mode

-   Light Mode

-   High contrast tables

-   Clean engineering dashboard

-   Modular cards

-   Fast navigation

-   Bulk editing

-   Drag-and-drop BOM hierarchy

# **6. Security & Access Control**

-   Role-based permissions

-   Audit logs

-   File access restriction

-   Change tracking

-   Encryption at rest

-   Secure authentication (SSO preferred)

-   Backup and restore

-   Data retention controls

# **7. Performance Requirements**

-   Search under 2 seconds

-   BOM loading under 3 seconds

-   Support 100k+ components

-   Large PDF handling

-   Parallel uploads

-   Bulk import/export

# **8. Suggested Tech Architecture (the AI assistant can suggest alternatives)**

-   Frontend: React / Next.js

-   Backend: Node.js / Python

-   Database: PostgreSQL

-   File storage: S3-compatible

-   OCR: AI/OCR pipeline

-   Search: Elasticsearch

-   Barcode engine

-   SolidWorks API integration

-   Analytics layer

# **9. Future Enhancements**

-   ERP integration

-   Inventory management

-   Supplier portals

-   AI procurement suggestions

-   Forecasting shortages

-   Part interchangeability suggestions

-   Poka-yoke based part validation

-   Approval automation

-   Mobile scanning app

# **10. Success Criteria**

The tool is successful if it:

-   Reduces BOM errors

-   Improves procurement visibility

-   Reduces duplicate parts

-   Improves sourcing speed

-   Improves vendor decision quality

-   Creates full traceability from design → purchase → lifecycle
