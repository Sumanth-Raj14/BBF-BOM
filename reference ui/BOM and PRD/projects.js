// Multi-project BOM datasets. Switching the workspace replaces `rows`,
// `project`, and `rollup` with the matching entry.

window.PROJECTS = {
  "ATLAS": {
    project: { code: "ATL-MFR-A", name: "Mainframe Assembly", rev: "C", version: "v3.2.0", status: "Released", owner: "E. Chen", updated: "2026-05-12" },
    // rows + rollup come from BOM_DATA (the original ATLAS dataset)
    rows: null,
    rollup: null,
  },

  "HORIZON": {
    project: { code: "HZN-POD-A", name: "Sensor Pod", rev: "B", version: "v1.4.0", status: "Review", owner: "M. Park", updated: "2026-05-21" },
    rollup: { parts: 42, unique: 36, bomCost: 982.40, lastCost: 1014.00, lead: 18, vendors: 9, countries: 4, risk: 1 },
    rows: [
      {
        id: "h1", pn: "HZN-POD-A", name: "Sensor Pod Assembly", rev: "B",
        qty: 1, uom: "EA", category: "Assembly", vendor: "—",
        cost: 982.40, lead: null, origin: "—", status: "Review", trend: null, assembly: true,
        children: [
          {
            id: "h1.1", pn: "HZN-POD-HSG", name: "Housing Subassembly", rev: "B",
            qty: 1, uom: "EA", category: "Assembly", vendor: "—",
            cost: 184.20, lead: null, origin: "—", status: "Released", assembly: true,
            children: [
              { id:"h1.1.1", pn:"MEC-SHELL-A", name:"Outer Shell, IP67", rev:"B", qty:1, uom:"EA", category:"Mechanical", vendor:"Protolabs", cost:78.00, lead:10, origin:"US", status:"Released", trend:[72,74,75,76,77,78,78] },
              { id:"h1.1.2", pn:"MEC-DOME-A", name:"Optical Dome, PMMA", rev:"A", qty:1, uom:"EA", category:"Optical", vendor:"Edmund Optics", cost:62.00, lead:14, origin:"US", status:"Released", trend:[58,59,60,61,62,62,62] },
              { id:"h1.1.3", pn:"MEC-GSK-IP67", name:"Gasket, EPDM IP67", rev:"—", qty:2, uom:"EA", category:"Hardware", vendor:"Lee Spring", cost:1.40, lead:7, origin:"US", status:"Released" },
              { id:"h1.1.4", pn:"HW-SCR-M2-04", name:"Screw, M2×4 SS", rev:"—", qty:8, uom:"EA", category:"Hardware", vendor:"McMaster", cost:0.06, lead:2, origin:"CN", status:"Released" },
            ],
          },
          {
            id: "h1.2", pn: "HZN-POD-CTL", name: "Control PCB", rev: "A",
            qty: 1, uom: "EA", category: "Assembly", vendor: "—",
            cost: 412.30, lead: null, origin: "—", status: "Review", assembly: true,
            children: [
              { id:"h1.2.1", pn:"EL-MCU-STM32H7", name:"MCU Module, STM32H743", rev:"B", qty:1, uom:"EA", category:"Electrical", vendor:"STMicro", cost:18.40, lead:42, origin:"FR", status:"Released", trend:[14,15,16,17,18,18.4,18.4] },
              { id:"h1.2.2", pn:"EL-CAM-IMX477", name:"Image Sensor, IMX477", rev:"B", qty:1, uom:"EA", category:"Optical", vendor:"Arducam", cost:48.00, lead:18, origin:"CN", status:"Released" },
              { id:"h1.2.3", pn:"EL-LIDAR-04", name:"LiDAR Module, 4m TOF", rev:"A", qty:1, uom:"EA", category:"Optical", vendor:"Garmin", cost:142.00, lead:21, origin:"US", status:"Review", trend:[130,134,138,140,142,142,142] },
              { id:"h1.2.4", pn:"EL-IMU-BMI270", name:"IMU, BMI270", rev:"A", qty:1, uom:"EA", category:"Electrical", vendor:"Bosch", cost:9.20, lead:14, origin:"DE", status:"Released" },
              { id:"h1.2.5", pn:"EL-PCB-HZN-R2", name:"Main PCB, 6-layer", rev:"B", qty:1, uom:"EA", category:"Electrical", vendor:"JLCPCB", cost:88.00, lead:14, origin:"CN", status:"Review", trend:[80,82,84,86,87,88,88] },
              { id:"h1.2.6", pn:"EL-MEM-NOR-128M", name:"Flash, NOR 128Mb", rev:"A", qty:1, uom:"EA", category:"Electrical", vendor:"Winbond", cost:2.80, lead:14, origin:"TW", status:"Released" },
            ],
          },
          {
            id: "h1.3", pn: "HZN-POD-PWR", name: "Power Module", rev: "A",
            qty: 1, uom: "EA", category: "Assembly", vendor: "—",
            cost: 248.10, lead: null, origin: "—", status: "Released", assembly: true,
            children: [
              { id:"h1.3.1", pn:"EL-BAT-LP503562", name:"LiPo Cell, 1200mAh", rev:"A", qty:1, uom:"EA", category:"Electrical", vendor:"Panasonic", cost:14.20, lead:28, origin:"JP", status:"Released", trend:[12,13,13.5,14,14.2,14.2,14.2] },
              { id:"h1.3.2", pn:"EL-BMS-1S", name:"BMS, 1S 3A", rev:"A", qty:1, uom:"EA", category:"Electrical", vendor:"TI", cost:4.40, lead:21, origin:"US", status:"Released" },
              { id:"h1.3.3", pn:"EL-CHG-USBC", name:"USB-C PD Sink, 5V/2A", rev:"A", qty:1, uom:"EA", category:"Electrical", vendor:"Cypress", cost:6.80, lead:14, origin:"US", status:"Released" },
              { id:"h1.3.4", pn:"CB-USB-C-15CM", name:"USB-C Cable, 15cm", rev:"—", qty:1, uom:"EA", category:"Cable", vendor:"Tripp Lite", cost:3.20, lead:7, origin:"CN", status:"Released" },
            ],
          },
          {
            id: "h1.4", pn: "HZN-POD-MNT", name: "Mounting Hardware", rev: "A",
            qty: 1, uom: "EA", category: "Assembly", vendor: "—",
            cost: 137.80, lead: null, origin: "—", status: "Released", assembly: true,
            children: [
              { id:"h1.4.1", pn:"MEC-MNT-MAG", name:"Magnetic Mount, N52", rev:"A", qty:1, uom:"EA", category:"Mechanical", vendor:"K&J Magnetics", cost:18.00, lead:7, origin:"US", status:"Released" },
              { id:"h1.4.2", pn:"MEC-MNT-1/4-20", name:"1/4-20 Tripod Insert", rev:"—", qty:1, uom:"EA", category:"Hardware", vendor:"McMaster", cost:1.20, lead:2, origin:"US", status:"Released" },
              { id:"h1.4.3", pn:"CB-ETH-CAT6-2M", name:"Ethernet Cable Cat6 2m", rev:"—", qty:1, uom:"EA", category:"Cable", vendor:"Belden", cost:12.40, lead:14, origin:"US", status:"Released" },
            ],
          },
        ],
      },
    ],
  },

  "ATLAS-LITE": {
    project: { code: "ATL-EV-A", name: "Eval Board", rev: "A", version: "v1.0.0", status: "Draft", owner: "R. Sato", updated: "2026-05-08" },
    rollup: { parts: 24, unique: 21, bomCost: 156.40, lastCost: 168.00, lead: 9, vendors: 5, countries: 3, risk: 0 },
    rows: [
      {
        id: "l1", pn: "ATL-EV-A", name: "Eval Board v1.0", rev: "A",
        qty: 1, uom: "EA", category: "Assembly", vendor: "—",
        cost: 156.40, lead: null, origin: "—", status: "Draft", trend: null, assembly: true,
        children: [
          {
            id: "l1.1", pn: "EV-PCB-A", name: "Main PCB", rev: "A",
            qty: 1, uom: "EA", category: "Assembly", vendor: "—",
            cost: 108.20, lead: null, origin: "—", status: "Draft", assembly: true,
            children: [
              { id:"l1.1.1", pn:"EL-PCB-EV-2L", name:"PCB, 2-layer 100×80mm", rev:"A", qty:1, uom:"EA", category:"Electrical", vendor:"JLCPCB", cost:14.00, lead:9, origin:"CN", status:"Draft", trend:[12,12,13,13.5,14,14,14] },
              { id:"l1.1.2", pn:"EL-MCU-STM32F4", name:"MCU, STM32F407VGT6", rev:"D", qty:1, uom:"EA", category:"Electrical", vendor:"STMicro", cost:7.20, lead:35, origin:"FR", status:"Draft" },
              { id:"l1.1.3", pn:"EL-USB-MICRO", name:"USB Micro-B Receptacle", rev:"A", qty:1, uom:"EA", category:"Electrical", vendor:"Molex", cost:0.80, lead:7, origin:"US", status:"Draft" },
              { id:"l1.1.4", pn:"EL-LED-3MM-G", name:"LED, 3mm Green", rev:"—", qty:4, uom:"EA", category:"Electrical", vendor:"Kingbright", cost:0.18, lead:7, origin:"TW", status:"Draft" },
              { id:"l1.1.5", pn:"EL-CAP-10UF-25V", name:"Capacitor, 10µF 25V", rev:"—", qty:14, uom:"EA", category:"Electrical", vendor:"Nichicon", cost:0.06, lead:14, origin:"JP", status:"Draft" },
              { id:"l1.1.6", pn:"EL-RES-10K-1%", name:"Resistor, 10kΩ 0805", rev:"—", qty:24, uom:"EA", category:"Electrical", vendor:"Yageo", cost:0.01, lead:7, origin:"TW", status:"Draft" },
              { id:"l1.1.7", pn:"EL-HDR-2X20", name:"Header, 2×20 0.1\"", rev:"—", qty:1, uom:"EA", category:"Electrical", vendor:"Sullins", cost:0.85, lead:7, origin:"US", status:"Draft" },
              { id:"l1.1.8", pn:"EL-BTN-TACTILE", name:"Tactile Switch, 6mm", rev:"—", qty:2, uom:"EA", category:"Electrical", vendor:"Omron", cost:0.32, lead:14, origin:"JP", status:"Draft" },
            ],
          },
          {
            id: "l1.2", pn: "EV-ACC-A", name: "Accessories Kit", rev: "A",
            qty: 1, uom: "EA", category: "Assembly", vendor: "—",
            cost: 48.20, lead: null, origin: "—", status: "Draft", assembly: true,
            children: [
              { id:"l1.2.1", pn:"CB-USB-A-30CM", name:"USB-A→Micro Cable 30cm", rev:"—", qty:1, uom:"EA", category:"Cable", vendor:"Tripp Lite", cost:2.10, lead:7, origin:"CN", status:"Draft" },
              { id:"l1.2.2", pn:"MEC-FT-RUBBER", name:"Rubber Foot, Adhesive", rev:"—", qty:4, uom:"EA", category:"Hardware", vendor:"McMaster", cost:0.15, lead:2, origin:"US", status:"Draft" },
              { id:"l1.2.3", pn:"DOC-EV-QUICK", name:"Quick Start Guide", rev:"A", qty:1, uom:"EA", category:"Hardware", vendor:"Internal", cost:0.40, lead:0, origin:"—", status:"Draft" },
            ],
          },
        ],
      },
    ],
  },

  "NEBULA": {
    project: { code: "NEB-IO-A", name: "I/O Module", rev: "—", version: "v0.3.0", status: "Draft", owner: "K. Singh", updated: "2026-05-22" },
    rollup: { parts: 8, unique: 8, bomCost: 24.60, lastCost: 24.60, lead: 14, vendors: 4, countries: 2, risk: 0 },
    rows: [
      {
        id: "n1", pn: "NEB-IO-A", name: "I/O Module v0.3 (early)", rev: "—",
        qty: 1, uom: "EA", category: "Assembly", vendor: "—",
        cost: 24.60, lead: null, origin: "—", status: "Draft", trend: null, assembly: true,
        children: [
          { id:"n1.1", pn:"EL-PCB-NEB-2L", name:"PCB stub (4-layer)", rev:"—", qty:1, uom:"EA", category:"Electrical", vendor:"JLCPCB", cost:18.00, lead:14, origin:"CN", status:"Draft" },
          { id:"n1.2", pn:"EL-CON-RJ45", name:"Connector, RJ45", rev:"A", qty:4, uom:"EA", category:"Electrical", vendor:"Amphenol", cost:1.80, lead:9, origin:"US", status:"Draft" },
          { id:"n1.3", pn:"EL-CON-USBC", name:"Connector, USB-C", rev:"B", qty:2, uom:"EA", category:"Electrical", vendor:"Hirose", cost:1.20, lead:14, origin:"JP", status:"Draft" },
          { id:"n1.4", pn:"EL-IND-LED-3MM", name:"LED, 3mm RGB", rev:"—", qty:8, uom:"EA", category:"Electrical", vendor:"Kingbright", cost:0.40, lead:7, origin:"TW", status:"Draft" },
          { id:"n1.5", pn:"HW-FAS-M3-08", name:"Screw, M3×8 Socket", rev:"—", qty:6, uom:"EA", category:"Hardware", vendor:"McMaster", cost:0.08, lead:2, origin:"CN", status:"Draft" },
        ],
      },
    ],
  },
};

// Lazy-fill ATLAS from BOM_DATA (deferred so BOM_DATA is loaded first)
window.PROJECTS["ATLAS"].rows = window.BOM_DATA.rows;
window.PROJECTS["ATLAS"].rollup = { ...window.BOM_DATA.rollup };
