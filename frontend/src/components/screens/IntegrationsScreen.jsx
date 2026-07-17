import React from "react";
import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { apiRequest } from "../../../api.js";

const PROVIDERS = [
  { id: "clickup", name: "ClickUp", credLabel: "API token", cfgLabel: "Space ID", cfgKey: "space_id" },
  { id: "cliq", name: "Zoho Cliq", credLabel: "Incoming webhook URL", cfgLabel: "Default channel", cfgKey: "default_channel" },
];

export default function IntegrationsScreen() {
  const [conns, setConns] = React.useState({});
  const [deliveries, setDeliveries] = React.useState([]);
  const [draft, setDraft] = React.useState({});

  const load = React.useCallback(async () => {
    try {
      const list = await apiRequest("/integrations/");
      const map = {};
      (list || []).forEach((c) => (map[c.provider] = c));
      setConns(map);
      setDeliveries((await apiRequest("/integrations/deliveries")) || []);
    } catch (e) {
      toast("Could not load integrations: " + (e.message || ""), { kind: "error" });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const save = async (p) => {
    const d = draft[p.id] || {};
    try {
      await apiRequest(`/integrations/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({
          token: d.token || undefined,
          config: d.cfg != null ? { [p.cfgKey]: d.cfg } : undefined,
          is_enabled: true,
        }),
      });
      toast(`${p.name} connected`, { kind: "success" });
      load();
    } catch (e) {
      toast("Save failed: " + (e.message || ""), { kind: "error" });
    }
  };

  const test = async (p) => {
    try {
      const r = await apiRequest(`/integrations/${p.id}/test`, { method: "POST" });
      toast(`Test: ${JSON.stringify(r.delivery)}`, { kind: "info" });
      load();
    } catch (e) {
      toast("Test failed: " + (e.message || ""), { kind: "error" });
    }
  };

  return (
    <div className="screen-wrap" style={{ maxWidth: 820 }}>
      <div className="screen-header">
        <div>
          <h1>{__t("integrations.title") || "Integrations"}</h1>
          <div className="sub">Connect ClickUp + Zoho Cliq to mirror work and post notifications.</div>
        </div>
      </div>

      {PROVIDERS.map((p) => {
        const c = conns[p.id] || {};
        const d = draft[p.id] || {};
        return (
          <div key={p.id} className="card" style={{ padding: 16, marginBottom: 16, border: "1px solid var(--line)", borderRadius: 8 }}>
            <div className="flex gap-8" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>{p.name}</strong>
              <span style={{ fontSize: 11, color: c.is_enabled ? "var(--ok)" : "var(--fg-3)" }}>
                {c.is_enabled ? "Connected" : "Not connected"}{c.status === "error" ? " · error" : ""}
              </span>
            </div>
            <div className="flex gap-8" style={{ marginTop: 10, flexWrap: "wrap" }}>
              <input className="input" type="password" autoComplete="new-password"
                     placeholder={p.credLabel + (c.has_credentials ? " (set — leave blank to keep)" : "")}
                     style={{ flex: 2, minWidth: 220 }}
                     onChange={(e) => setDraft((s) => ({ ...s, [p.id]: { ...d, token: e.target.value } }))} />
              <input className="input" placeholder={p.cfgLabel}
                     defaultValue={(c.config || {})[p.cfgKey] || ""} style={{ flex: 1, minWidth: 140 }}
                     onChange={(e) => setDraft((s) => ({ ...s, [p.id]: { ...d, cfg: e.target.value } }))} />
              <button className="btn primary" onClick={() => save(p)}>Save</button>
              <button className="btn" onClick={() => test(p)} disabled={!c.is_enabled}>Send test</button>
            </div>
          </div>
        );
      })}

      <h3 style={{ marginTop: 8 }}>Recent deliveries</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ textAlign: "left", color: "var(--fg-3)" }}>
            <th style={{ padding: 6 }}>Provider</th><th style={{ padding: 6 }}>Entity</th>
            <th style={{ padding: 6 }}>Action</th><th style={{ padding: 6 }}>Status</th><th style={{ padding: 6 }}>Error</th>
          </tr></thead>
          <tbody>
            {deliveries.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: 6 }}>{r.provider}</td>
                <td style={{ padding: 6 }}>{r.entity_type}#{r.entity_id}</td>
                <td style={{ padding: 6 }}>{r.action}</td>
                <td style={{ padding: 6 }}>{r.status}</td>
                <td style={{ padding: 6, color: "var(--danger)" }}>{r.last_error || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

IntegrationsScreen.displayName = "IntegrationsScreen";
window.IntegrationsScreen = IntegrationsScreen;
