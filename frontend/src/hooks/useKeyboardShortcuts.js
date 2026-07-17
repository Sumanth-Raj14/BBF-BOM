import React from "react";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { runUndo } from '../globals';
export default function useKeyboardShortcuts({ route, setRoute, setModal, setSearch, setTweak, setSelectedRow, GROUPS }) {
  React.useEffect(() => {
    const onKey = (e) => {
      const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("global-search");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && !inField) {
        e.preventDefault();
        setModal("command-palette");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !inField) {
        e.preventDefault();
        runUndo?.();
      }
      if (!inField && e.key === "?") {
        e.preventDefault();
        setModal("help");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setModal(route === "vendors" ? "new-vendor" : route === "procurement" ? "new-po" : "new-part");
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && /^[1-9]$/.test(e.key) && !inField) {
        e.preventDefault();
        const allItems = GROUPS?.flatMap ? GROUPS.flatMap(g => g.items) : [];
        const target = allItems[parseInt(e.key) - 1];
        if (target) { setRoute(target.id); setSelectedRow(null); }
      }
      if (!inField && e.key === "g") {
        const handler = (e2) => {
          const map = { b: "bom", c: "parts", v: "vendors", p: "procurement", d: "dashboard", a: "analytics", i: "inventory" };
          if (map[e2.key]) { e2.preventDefault(); setRoute(map[e2.key]); toast(__t("nav." + map[e2.key])); }
          window.removeEventListener("keydown", handler);
        };
        window.addEventListener("keydown", handler);
        setTimeout(() => window.removeEventListener("keydown", handler), 800);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route]);
}
