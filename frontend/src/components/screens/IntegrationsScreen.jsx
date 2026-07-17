import React from "react";
import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { apiRequest } from "../../../api.js";
import {
  ScreenHeader,
  Card,
  Field,
  Input,
  Button,
  StatusPill,
  DataTable,
  EmptyState,
} from "../ui";

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

  const deliveryColumns = [
    { key: "provider", header: "Provider" },
    {
      key: "entity",
      header: "Entity",
      render: (r) => `${r.entity_type}#${r.entity_id}`,
    },
    { key: "action", header: "Action" },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "error",
      header: "Error",
      render: (r) =>
        r.last_error ? (
          <span style={{ color: "var(--danger)" }}>{r.last_error}</span>
        ) : (
          ""
        ),
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("integrations.title") || "Integrations"}
        description="Connect ClickUp + Zoho Cliq to mirror work and post notifications."
      />

      <div className="flex flex-col gap-16">
        {PROVIDERS.map((p) => {
          const c = conns[p.id] || {};
          const d = draft[p.id] || {};
          const connected = !!c.is_enabled;
          const hasError = c.status === "error";
          return (
            <Card
              key={p.id}
              title={p.name}
              actions={
                <StatusPill
                  tone={connected ? (hasError ? "danger" : "success") : "neutral"}
                  label={
                    connected
                      ? hasError
                        ? "Connected · error"
                        : "Connected"
                      : "Not connected"
                  }
                />
              }
            >
              <div
                className="flex gap-8"
                style={{ flexWrap: "wrap", alignItems: "flex-end" }}
              >
                <div style={{ flex: 2, minWidth: 220 }}>
                  <Field label={p.credLabel} htmlFor={`${p.id}-token`}>
                    <Input
                      id={`${p.id}-token`}
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        c.has_credentials ? "Set — leave blank to keep" : ""
                      }
                      onChange={(e) =>
                        setDraft((s) => ({
                          ...s,
                          [p.id]: { ...d, token: e.target.value },
                        }))
                      }
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <Field label={p.cfgLabel} htmlFor={`${p.id}-cfg`}>
                    <Input
                      id={`${p.id}-cfg`}
                      defaultValue={(c.config || {})[p.cfgKey] || ""}
                      onChange={(e) =>
                        setDraft((s) => ({
                          ...s,
                          [p.id]: { ...d, cfg: e.target.value },
                        }))
                      }
                    />
                  </Field>
                </div>
                <div className="flex gap-8" style={{ marginBottom: 2 }}>
                  <Button variant="primary" size="md" onClick={() => save(p)}>
                    Save
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => test(p)}
                    disabled={!c.is_enabled}
                  >
                    Send test
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <h3 style={{ marginTop: "var(--sp-5, 24px)" }}>Recent deliveries</h3>
      <DataTable
        dense
        ariaLabel="Recent integration deliveries"
        columns={deliveryColumns}
        rows={deliveries}
        getRowKey={(r) => r.id}
        empty={
          <EmptyState
            title="No deliveries yet"
            message="Deliveries appear here once an integration mirrors an update or sends a notification."
          />
        }
      />
    </div>
  );
}

IntegrationsScreen.displayName = "IntegrationsScreen";
window.IntegrationsScreen = IntegrationsScreen;
