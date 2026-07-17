# Blackbox BOM - SolidWorks Plugin User Manual

## Quick Start Guide

This manual provides step-by-step instructions for using the Blackbox BOM SolidWorks Plugin.

---

## Chapter 1: Installation

### Step 1: Download the Installer

Download `BlackboxBOM_SolidWorks_Setup_1.0.0.exe` from the official website.

### Step 2: Run the Installer

1. Close SolidWorks if it's running
2. Right-click the installer → "Run as administrator"
3. Follow the wizard:
   - Accept the license agreement
   - Choose installation directory (default: `C:\Program Files\BlackboxBOM\SolidWorks`)
   - Select components to install
   - Click "Install"

### Step 3: Verify Installation

1. Open SolidWorks
2. Go to **Tools → Add-ins**
3. Look for "Blackbox BOM" in the list
4. Check the box next to it
5. Click **OK**

### Step 4: First-Time Setup

1. Look for the Blackbox BOM menu in the menu bar
2. Click **Blackbox BOM → Settings**
3. Enter your API URL (default: `http://localhost:8000`)
4. Enter your API Key
5. Click **Test Connection**
6. Click **Save**

---

## Chapter 2: Extracting BOM

### Extracting from a Single Assembly

1. **Open the Assembly**
   - File → Open → Select your `.SLDASM` file
   - Wait for all components to load

2. **Extract BOM**
   - Click the **Extract BOM** button in the toolbar
   - OR go to **Blackbox BOM → Extract BOM**
   - Wait for extraction to complete

3. **Review Results**
   - The Task Pane will display the extracted BOM
   - Review all components, quantities, and properties

4. **Sync to Blackbox**
   - Click **Sync** button
   - Wait for sync to complete
   - Check status message

### Extracting from Sub-Assemblies

1. Open the top-level assembly
2. The plugin automatically extracts all sub-assemblies
3. Components are listed with full hierarchy
4. Quantities are calculated correctly

### What Gets Extracted

| Data Type | Description |
|-----------|-------------|
| Part Number | From custom properties or filename |
| Description | From custom properties |
| Quantity | Calculated from patterns and instances |
| Material | Material assignment |
| Weight | Calculated mass |
| Vendor | From custom properties |
| Cost | From custom properties |
| Custom Properties | All custom properties |
| Mass Properties | Volume, surface area, center of mass |
| Dimensions | Sketch dimensions and feature parameters |
| Feature Tree | Complete feature hierarchy |

---

## Chapter 3: Extracting Images

### Extract Component Images

1. **Open Assembly**
   - Open the assembly containing components

2. **Start Extraction**
   - Click **Extract Images** button
   - OR go to **Blackbox BOM → Extract Images**

3. **Wait for Processing**
   - Each component is rendered
   - Multiple views are captured
   - Images are uploaded to Blackbox

4. **View in Blackbox**
   - Login to Blackbox BOM
   - Navigate to the assembly
   - View component images

### Image Types Captured

| Image Type | Size | Use Case |
|------------|------|----------|
| Thumbnail 32 | 32x32 | List views |
| Thumbnail 64 | 64x64 | Cards |
| Thumbnail 128 | 128x128 | Reports |
| Thumbnail 256 | 256x256 | Detailed views |
| Isometric | Full size | 3D viewer |
| Front View | Full size | Technical docs |
| Top View | Full size | Layout planning |
| Right View | Full size | Side profiles |

### Tips for Better Images

- Ensure components are fully loaded
- Set desired appearance before extraction
- Use high-quality rendering settings in SolidWorks
- Clean up any error marks in the model

---

## Chapter 4: Using the Embedded Viewer

### Task Pane Overview

The Task Pane appears on the right side of SolidWorks:

```
┌─────────────────────────────┐
│ [Extract] [Sync] [Settings]│
├─────────────────────────────┤
│ Search: [_______________]   │
├─────────────────────────────┤
│ Part Number | Desc | Qty   │
│ PART-001    | Bolt | 4     │
│ PART-002    | Nut  | 4     │
│ PART-003    | Plate| 1     │
├─────────────────────────────┤
│ Feature Tree                │
│ └── Assembly                │
│     ├── PART-001            │
│     │   ├── Extrude1        │
│     │   ├── Fillet1         │
│     │   └── Hole1           │
│     └── PART-002            │
│         └── Revolve1        │
├─────────────────────────────┤
│ Details                     │
│ Part Number: PART-001       │
│ Description: Hex Bolt M8x30│
│ Material: Steel             │
│ Weight: 0.025 kg            │
└─────────────────────────────┘
```

### Viewing Component Details

1. Double-click any item in the BOM list
2. Details panel shows:
   - Basic properties
   - Mass properties
   - Bounding box
   - Custom properties
3. Preview image loads if available

### Viewing Feature Tree

1. Expand the assembly tree
2. Click on any feature
3. Details panel shows:
   - Feature parameters
   - Dimension values
   - Feature status

### Using Context Menu

Right-click on any component:

- **View in 3D Viewer**: Opens browser 3D viewer
- **Export Image**: Save component image
- **Edit Properties**: Modify properties
- **Remove**: Remove from BOM

---

## Chapter 5: Real-time Sync

### Automatic Sync

1. Enable in Settings: **Auto-Sync = true**
2. Set sync interval (default: 30 seconds)
3. Changes are synced automatically:
   - On document save
   - On component add/remove
   - On feature changes

### Manual Sync

1. Click **Sync** button in toolbar
2. Wait for sync to complete
3. Review sync results:
   - Items added
   - Items updated
   - Conflicts detected

### Handling Conflicts

When conflicts are detected:

1. A notification appears in the Task Pane
2. Review the conflict details:
   - Local value
   - Remote value
   - Who changed it
   - When it was changed
