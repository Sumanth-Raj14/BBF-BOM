import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { escapeHtml, openPrintWindow } from '../../api.js';
export function downloadBlob(content, filename, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
}

export function flattenForCSV(rows, depth = 0, out = []) {
  rows.forEach(r => {
    out.push({
      pn: r.pn, name: r.name, rev: r.rev, qty: r.qty, uom: r.uom,
      category: r.category, vendor: r.vendor,
      unit_cost: r.cost, ext_cost: ((r.cost || 0) * (r.qty || 0)).toFixed(2),
      lead_days: r.lead, origin: r.origin, status: r.status,
      level: depth,
    });
    if (r.children) flattenForCSV(r.children, depth + 1, out);
  });
  return out;
}

export function downloadCSV(rows, filename) {
  const list = flattenForCSV(rows);
  const headers = Object.keys(list[0] || {});
  const csv = [
    headers.join(","),
    ...list.map(r => headers.map(h => {
      const v = r[h];
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")),
  ].join("\n");
  downloadBlob(csv, filename, "text/csv");
}

export function downloadJSON(rows, filename) {
  downloadBlob(JSON.stringify(rows, null, 2), filename, "application/json");
}

export function generateXLSX(rows, filename) {
  const list = flattenForCSV(rows);
  const headers = Object.keys(list[0] || {});
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rowsXml = list.map(r => "    <Row>\n" + headers.map(h => "      <Cell><Data ss:Type=\"String\">" + esc(r[h]) + "</Data></Cell>").join("\n") + "\n    </Row>").join("\n");
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n <Worksheet ss:Name="BOM">\n  <Table>\n   <Row>\n' +
    headers.map(h => "    <Cell><Data ss:Type=\"String\"><b>" + esc(h) + "</b></Data></Cell>").join("\n") + "\n   " + "</" + "Row>\n" +
    rowsXml + "\n  " + "</" + "Table>\n " + "</" + "Worksheet>\n" + "</" + "Workbook>";
  downloadBlob(xml, filename, "application/vnd.ms-excel");
}

function esc(v) { return escapeHtml ? escapeHtml(v) : String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

export function printBOM(rows, project) {
  const list = flattenForCSV(rows);
  const total = list.reduce((s, r) => s + (Number(r.unit_cost) || 0) * (Number(r.qty) || 0), 0);
  const rowHTML = list.map((r, i) => {
    return "<tr><td>" + (i + 1) + "</td><td style='font-weight:600'>" + esc(r.pn) + "</td><td>" + "".padStart(r.level * 2, "\u00B7") + " " + esc(r.name) + "</td><td>" + esc(r.rev) + "</td><td class='r'>" + esc(r.qty) + "</td><td class='r'>" + esc(r.uom) + "</td><td>" + esc(r.category) + "</td><td>" + esc(r.vendor) + "</td><td class='r'>\u20B9" + ((Number(r.unit_cost) || 0) * (window.INR_RATE || 83)).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + "</td><td class='r'>\u20B9" + ((Number(r.ext_cost) || 0) * (window.INR_RATE || 83)).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + "</td><td>" + esc(r.origin) + "</td><td>" + esc(r.status) + "</td></tr>";
  }).join("");
  const printHtml = "<!doctype html><html><head><title>BOM \u00B7 " + esc(project.code) + " \u00B7 " + esc(project.version) + "</title>" +
    "<style>@page{size:A4 landscape;margin:16mm}body{font-family:-apple-system,sans-serif;color:#000;font-size:10px;margin:0;padding:16px}h1{font-size:16px;margin:0 0 4px}.meta{display:flex;gap:18px;font-family:monospace;font-size:9px;color:#444;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #000}.meta span strong{color:#000;margin-left:4px}table{width:100%;border-collapse:collapse;font-size:9px;font-family:monospace}th{text-align:left;padding:4px 6px;border-bottom:1px solid #000;font-size:8px;text-transform:uppercase;letter-spacing:0.04em}td{padding:3px 6px;border-bottom:1px solid #eee;vertical-align:top}td.r{text-align:right}tfoot td{font-weight:700;border-top:2px solid #000;padding-top:6px;font-size:11px}.foot{margin-top:14px;font-size:8px;color:#666;display:flex;justify-content:space-between}</style></head><body>" +
    "<h1>BOM \u00B7 " + esc(project.name) + "</h1>" +
    "<div class='meta'>" +
    "<span>Project<strong>" + esc(project.code) + "</strong></span>" +
    "<span>Revision<strong>" + esc(project.rev) + "</strong></span>" +
    "<span>Version<strong>" + esc(project.version) + "</strong></span>" +
    "<span>Status<strong>" + esc(project.status) + "</strong></span>" +
    "<span>Owner<strong>" + esc(project.owner) + "</strong></span>" +
    "<span>Updated<strong>" + esc(project.updated) + "</strong></span>" +
    "<span>Generated<strong>" + new Date().toISOString().slice(0,10) + "</strong></span>" +
    "</div>" +
    "<table><thead><tr><th>#</th><th>" + __t("bomShell.colPartNo") + "</th><th>" + __t("bomShell.colName") + "</th><th>Rev</th><th>Qty</th><th>UoM</th><th>" + __t("bomShell.colCategory") + "</th><th>" + __t("bomShell.colVendor") + "</th><th>Unit</th><th>Ext.</th><th>" + __t("bomShell.colOrigin") + "</th><th>Status</th></tr></thead>" +
    "<tbody>" + rowHTML + "</tbody>" +
    "<tfoot><tr><td colspan='9' style='text-align:right'>TOTAL</td><td class='r'>\u20B9" + (total * (window.INR_RATE || 83)).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + "</td><td colspan='2'></td></tr></tfoot>" +
    "</table>" +
    "<div class='foot'><span>Blackbox BOM \u00B7 " + esc(project.code) + "</span><span>Page 1 of 1</span></div>" +
    "<script>setTimeout(function(){window.print()},300)<\/script>" +
    "</body></html>";
  openPrintWindow("BOM Print", printHtml, { printDelay: 300 });
  toast(__t("common.loading") + " - print", { kind: "success" });
}

window.downloadCSV = downloadCSV;
window.downloadJSON = downloadJSON;
window.generateXLSX = generateXLSX;
window.downloadBlob = downloadBlob;
window.printBOM = printBOM;
