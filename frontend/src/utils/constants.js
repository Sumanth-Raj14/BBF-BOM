export const TWEAK_DEFAULTS = {
  "density": "normal",
  "accent": "#e85d1f"
};

export const ACCENT_PRESETS = ["#e85d1f", "#ba4816", "#0288d1", "#2e7d32"];

export const INITIAL_COMMENTS = {
  "EL-MCU-STM32H7": [
    { id: 1, who: "E. Chen", init: "EC", color: "", text: "H743 errata ES0392 \u2014 moving Rev A \u2192 Rev B fixes the I2C wakeup bug. Confirmed in stress tests.", time: "12 min" },
    { id: 2, who: "M. Park", init: "MP", color: "user-2", text: "Lead bumped to 42 days \u2014 let's keep 250 on the shelf min.", time: "8 min" },
  ],
  "EL-PCB-MAIN-R3": [
    { id: 1, who: "R. Sato", init: "RS", color: "user-3", text: "JLCPCB lead time looks fine but we should keep a 100-board safety stock \u2014 14d is tight for the August demo.", time: "2 hr" },
  ],
  "EL-BMS-12S": [
    { id: 1, who: "System", init: "\u232C", color: "sys", text: "Lead time crept 28 \u2192 35 days. Flagged as supply risk.", time: "2 days" },
  ],
};

export const INITIAL_APPROVALS = {
  "ATL-MFR-CHS": { engineering: "approved", procurement: "approved", finance: "approved" },
  "ATL-MFR-PWR": { engineering: "approved", procurement: "approved", finance: "pending" },
  "ATL-MFR-CTL": { engineering: "approved", procurement: "pending", finance: "pending" },
  "ATL-MFR-IO":  { engineering: "pending",  procurement: "pending", finance: "pending" },
};

export const INITIAL_NOTIFICATIONS = [
  { id: 1, who: "M. Park", init: "MP", color: "user-2", action: "requested approval on", obj: "ATL-MFR-CTL Rev D", time: "54 min", read: false, route: "bom" },
  { id: 2, who: "R. Sato", init: "RS", color: "user-3", action: "commented on", obj: "EL-PCB-MAIN-R3", time: "2 hr", read: false, route: "bom" },
  { id: 3, who: "System", init: "\u232C", color: "sys", action: "detected duplicate", obj: "HW-FAS-M3-08", time: "3 hr", read: false, route: "parts" },
  { id: 4, who: "K. Singh", init: "KS", color: "user-4", action: "approved PO", obj: "PO-2026-0481", time: "5 hr", read: true, route: "procurement" },
  { id: 5, who: "E. Chen", init: "EC", color: "", action: "released BOM", obj: "v3.2.0", time: "yesterday", read: true, route: "bom" },
  { id: 6, who: "System", init: "\u232C", color: "sys", action: "flagged supply risk on", obj: "EL-BMS-12S", time: "2 days", read: true, route: "bom" },
];