3. Choose resolution:
   - **Keep Local**: Use your version
   - **Accept Remote**: Use Blackbox version
   - **Merge**: Manually combine changes

---

## Chapter 6: 3D Viewer

### Opening the 3D Viewer

1. Click **3D Viewer** button in toolbar
2. Browser opens with the viewer
3. Model loads automatically

### Viewer Controls

| Control | Action |
|---------|--------|
| Left Mouse + Drag | Orbit |
| Right Mouse + Drag | Pan |
| Scroll Wheel | Zoom |
| Middle Mouse + Drag | Pan |

### View Presets

- **Perspective**: Default 3D view
- **Top**: Looking down
- **Front**: Looking from front
- **Right**: Looking from right side
- **Isometric**: Equal angle view

### Measurement Tool

1. Click **Measure** button
2. Click first point on model
3. Click second point on model
4. Distance is displayed

### Export Options

- **Screenshot**: Save current view as PNG
- **Export STL**: Download model as STL file

### Supported Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| STL | `.stl` | Binary and ASCII |
| OBJ | `.obj` | With materials |
| GLTF | `.gltf`, `.glb` | Binary format |
| STEP | `.step`, `.stp` | Via conversion |

---

## Chapter 7: Model Updates

### Applying Changes from Blackbox

1. Make changes in Blackbox BOM web interface
2. In SolidWorks, click **Apply Blackbox Changes**
3. Review changes in dialog:
   - Property changes
   - Dimension changes
   - Material changes
4. Click **Apply** to accept
5. Model rebuilds automatically

### Supported Change Types

| Change Type | Description |
|-------------|-------------|
| Custom Property | Update any custom property |
| Dimension | Modify sketch dimensions |
| Material | Change material assignment |
| Configuration | Update configuration properties |
| Feature | Modify feature parameters |
| Appearance | Change color/appearance |

### Change History

All changes are logged:
- Who made the change
- When it was made
- What was changed
- Previous value
- New value

---

## Chapter 8: Settings

### API Connection Settings

| Setting | Description | Default |
|---------|-------------|---------|
| API URL | Backend server address | `http://localhost:8000` |
| API Key | Authentication key | - |
| License Key | Plugin license | - |

### Sync Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Auto-Sync | Enable automatic sync | `true` |
| Auto-Extract | Auto-extract on open | `true` |
| Sync Interval | Seconds between syncs | `30` |

### Advanced Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Log Level | Logging verbosity | `Info` |
| Temp Directory | Temporary file location | `%TEMP%\BlackboxBOM` |
| Image Quality | Render quality (1-10) | `7` |

---

## Chapter 9: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+B` | Extract BOM |
| `Ctrl+Shift+S` | Sync to Blackbox |
| `Ctrl+Shift+I` | Extract Images |
| `Ctrl+Shift+V` | Open 3D Viewer |
| `Ctrl+Shift+R` | Refresh BOM |
| `Ctrl+Shift+L` | Open Settings |

---

## Chapter 10: Best Practices

### Before Extracting BOM

1. **Save your work** - Ensure all changes are saved
2. **Rebuild the model** - Fix any rebuild errors
3. **Check for errors** - Resolve all warnings/errors
4. **Update materials** - Ensure materials are assigned
5. **Update properties** - Fill in custom properties

### For Best Image Quality

1. Set appearance/color on components
2. Use high-quality rendering in SolidWorks
3. Orient model to desired view
4. Hide any construction geometry

### For Accurate Quantities

1. Ensure patterns are properly defined
2. Check for suppressed components
3. Verify instance counts
4. Review virtual components

### For Efficient Workflow

1. Enable auto-sync for hands-off operation
2. Set appropriate sync interval
3. Use keyboard shortcuts
4. Organize models with consistent naming

---

## Chapter 11: Troubleshooting

### Issue: Plugin not visible in SolidWorks

**Solution:**
1. Go to Tools → Add-ins
2. Check "Blackbox BOM"
3. If not listed, reinstall plugin
4. Run `regsvr32` on the DLL

### Issue: "Connection Failed" error

**Solution:**
1. Verify backend is running
2. Check API URL is correct
3. Test with browser: `http://localhost:8000/api/v1/health`
4. Check firewall settings

### Issue: BOM extraction incomplete

**Solution:**
1. Verify all components are loaded
2. Check for suppressed components
3. Ensure custom properties exist
4. Check file permissions

### Issue: Images not uploading

**Solution:**
1. Check disk space
2. Verify API connection
3. Check image size limits
4. Review backend logs

### Issue: Sync conflicts

**Solution:**
1. Review conflict details
2. Choose appropriate resolution
3. Communicate with team
4. Establish sync protocols

---

## Chapter 12: FAQ

### Q: Does this work with SolidWorks 2016?

**A:** No, the plugin requires SolidWorks 2018 or later.

### Q: Can I extract BOM from drawings?

**A:** Currently, BOM extraction is supported for assemblies and parts only.

### Q: How do I update the plugin?

**A:** Download the latest installer and run it. It will upgrade the existing installation.

### Q: Can I use this without the backend?

**A:** Some features (like 3D viewer) work standalone, but full functionality requires the backend.

### Q: Is my data secure?

**A:** All communication uses HTTPS. API keys are encrypted locally. No data is shared without permission.

---

## Support

**Email:** support@blackboxbom.com  
**Documentation:** https://docs.blackboxbom.com  
**GitHub:** https://github.com/blackboxbom  

---

## Version History

### v1.0.0
- Initial release
- BOM extraction
- Image extraction
- Real-time sync
- 3D viewer
- Embedded Task Pane

---

© 2024 Blackbox BOM. All rights reserved.
