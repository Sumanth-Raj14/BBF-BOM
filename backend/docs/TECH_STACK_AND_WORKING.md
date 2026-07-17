# Blackbox BOM - Complete Tech Stack & Working Documentation

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Database Architecture](#database-architecture)
6. [SolidWorks Integration](#solidworks-integration)
7. [3D Viewer Technology](#3d-viewer-technology)
8. [Authentication & Security](#authentication--security)
9. [API Design](#api-design)
10. [Deployment Architecture](#deployment-architecture)
11. [Development Workflow](#development-workflow)
12. [Performance Optimization](#performance-optimization)
13. [Monitoring & Logging](#monitoring--logging)
14. [Testing Strategy](#testing-strategy)

---

## System Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │   Browser   │  │   Mobile    │  │  SolidWorks │  │   API Clients       ││
│  │  (React)    │  │   (PWA)     │  │   (Plugin)  │  │   (REST)            ││
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘│
│         │                │                │                     │           │
└─────────┼────────────────┼────────────────┼─────────────────────┼───────────┘
          │                │                │                     │
          ▼                ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         FastAPI (Python 3.11)                           ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ││
│  │  │   Router    │  │ Middleware  │  │   Auth      │  │  Rate       │  ││
│  │  │             │  │             │  │   Handler   │  │  Limiter    │  ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVICE LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   BOM       │  │  SolidWorks │  │   Image     │  │   Sync      │       │
│  │  Service    │  │  Service    │  │  Service    │  │  Service    │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   User      │  │  License    │  │   Audit     │  │  Notification│       │
│  │  Service    │  │  Service    │  │  Service    │  │  Service    │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ PostgreSQL  │  │   Redis     │  │   MinIO     │  │  ElasticSrch│       │
│  │  (Primary)  │  │  (Cache)    │  │  (Storage)  │  │  (Search)   │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
User Action → Frontend → API Request → FastAPI Router → Service Layer → Database
                ↓                                    ↓
            UI Update ← Response ← JSON Response ← Query Result
```

---

## Technology Stack

### Frontend Technologies

| Technology | Version | Purpose | Why Chosen |
|------------|---------|---------|------------|
| **HTML5** | - | Structure | Standard web technology |
| **CSS3** | - | Styling | No preprocessors needed |
| **JavaScript (ES6+)** | - | Logic | Modern JS features |
| **React** | 18.x | UI Framework | Component-based architecture |
| **Three.js** | 0.160.0 | 3D Rendering | WebGL-based 3D viewer |
| **Babel Standalone** | 7.x | JSX Compilation | Runtime compilation |
| **Fetch API** | - | HTTP Client | Native browser API |

### Backend Technologies

| Technology | Version | Purpose | Why Chosen |
|------------|---------|---------|------------|
| **Python** | 3.11+ | Runtime | Fast development, rich ecosystem |
| **FastAPI** | 0.104+ | Web Framework | High performance, async support |
| **SQLAlchemy** | 2.0+ | ORM | Pythonic database access |
| **Alembic** | 1.12+ | Migrations | Database version control |
| **Pydantic** | 2.5+ | Validation | Data validation & serialization |
| **Uvicorn** | 0.24+ | ASGI Server | High-performance server |
| **Redis** | 7.x | Caching | In-memory data store |
| **PostgreSQL** | 15+ | Database | ACID compliance, JSON support |

### SolidWorks Plugin Technologies

| Technology | Version | Purpose | Why Chosen |
|------------|---------|---------|------------|
| **C#** | 10.0 | Language | .NET ecosystem |
| **.NET Framework** | 4.8 | Runtime | Windows compatibility |
| **SolidWorks API** | 2018+ | CAD Integration | Official SolidWorks SDK |
| **COM Interop** | - | Plugin System | SolidWorks plugin architecture |
| **Inno Setup** | 6.x | Installer | Free, reliable installer |

### DevOps Technologies

| Technology | Version | Purpose | Why Chosen |
|------------|---------|---------|------------|
| **Docker** | 24.x | Containerization | Consistent environments |
| **Docker Compose** | 2.x | Orchestration | Multi-container setup |
| **Nginx** | 1.25+ | Reverse Proxy | Load balancing, SSL |
| **GitHub Actions** | - | CI/CD | Automated workflows |
| **Prometheus** | 2.x | Monitoring | Metrics collection |
| **Grafana** | 10.x | Visualization | Dashboard creation |

---

## Frontend Architecture

### Project Structure

```
BOM and PRD/
├── index.html                    # Main entry point
├── api.js                        # API client functions
├── app.jsx                       # Main React application
├── styles.css                    # Global styles
├── serve.py                      # Custom no-cache server
│
├── React Libraries (Local)
│   ├── react.development.js      # React 18 UMD
│   ├── react-dom.development.js  # ReactDOM 18 UMD
│   └── babel.min.js              # Babel Standalone
│
├── Core Modules
│   ├── data.js                   # Mock BOM data
│   ├── projects.js               # Project definitions
│   ├── icons.jsx                 # Icon components
│   └── overlays.jsx              # Toast, Modals, Popovers
│
├── Feature Screens
│   ├── dashboard-screen.jsx      # Main dashboard
│   ├── prd-modules.jsx           # 15 PRD modules
│   ├── secondary-screens.jsx     # Secondary views
│   ├── detail-drawer.jsx         # Detail panels
│   ├── tweaks-panel.jsx          # Quick edits
│   └── final-polish.jsx          # Polish screens
│
├── Phase 4-6 Screens
│   ├── integration-screens.jsx   # Webhooks, ERP, etc.
│   └── mobile-scanner.jsx        # PWA mobile scanner
│
├── Advanced Screens
│   ├── pdm-cad.jsx              # CAD Vault management
│   └── order-tracking.jsx       # PO tracking
│
├── 3D Viewer
│   └── viewer/
│       └── index.html           # Three.js 3D viewer
│
└── PWA Assets
    ├── manifest.json            # PWA manifest
    └── sw.js                    # Service worker
```

### React Component Architecture

```
App (app.jsx)
├── Header
├── Navigation
├── Routes
│   ├── Dashboard
│   ├── PRD Modules (15 screens)
│   ├── Supply Chain (9 modules)
│   ├── Integration (6 modules)
│   ├── Advanced (6 modules)
│   ├── Order Tracking
│   ├── Mobile Scanner
│   └── PDM/CAD Vault
├── Detail Drawer
├── Tweak Panel
├── Toast Notifications
└── Modals
```

### State Management

```javascript
// In-memory state with localStorage persistence
const appState = {
  // Current screen
  currentScreen: 'dashboard',
  
  // BOM data
  bomData: [],
  selectedBomItem: null,
  
  // Project data
  projects: [],
  currentProject: null,
  
  // UI state
  isDetailOpen: false,
  isTweakOpen: false,
  
  // User preferences
  preferences: {
    currency: 'INR',
    language: 'en',
    theme: 'light'
  }
};

// Persistence to localStorage
function saveState() {
  localStorage.setItem('blackbox-bom-state', JSON.stringify(appState));
}

function loadState() {
  const saved = localStorage.getItem('blackbox-bom-state');
  if (saved) {
    Object.assign(appState, JSON.parse(saved));
  }
}
```

### API Communication

```javascript
// api.js - API Client
const API_BASE = 'http://localhost:8000/api/v1';

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}

// Export functions for each API endpoint
export const bomApi = {
  list: () => apiRequest('/bom'),
  get: (id) => apiRequest(`/bom/${id}`),
  create: (data) => apiRequest('/bom', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/bom/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/bom/${id}`, { method: 'DELETE' })
};
```

### 3D Viewer Integration

```javascript
// Three.js setup
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

class ModelViewer {
  constructor(container) {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    );
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    
    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    
    // Lighting
    this.setupLighting();
    
    // Animation loop
    this.animate();
  }
  
  loadSTL(arrayBuffer) {
    const loader = new STLLoader();
    const geometry = loader.parse(arrayBuffer);
    
    const material = new THREE.MeshPhongMaterial({
      color: 0x6a6a8a,
      specular: 0x111111,
      shininess: 200
    });
    
    this.model = new THREE.Mesh(geometry, material);
    this.scene.add(this.model);
    
    // Center and scale
    this.centerModel();
  }
  
  centerModel() {
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    this.model.position.sub(center);
    
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 100 / maxDim;
    this.model.scale.set(scale, scale, scale);
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
```

---

## Backend Architecture

### Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI entry point
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── api_v1.py              # API router
│   │   └── endpoints/             # API endpoints
│   │       ├── auth.py
│   │       ├── bom.py
│   │       ├── cad.py
│   │       ├── solidworks_integration.py
│   │       ├── order_tracking.py
│   │       └── ... (40+ endpoint files)
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py              # Configuration
│   │   ├── security.py            # Security utilities
│   │   ├── deps.py                # Dependencies
│   │   └── rbac.py                # Role-based access control
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── base.py                # Base model
│   │   ├── user.py                # User model
│   │   ├── bom.py                 # BOM models
│   │   ├── po_models.py           # Purchase order models
│   │   └── ... (37+ model files)
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── user.py                # User schemas
│   │   ├── bom.py                 # BOM schemas
│   │   └── ... (schema files)
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── bom_service.py
│   │   ├── cad_service.py
│   │   └── ... (service files)
│   │
│   ├── monitoring/
│   │   ├── __init__.py
│   │   ├── metrics.py             # Prometheus metrics
│   │   ├── health.py              # Health checks
│   │   └── sentry.py              # Error tracking
│   │
│   └── tests/
│       ├── __init__.py
│       ├── unit/                  # Unit tests (198 tests)
│       ├── integration/           # Integration tests
│       └── e2e/                   # End-to-end tests
│
├── alembic/                       # Database migrations
│   └── versions/
│       ├── 001_initial.py
│       ├── 002_phase3.py
│       ├── 003_phase4.py
│       └── 004_order_tracking.py
│
├── docs/                          # Documentation
│   ├── user-manual.md
│   ├── admin-guide.md
│   ├── data-dictionary.md
│   └── deployment-runbook.md
│
├── monitoring/                    # Monitoring config
│   ├── prometheus.yml
│   └── grafana/
│
├── requirements.txt               # Python dependencies
├── docker-compose.yml
├── Dockerfile
├── CHANGELOG.md
└── seed_db.py                     # Database seeder
```

### FastAPI Application Setup

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.api_v1 import api_router
from app.core.config import settings
from app.monitoring.metrics import MetricsMiddleware
from app.monitoring.sentry import init_sentry

app = FastAPI(
    title="Blackbox BOM API",
    description="Bill of Materials Management System",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Metrics middleware
app.add_middleware(MetricsMiddleware)

# Sentry initialization
init_sentry()

# API router
app.include_router(api_router, prefix="/api/v1")

# Health check
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
```

### Database Models

```python
# app/models/bom.py
from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON, DateTime
from sqlalchemy.orm import relationship
from app.models.base import Base

class BOMItem(Base):
    __tablename__ = "bom_items"
    
    id = Column(Integer, primary_key=True, index=True)
    part_number = Column(String, unique=True, index=True)
    description = Column(String)
    quantity = Column(Integer, default=1)
    material = Column(String)
    weight = Column(Float)
    vendor = Column(String)
    cost = Column(Float)
    
    # SolidWorks integration
    cad_url = Column(String)
    cad_file_path = Column(String)
    solidworks_config = Column(String)
    
    # Custom properties (JSON for flexibility)
    custom_properties = Column(JSON)
    
    # Mass properties
    mass_properties = Column(JSON)
    bounding_box = Column(JSON)
    
    # Feature data
    features = Column(JSON)
    dimensions = Column(JSON)
    
    # Images
    thumbnail_url = Column(String)
    isometric_image_url = Column(String)
    
    # Metadata
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    project = relationship("Project", back_populates="items")
    images = relationship("BOMItemImage", back_populates="bom_item")


class BOMItemImage(Base):
    __tablename__ = "bom_item_images"
    
    id = Column(Integer, primary_key=True, index=True)
    bom_item_id = Column(Integer, ForeignKey("bom_items.id"))
    image_type = Column(String)  # thumbnail_32, isometric, front, etc.
    image_data = Column(LargeBinary)
    created_at = Column(DateTime)
    
    bom_item = relationship("BOMItem", back_populates="images")
```

### API Endpoint Example

```python
# app/api/endpoints/bom.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.deps import get_db, get_current_user
from app.schemas.bom import BOMItemCreate, BOMItemResponse
from app.services.bom_service import BOMService

router = APIRouter()

@router.get("/", response_model=List[BOMItemResponse])
async def list_bom_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all BOM items with pagination and search"""
    service = BOMService(db)
    items = service.list_items(skip=skip, limit=limit, search=search)
    return items

@router.post("/", response_model=BOMItemResponse, status_code=201)
async def create_bom_item(
    item: BOMItemCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Create a new BOM item"""
    service = BOMService(db)
    return service.create_item(item)

@router.get("/{item_id}", response_model=BOMItemResponse)
async def get_bom_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a specific BOM item"""
    service = BOMService(db)
    item = service.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item
```

---

## Database Architecture

### Database Schema

```sql
-- Core tables
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR NOT NULL,
    full_name VARCHAR,
    is_active BOOLEAN DEFAULT TRUE,
    is_superuser BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    status VARCHAR DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE bom_items (
    id SERIAL PRIMARY KEY,
    part_number VARCHAR UNIQUE NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 1,
    material VARCHAR,
    weight FLOAT,
    vendor VARCHAR,
    cost FLOAT,
    cad_url VARCHAR,
    custom_properties JSONB,
    mass_properties JSONB,
    bounding_box JSONB,
    features JSONB,
    dimensions JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    project_id INTEGER REFERENCES projects(id),
    created_by INTEGER REFERENCES users(id)
);

CREATE TABLE bom_item_images (
    id SERIAL PRIMARY KEY,
    bom_item_id INTEGER REFERENCES bom_items(id) ON DELETE CASCADE,
    image_type VARCHAR NOT NULL,
    image_data BYTEA,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SolidWorks integration tables
CREATE TABLE cad_files (
    id SERIAL PRIMARY KEY,
    file_path VARCHAR NOT NULL,
    file_type VARCHAR,
    file_size BIGINT,
    checksum VARCHAR,
    solidworks_version VARCHAR,
    last_synced TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cad_sync_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR UNIQUE NOT NULL,
    source_file VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'pending',
    items_extracted INTEGER DEFAULT 0,
    images_extracted INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    user_id INTEGER REFERENCES users(id)
);

CREATE TABLE cad_updates (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR REFERENCES cad_sync_sessions(session_id),
    update_type VARCHAR NOT NULL,
    part_number VARCHAR,
    old_value JSONB,
    new_value JSONB,
    user_name VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order tracking tables
CREATE TABLE purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR UNIQUE NOT NULL,
    supplier VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'draft',
    total_amount DECIMAL(12,2),
    currency VARCHAR DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

CREATE TABLE po_line_items (
    id SERIAL PRIMARY KEY,
    po_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    part_number VARCHAR NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2),
    total_price DECIMAL(12,2),
    status VARCHAR DEFAULT 'pending'
);

CREATE TABLE po_milestones (
    id SERIAL PRIMARY KEY,
    po_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
    milestone_type VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'pending',
    planned_date DATE,
    actual_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit and security tables
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR NOT NULL,
    resource_type VARCHAR,
    resource_id INTEGER,
    details JSONB,
    ip_address VARCHAR,
    user_agent VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    key_hash VARCHAR UNIQUE NOT NULL,
    name VARCHAR,
    permissions JSONB,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_bom_items_part_number ON bom_items(part_number);
CREATE INDEX idx_bom_items_project_id ON bom_items(project_id);
CREATE INDEX idx_bom_item_images_bom_item_id ON bom_item_images(bom_item_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_po_line_items_po_id ON po_line_items(po_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_cad_sync_sessions_session_id ON cad_sync_sessions(session_id);
```

---

## SolidWorks Integration

### COM Add-in Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      SolidWorks                             │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │              BlackboxBomAddin (COM)                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  ISwAddin   │  │ TaskPaneView│  │  MenuItems  │  │  │
│  │  │  Interface  │  │   (UI)      │  │  (Commands) │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │                                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │BomExtractor │  │ImageExtractor│  │EventWatcher │  │  │
│  │  │             │  │             │  │             │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │                                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ModelUpdater │  │  ApiClient  │  │ SettingsForm│  │  │
│  │  │             │  │             │  │             │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Blackbox BOM Backend                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  CAD API    │  │  BOM Store  │  │  Real-time Sync     │ │
│  │  Endpoints  │  │  Service    │  │  Engine             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### BOM Extraction Process

```
1. User clicks "Extract BOM" in SolidWorks
         │
         ▼
2. BomExtractor.ExtractFromModel() called
         │
         ▼
3. Check model type (Assembly/Part)
         │
         ├── Assembly → ExtractFromAssembly()
         │              │
         │              ├── Get all components
         │              ├── For each component:
         │              │   ├── ExtractComponentData()
         │              │   ├── Get part details
         │              │   ├── Get custom properties
         │              │   ├── Get mass properties
         │              │   ├── Get feature tree
         │              │   └── Calculate quantity
         │              └── Recurse for sub-assemblies
         │
         └── Part → ExtractFromPart()
                    │
                    ├── Get part details
                    ├── Get custom properties
                    ├── Get mass properties
                    └── Get feature tree
         │
         ▼
4. Return BomData object
         │
         ▼
5. Display in Task Pane
         │
         ▼
6. Send to Backend API (if sync enabled)
```

### Image Extraction Process

```
1. User clicks "Extract Images" in SolidWorks
         │
         ▼
2. ImageExtractor.ExtractAllImages() called
         │
         ▼
3. For each component:
         │
         ├── Save model temporarily
         │
         ├── Extract thumbnails (32, 64, 128, 256)
         │   └── RenderToBytes() → PNG bytes
         │
         ├── Extract isometric view
         │   ├── Set view to Isometric
         │   ├── Zoom to fit
         │   └── CaptureView() → PNG bytes
         │
         ├── Extract standard views (Front, Top, Right)
         │   └── ExtractView() → PNG bytes
         │
         └── Get appearance/color
             └── GetMaterialPropertyValues()
         │
         ▼
4. Return List<ComponentImage>
         │
         ▼
5. Upload to Backend API
```

### Real-time Sync Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    SolidWorks Event                          │
├─────────────────────────────────────────────────────────────┤
│  Document Save │ Component Add │ Feature Change │ etc.      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EventWatcher                              │
├─────────────────────────────────────────────────────────────┤
│  Capture event → Create notification → Add to queue         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Sync Engine                               │
├─────────────────────────────────────────────────────────────┤
│  Check queue → Batch events → Send to API → Handle response│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API                               │
├─────────────────────────────────────────────────────────────┤
│  Receive sync → Update database → Broadcast to other clients│
└─────────────────────────────────────────────────────────────┘
```

---

## 3D Viewer Technology

### Three.js Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    3D Viewer (Browser)                       │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │                     Three.js Scene                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Scene     │  │   Camera    │  │  Renderer   │  │  │
│  │  │             │  │ (Perspective│  │ (WebGL)     │  │  │
│  │  │             │  │  or Ortho)  │  │             │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │                                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Controls   │  │   Lights    │  │   Grid      │  │  │
│  │  │ (Orbit)     │  │ (Ambient +  │  │   + Axes    │  │  │
│  │  │             │  │ Directional)│  │             │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   Loaders                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  STLLoader  │  │  OBJLoader  │  │ GLTFLoader  │  │  │
│  │  │             │  │             │  │             │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Supported Formats

| Format | Extension | Parser | Notes |
|--------|-----------|--------|-------|
| STL | `.stl` | STLLoader | Binary and ASCII |
| OBJ | `.obj` | OBJLoader | With materials |
| GLTF | `.gltf` | GLTFLoader | JSON format |
| GLB | `.glb` | GLTFLoader | Binary GLTF |
| FBX | `.fbx` | FBXLoader | Autodesk format |
| STEP | `.step` | - | Via backend conversion |

### Rendering Pipeline

```
1. Load file → Parse geometry → Create mesh
         │
         ▼
2. Center model → Calculate bounding box → Scale to fit
         │
         ▼
3. Apply material → Set color/specular/shininess
         │
         ▼
4. Add to scene → Setup lights → Configure camera
         │
         ▼
5. Start animation loop → Render frame → Update controls
```

---

## Authentication & Security

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Login Request                             │
├─────────────────────────────────────────────────────────────┤
│  Username + Password → Hash password → Compare with DB      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Token Generation                          │
├─────────────────────────────────────────────────────────────┤
│  Generate JWT token → Set expiry → Sign with secret         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Request                               │
├─────────────────────────────────────────────────────────────┤
│  Include token in header → Verify token → Extract user ID   │
└─────────────────────────────────────────────────────────────┘
```

### Security Features

| Feature | Implementation | Description |
|---------|----------------|-------------|
| Password Hashing | bcrypt | Secure password storage |
| JWT Tokens | PyJWT | Stateless authentication |
| RBAC | Custom middleware | Role-based access control |
| CORS | FastAPI middleware | Cross-origin security |
| Rate Limiting | Redis-based | API abuse prevention |
| Audit Logging | Database | Action tracking |
| SQL Injection | SQLAlchemy ORM | Parameterized queries |
| XSS Protection | Input sanitization | Content security |
| HTTPS | SSL/TLS | Encrypted communication |

### RBAC Implementation

```python
# app/core/rbac.py
from enum import Enum
from functools import wraps

class Permission(str, Enum):
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    ADMIN = "admin"
    EXPORT = "export"
    IMPORT = "import"

class Role:
    def __init__(self, name: str, permissions: list[Permission]):
        self.name = name
        self.permissions = permissions

# Define roles
VIEWER = Role("viewer", [Permission.READ])
EDITOR = Role("editor", [Permission.READ, Permission.WRITE])
MANAGER = Role("manager", [Permission.READ, Permission.WRITE, Permission.DELETE])
ADMIN = Role("admin", [p for p in Permission])

def require_permission(permission: Permission):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, current_user=Depends(get_current_user), **kwargs):
            user_role = get_user_role(current_user)
            if permission not in user_role.permissions:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
            return await func(*args, current_user=current_user, **kwargs)
        return wrapper
    return decorator
```

---

## API Design

### RESTful Endpoints

```
# BOM Items
GET    /api/v1/bom                    # List all items
POST   /api/v1/bom                    # Create item
GET    /api/v1/bom/{id}               # Get item
PUT    /api/v1/bom/{id}               # Update item
DELETE /api/v1/bom/{id}               # Delete item

# SolidWorks Integration
POST   /api/v1/cad/sync               # Sync BOM from SolidWorks
POST   /api/v1/cad/apply-sync         # Apply sync with conflict resolution
GET    /api/v1/cad/bom?file={path}    # Get BOM for file
POST   /api/v1/cad/images             # Upload component images
GET    /api/v1/cad/images/{part}      # Get component image
POST   /api/v1/cad/notify             # Send update notification
GET    /api/v1/cad/updates            # Get pending updates

# Order Tracking
GET    /api/v1/orders                 # List orders
POST   /api/v1/orders                 # Create order
GET    /api/v1/orders/{id}            # Get order
PUT    /api/v1/orders/{id}            # Update order
GET    /api/v1/orders/{id}/milestones # Get milestones
POST   /api/v1/orders/{id}/shipments  # Add shipment

# Authentication
POST   /api/v1/auth/login             # Login
POST   /api/v1/auth/register          # Register
POST   /api/v1/auth/refresh           # Refresh token
POST   /api/v1/auth/plugin-login      # Plugin authentication
```

### Request/Response Format

```json
// Request
{
  "part_number": "PART-001",
  "description": "Hex Bolt M8x30",
  "quantity": 4,
  "material": "Steel",
  "custom_properties": {
    "finish": "Zinc Plated",
    "vendor": "Fastenal"
  }
}

// Response
{
  "id": 123,
  "part_number": "PART-001",
  "description": "Hex Bolt M8x30",
  "quantity": 4,
  "material": "Steel",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}

// Error Response
{
  "detail": "Item not found",
  "status": 404,
  "error": "Not Found"
}
```

---

## Deployment Architecture

### Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: bom_db
      POSTGRES_USER: bom_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bom_user -d bom_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # FastAPI Backend
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql://bom_user:${DB_PASSWORD}@postgres:5432/bom_db
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: ${SECRET_KEY}
      SENTRY_DSN: ${SENTRY_DSN}
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./backend:/app
      - uploads_data:/app/uploads

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./frontend:/usr/share/nginx/html
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - backend

  # Prometheus Monitoring
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  # Grafana Dashboards
  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning

volumes:
  postgres_data:
  redis_data:
  uploads_data:
  prometheus_data:
  grafana_data:
```

### Production Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer (Nginx)                     │
├─────────────────────────────────────────────────────────────┤
│  SSL Termination → Rate Limiting → Reverse Proxy            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Servers                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Backend 1  │  │  Backend 2  │  │  Backend 3  │        │
│  │  (Uvicorn)  │  │  (Uvicorn)  │  │  (Uvicorn)  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ PostgreSQL  │  │   Redis     │  │   MinIO     │        │
│  │  (Primary + │  │  (Cluster)  │  │  (S3)       │        │
│  │   Replica)  │  │             │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## Development Workflow

### Git Workflow

```
main ← develop ← feature/xxx ← hotfix/xxx
  │       │           │              │
  │       │           │              └── Fix production issue
  │       │           └── New feature development
  │       └── Integration branch
  └── Production releases
```

### Development Setup

```bash
# Clone repository
git clone https://github.com/blackboxbom/bom-tool.git
cd bom-tool

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Database setup
createdb bom_db
python init_db.py
python seed_db.py

# Start backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend setup
cd ../"BOM and PRD"
python serve.py

# Open browser
http://localhost:3000
```

### Code Style

```python
# Python (PEP 8)
# - 4 spaces indentation
# - Max line length: 88 characters
# - Use type hints
# - Docstrings for all functions

def extract_bom(model: IModelDoc2) -> BomData:
    """Extract BOM from SolidWorks model.
    
    Args:
        model: SolidWorks model document
        
    Returns:
        BomData with extracted components
    """
    pass
```

```javascript
// JavaScript (ESLint + Prettier)
// - 2 spaces indentation
// - Semicolons required
// - Single quotes for strings
// - Arrow functions preferred

const extractBom = (model) => {
  // Implementation
};
```

---

## Performance Optimization

### Frontend Optimization

| Technique | Implementation | Impact |
|-----------|----------------|--------|
| Code Splitting | Dynamic imports | Reduced initial load |
| Lazy Loading | React.lazy() | Faster page loads |
| Memoization | React.memo | Reduced re-renders |
| Virtual Scrolling | Large lists | Better performance |
| Image Optimization | WebP format | Faster image loading |

### Backend Optimization

| Technique | Implementation | Impact |
|-----------|----------------|--------|
| Database Indexing | SQLAlchemy indexes | Faster queries |
| Connection Pooling | SQLAlchemy pool | Reduced connections |
| Caching | Redis | Reduced DB load |
| Async Operations | FastAPI async | Better concurrency |
| Pagination | Limit/offset | Reduced data transfer |

### Database Optimization

```sql
-- Query optimization
EXPLAIN ANALYZE 
SELECT * FROM bom_items 
WHERE part_number LIKE 'PART-%' 
AND material = 'Steel'
ORDER BY created_at DESC
LIMIT 100;

-- Create index for common queries
CREATE INDEX idx_bom_items_search 
ON bom_items(part_number, material, created_at);

-- Materialized view for dashboard
CREATE MATERIALIZED VIEW bom_summary AS
SELECT 
  project_id,
  COUNT(*) as total_items,
  SUM(quantity) as total_quantity,
  SUM(cost * quantity) as total_cost
FROM bom_items
GROUP BY project_id;
```

---

## Monitoring & Logging

### Monitoring Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Grafana Dashboard                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Request   │  │   Error     │  │   Custom    │        │
│  │   Rate      │  │   Rate      │  │   Metrics   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Prometheus                                │
├─────────────────────────────────────────────────────────────┤
│  Metrics Collection → Alert Rules → Notification            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   FastAPI   │  │  PostgreSQL │  │    Redis    │        │
│  │  Metrics    │  │  Metrics    │  │  Metrics    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Metrics Collected

```python
# app/monitoring/metrics.py
from prometheus_client import Counter, Histogram, Gauge

# Request metrics
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_LATENCY = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency',
    ['method', 'endpoint']
)

# Business metrics
BOM_ITEMS_CREATED = Counter(
    'bom_items_created_total',
    'Total BOM items created'
)

CAD_SYNC_OPERATIONS = Counter(
    'cad_sync_operations_total',
    'Total CAD sync operations',
    ['status']
)

ACTIVE_USERS = Gauge(
    'active_users',
    'Number of active users'
)

# Error metrics
ERROR_COUNT = Counter(
    'errors_total',
    'Total errors',
    ['type', 'endpoint']
)
```

### Health Checks

```python
# app/monitoring/health.py
from fastapi import APIRouter
from sqlalchemy import text
from app.core.deps import get_db, get_redis

router = APIRouter()

@router.get("/health")
async def health_check(db=Depends(get_db), redis=Depends(get_redis)):
    checks = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "checks": {}
    }
    
    # Database check
    try:
        db.execute(text("SELECT 1"))
        checks["checks"]["database"] = "healthy"
    except Exception as e:
        checks["checks"]["database"] = f"unhealthy: {str(e)}"
        checks["status"] = "degraded"
    
    # Redis check
    try:
        redis.ping()
        checks["checks"]["redis"] = "healthy"
    except Exception as e:
        checks["checks"]["redis"] = f"unhealthy: {str(e)}"
        checks["status"] = "degraded"
    
    return checks
```

---

## Testing Strategy

### Test Types

```
┌─────────────────────────────────────────────────────────────┐
│                    Testing Pyramid                           │
├─────────────────────────────────────────────────────────────┤
│                           ╱╲                                │
│                          ╱  ╲                               │
│                         ╱ E2E╲                              │
│                        ╱ Tests╲                             │
│                       ╱────────╲                            │
│                      ╱Integration╲                          │
│                     ╱   Tests     ╲                         │
│                    ╱────────────────╲                        │
│                   ╱   Unit Tests     ╲                      │
│                  ╱   (198 tests)      ╲                     │
│                 ╱──────────────────────╲                    │
└─────────────────────────────────────────────────────────────┘
```

### Unit Tests

```python
# app/tests/unit/test_bom_service.py
import pytest
from app.services.bom_service import BOMService
from app.schemas.bom import BOMItemCreate

def test_create_bom_item(db_session):
    service = BOMService(db_session)
    
    item = BOMItemCreate(
        part_number="TEST-001",
        description="Test Part",
        quantity=1,
        material="Steel"
    )
    
    result = service.create_item(item)
    
    assert result.part_number == "TEST-001"
    assert result.description == "Test Part"
    assert result.quantity == 1

def test_get_bom_item(db_session):
    service = BOMService(db_session)
    
    # Create item first
    item = service.create_item(BOMItemCreate(
        part_number="TEST-002",
        description="Test Part 2"
    ))
    
    # Get item
    result = service.get_item(item.id)
    
    assert result is not None
    assert result.part_number == "TEST-002"
```

### Integration Tests

```python
# app/tests/integration/test_api.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_bom_item():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/bom",
            json={
                "part_number": "API-001",
                "description": "API Test Part",
                "quantity": 1
            }
        )
    
    assert response.status_code == 201
    assert response.json()["part_number"] == "API-001"
```

### E2E Tests

```python
# app/tests/e2e/test_playwright.py
from playwright.async_api import async_playwright

async def test_bom_extraction():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        # Navigate to app
        await page.goto("http://localhost:3000")
        
        # Click Extract BOM
        await page.click("text=Extract BOM")
        
        # Wait for results
        await page.wait_for_selector(".bom-item")
        
        # Verify items
        items = await page.query_selector_all(".bom-item")
        assert len(items) > 0
        
        await browser.close()
```

### Load Tests

```python
# app/tests/load/locustfile.py
from locust import HttpUser, task, between

class BOMUser(HttpUser):
    wait_time = between(1, 3)
    
    @task(3)
    def view_bom(self):
        self.client.get("/api/v1/bom")
    
    @task(1)
    def create_bom_item(self):
        self.client.post("/api/v1/bom", json={
            "part_number": f"LOAD-{self.environment.runner.user_count}",
            "description": "Load test item",
            "quantity": 1
        })
    
    @task(2)
    def search_bom(self):
        self.client.get("/api/v1/bom?search=steel")
```

---

## Conclusion

The Blackbox BOM Management System is built with a modern, scalable technology stack:

- **Frontend**: React 18 with vanilla JavaScript (no build step)
- **Backend**: FastAPI with Python 3.11+
- **Database**: PostgreSQL 15+ with Redis caching
- **CAD Integration**: SolidWorks COM Add-in with C#
- **3D Viewing**: Three.js for browser-based rendering
- **Deployment**: Docker with Kubernetes support
- **Monitoring**: Prometheus + Grafana

The system supports:
- Complete BOM extraction from SolidWorks assemblies
- Real-time bidirectional sync
- Image extraction and 3D viewing
- Order tracking and procurement
- Enterprise security with RBAC
- Comprehensive testing and monitoring

---

*Last Updated: January 2024*
