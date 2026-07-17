# Blackbox BOM - SolidWorks Integration Guide

## Table of Contents

1. [Overview](#overview)
2. [System Requirements](#system-requirements)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Features](#features)
6. [Usage Guide](#usage-guide)
7. [Troubleshooting](#troubleshooting)
8. [API Reference](#api-reference)

---

## Overview

The Blackbox BOM SolidWorks Plugin provides seamless integration between SolidWorks CAD software and the Blackbox BOM Management System. It enables:

- **Automatic BOM Extraction**: Extract complete Bill of Materials from assemblies
- **Component Image Extraction**: Capture thumbnails and renders of individual parts
- **Real-time Bidirectional Sync**: Sync changes between SolidWorks and Blackbox
- **Feature Recognition**: Access feature tree, dimensions, and parametric data
- **3D Viewer**: View models directly in the browser
- **Embedded Viewer Panel**: See BOM data while working in SolidWorks

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SolidWorks                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Blackbox BOM Plugin                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ BOM Extractor│  │Image Extractor│  │ Event Watcher  │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ Model Updater│  │  API Client │  │  Task Pane UI   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Blackbox BOM Backend                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  CAD API    │  │  BOM Store  │  │  Real-time Sync Engine  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Browser 3D Viewer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  three.js   │  │  STL Loader │  │  Orbit Controls         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## System Requirements

### SolidWorks Requirements
- **SolidWorks Version**: 2018 or later (2020+ recommended)
- **SolidWorks Type**: Standard, Professional, or Premium
- **License**: Any valid SolidWorks license

### Plugin Requirements
- **Operating System**: Windows 10/11 (64-bit)
- **.NET Framework**: 4.8 or later
- **Visual C++ Redistributable**: 2019 or later
- **RAM**: 8GB minimum, 16GB recommended
- **Disk Space**: 500MB for plugin installation

### Backend Requirements
- **Python**: 3.9+
- **PostgreSQL**: 12+
- **Redis**: 6+ (optional, for caching)
- **API Server**: Running on port 8000

---

## Installation

### Method 1: EXE Installer (Recommended)

1. **Download** the installer: `BlackboxBOM_SolidWorks_Setup_1.0.0.exe`

2. **Run** the installer as Administrator
   - Right-click → "Run as administrator"
   - Follow the installation wizard

3. **Verify Installation**
   - Open SolidWorks
   - Go to Tools → Add-ins
   - Check "Blackbox BOM" in the list
   - Click OK

4. **Configure API Connection**
   - Click the Blackbox BOM menu in SolidWorks
   - Select "Settings"
   - Enter your API URL (default: `http://localhost:8000`)
   - Enter your API Key
   - Click "Test Connection"
   - Click "Save"

### Method 2: Manual Installation

1. **Copy Files**
   ```
   Copy these files to C:\Program Files\BlackboxBOM\SolidWorks\:
   - BlackboxBOM.SolidWorks.dll
   - BlackboxBOM.SolidWorks.pdb
   - Newtonsoft.Json.dll
   - SldWorks.Interop.dll
   - SldWorks.Interop.sldworks.dll
   - SldWorks.Interop.swconst.dll
   ```

2. **Register COM DLL**
   ```cmd
   regsvr32 "C:\Program Files\BlackboxBOM\SolidWorks\BlackboxBOM.SolidWorks.dll"
   ```

3. **Add Registry Keys**
   ```reg
   Windows Registry Editor Version 5.00

   [HKEY_LOCAL_MACHINE\SOFTWARE\SolidWorks\Addins\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}]
   @=dword:00000000
   "Description"="Blackbox BOM Management Integration"
   "Title"="Blackbox BOM"

   [HKEY_CURRENT_USER\Software\SolidWorks\AddInsStartup\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}]
   @=dword:00000001
   ```

4. **Restart SolidWorks**

### Method 3: Build from Source

1. **Clone Repository**
   ```cmd
   git clone https://github.com/blackboxbom/solidworks-plugin.git
   cd solidworks-plugin
   ```

2. **Open in Visual Studio**
   - Open `BlackboxBOM.SolidWorks.sln`
   - Restore NuGet packages
   - Build in Release mode

3. **Install**
   - Copy build output to plugin directory
   - Register COM DLL
   - Add registry keys

---

## Configuration

### API Connection Settings

The plugin stores settings in:
```
%LOCALAPPDATA%\BlackboxBOM\settings.json
```

**Settings File Format:**
```json
{
  "api_url": "http://localhost:8000",
  "api_key": "your-api-key-here",
  "license_key": "BB-XXXX-XXXX-XXXX",
  "auto_sync": true,
  "auto_extract": true,
  "sync_interval": 30
}
```

### Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `api_url` | string | `http://localhost:8000` | Backend API URL |
| `api_key` | string | - | Authentication API key |
| `license_key` | string | - | Plugin license key |
| `auto_sync` | bool | `true` | Auto-sync on save |
| `auto_extract` | bool | `true` | Auto-extract BOM on open |
| `sync_interval` | int | `30` | Sync interval in seconds |

### License Activation

1. Open plugin Settings
2. Enter your license key
3. Click "Activate License"
4. Verify activation status

---

## Features

### 1. BOM Extraction

**What it extracts:**
- Part numbers and descriptions
- Quantities (including pattern instances)
- Materials and weights
- Vendor and cost information
- Custom properties
- Mass properties (volume, surface area, center of mass)
- Bounding box dimensions
- Feature tree structure
- Sketch dimensions

**How to use:**
1. Open an assembly in SolidWorks
2. Click "Extract BOM" in the toolbar
3. View results in the Task Pane
4. Click "Sync" to upload to Blackbox

### 2. Image Extraction

**What it captures:**
- Thumbnail images (32x32, 64x64, 128x128, 256x256)
- Isometric view renders
- Standard views (Front, Top, Right, etc.)
- Component appearance/colors

**How to use:**
1. Open an assembly in SolidWorks
2. Click "Extract Images" in the toolbar
3. Images are uploaded to Blackbox
4. View in browser or embed in reports

### 3. Real-time Bidirectional Sync

**Sync events:**
- Document save
- Component add/remove
- Feature create/modify/delete
- Property changes

**How it works:**
1. Plugin watches SolidWorks events
2. Changes are queued for sync
3. Sync happens automatically (or manually)
4. Conflicts are detected and reported

### 4. 3D Viewer

**Supported formats:**
- STL (binary and ASCII)
- OBJ
- GLTF/GLB
- STEP (via conversion)

**Features:**
- Orbit, zoom, pan controls
- Multiple view presets (Top, Front, Right, Isometric)
- Wireframe mode
- Grid and axes display
- Measurement tool
- Screenshot export
- STL export

### 5. Embedded Viewer Panel

**Location:** SolidWorks Task Pane (right side)

**Features:**
- BOM list with sorting/filtering
- Component details panel
- Feature tree view
- Preview images
- Right-click context menu
- Search functionality

### 6. Feature Recognition

**Recognized features:**
- Extrudes (Boss/Base, Cut)
- Revolves
- Fillets
- Hole Wizard holes
- Patterns (Linear, Circular)
- Sketches and dimensions

**Extracted data:**
- Feature parameters
- Dimension values
- Sketch geometry
- Feature tree structure

### 7. Model Updates from Blackbox

**Supported updates:**
- Custom property changes
- Dimension modifications
- Material assignments
- Configuration changes
- Feature parameter updates
- Appearance/color changes

**How to use:**
1. Make changes in Blackbox BOM
2. Click "Apply Blackbox Changes" in SolidWorks
3. Review and accept changes
4. Model is updated and rebuilt

---

## Usage Guide

### Basic Workflow

1. **Start Backend**
   ```cmd
   cd backend
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

2. **Open SolidWorks**
   - Plugin loads automatically
   - Task Pane appears on right side

3. **Configure Connection**
   - Click Settings in toolbar
   - Enter API URL and key
   - Test connection
   - Save settings

4. **Extract BOM**
   - Open assembly
   - Click "Extract BOM"
   - Review in Task Pane
   - Click "Sync" to upload

5. **Extract Images**
   - Click "Extract Images"
   - Wait for processing
   - View in Blackbox BOM

6. **View in 3D**
   - Click "3D Viewer"
   - Browser opens with viewer
   - Interact with model

### Advanced Workflows

#### Auto-sync on Save
1. Enable "Auto-Sync" in Settings
2. Set sync interval (default: 30 seconds)
3. Changes sync automatically on save

#### Batch Processing
1. Open multiple assemblies
2. Use "Extract BOM" on each
3. Sync all to Blackbox
4. Review consolidated BOM

#### Conflict Resolution
1. When conflicts detected, review in Task Pane
2. Choose to accept local or remote changes
3. Conflicts are logged for audit

---

## Troubleshooting

### Common Issues

#### Plugin Not Loading
**Symptoms:** Blackbox BOM menu not visible

**Solutions:**
1. Check SolidWorks Add-ins dialog
2. Verify DLL is registered
3. Check Windows Event Viewer for errors
4. Reinstall plugin

#### Connection Failed
**Symptoms:** "Connection Failed" in Settings

**Solutions:**
1. Verify backend is running
2. Check API URL is correct
3. Verify firewall allows port 8000
4. Check API key is valid

#### BOM Extraction Fails
**Symptoms:** Error when clicking "Extract BOM"

**Solutions:**
1. Verify assembly is open
2. Check components are not suppressed
3. Verify file permissions
4. Check SolidWorks version compatibility

#### Image Extraction Fails
**Symptoms:** No images uploaded

**Solutions:**
1. Verify model is fully loaded
2. Check disk space for temp files
3. Verify API connection
4. Check image upload permissions

### Logs

**Plugin logs location:**
```
%LOCALAPPDATA%\BlackboxBOM\logs\
```

**Backend logs:**
```
backend/server.log
```

### Support

**Contact Support:**
- Email: support@blackboxbom.com
- Documentation: https://docs.blackboxbom.com
- GitHub Issues: https://github.com/blackboxbom/issues

---

## API Reference

### Authentication

```http
POST /api/v1/auth/plugin-login
Content-Type: application/json

{
  "api_key": "your-api-key",
  "client_type": "solidworks_addin",
  "client_version": "1.0.0"
}
```

### BOM Sync

```http
POST /api/v1/cad/sync
Content-Type: application/json

{
  "source_file": "Assembly.SLDASM",
  "model_type": "Assembly",
  "items": [
    {
      "component_name": "Part1",
      "part_number": "PART-001",
      "quantity": 2,
      "material": "Steel"
    }
  ]
}
```

### Image Upload

```http
POST /api/v1/cad/images
Content-Type: application/json

{
  "part_number": "PART-001",
  "isometric_view": "base64-encoded-image",
  "thumbnail_128": "base64-encoded-thumbnail"
}
```

### Get Updates

```http
GET /api/v1/cad/updates?session=abc123
```

### Apply Changes

```http
POST /api/v1/cad/apply-changes
Content-Type: application/json

{
  "model": "Assembly.SLDASM",
  "changes": [
    {
      "change_id": "123",
      "type": "custom_property",
      "part_number": "PART-001",
      "property": "Description",
      "new_value": "Updated Description"
    }
  ]
}
```

---

## File Structure

```
solidworks-plugin/
├── BlackboxBOM.SolidWorks/           # Main plugin project
│   ├── BlackboxBOM.SolidWorks.csproj
│   ├── BlackboxBomAddin.cs           # Main COM add-in
│   ├── BomExtractor.cs               # BOM extraction logic
│   ├── ImageExtractor.cs             # Image extraction
│   ├── ApiClient.cs                  # API communication
│   ├── EventWatcher.cs               # Real-time event monitoring
│   ├── BomPanel.cs                   # Embedded viewer UI
│   ├── ModelUpdater.cs               # Apply changes to models
│   ├── SettingsForm.cs               # Settings dialog
│   └── Models.cs                     # Data models
├── Installer/                         # Inno Setup installer
│   └── BlackboxBOM_SolidWorks.iss
├── docs/                             # Documentation
│   ├── SolidWorks_Integration_Guide.md
│   └── SolidWorks_Plugin_User_Manual.md
└── README.md
```

---

## Version History

### v1.0.0 (2024)
- Initial release
- BOM extraction from assemblies
- Image extraction with multiple views
- Real-time bidirectional sync
- Embedded Task Pane viewer
- Feature recognition and parametric data
- Model updates from Blackbox
- License verification system
- Inno Setup installer

---

## License

This software is proprietary and confidential. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

© 2024 Blackbox BOM. All rights reserved.
