import React from "react";
import config from "../../config.js";
import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { apiRequest } from "../../../api.js";
import {
  ScreenHeader,
  Card,
  Field,
  Input,
  Select,
  Switch,
  Button,
  StatusPill,
  DataTable,
  EmptyState,
} from "../ui";

const PROVIDERS = [
  { id: "clickup", name: "ClickUp", credLabel: "API token", cfgLabel: "Space ID", cfgKey: "space_id" },
  { id: "cliq", name: "Zoho Cliq", credLabel: "Incoming webhook URL", cfgLabel: "Default channel", cfgKey: "default_channel" },
  { id: "zoho_books", name: "Zoho Books", authType: "oauth" },
];

// Zoho multi-DC data centers. The backend maps each code to its accounts host
// + API domain; the tool only supplies the region code at connect time.
const ZOHO_REGIONS = [
  { value: "us", label: "United States (.com)" },
  { value: "eu", label: "Europe (.eu)" },
  { value: "in", label: "India (.in)" },
  { value: "au", label: "Australia (.com.au)" },
  { value: "jp", label: "Japan (.jp)" },
  { value: "ca", label: "Canada (.ca)" },
  { value: "sa", label: "Saudi Arabia (.sa)" },
];

// Where Zoho returns the browser after consent: the backend callback, which
// finishes the token exchange and redirects the UI back with ?zoho=connected.
// Prefilled but editable so it can match whatever public URL the deployment
// registered in the Zoho API console.
function defaultRedirectUri() {
  const base = config.API_BASE || "/api/v1";
  const root = /^https?:\/\//i.test(base)
    ? base
    : `${window.location.origin}${base}`;
  return `${root}/integrations/zoho_books/oauth/callback`;
}

// Maps the honest /test-connection result to a StatusPill tone + label.
// Never claims "Connected" unless the backend actually verified credentials;
// a missing credential reports "Not configured", any other failure reports
// "Failed" alongside the backend's safe (pre-sanitized) detail text.
function checkTone(check) {
  if (!check) return "neutral";
  if (check.ok) return "success";
  if (check.reason === "not_configured") return "neutral";
  return "danger";
}
function checkLabel(check) {
  if (!check) return "Not configured";
  if (check.ok) return "Connected";
  if (check.reason === "not_configured") return "Not configured";
  return "Failed";
}

export default function IntegrationsScreen() {
  const [conns, setConns] = React.useState({});
  const [deliveries, setDeliveries] = React.useState([]);
  const [draft, setDraft] = React.useState({});
  const [checks, setChecks] = React.useState({});
  const [checking, setChecking] = React.useState({});

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

  // Live credential check — separate from `test()` above (which sends a real
  // delivery through the outbox for observability). This makes one lightweight
  // authenticated call and reports an honest ok/fail result immediately,
  // without enqueuing anything or requiring the connection to be enabled.
  const testConnection = async (p) => {
    setChecking((s) => ({ ...s, [p.id]: true }));
    try {
      const r = await apiRequest(`/integrations/${p.id}/test-connection`, {
        method: "POST",
      });
      setChecks((s) => ({ ...s, [p.id]: r }));
      toast(`${p.name}: ${r.detail}`, { kind: r.ok ? "success" : "error" });
      load();
    } catch (e) {
      toast("Test connection failed: " + (e.message || ""), { kind: "error" });
    } finally {
      setChecking((s) => ({ ...s, [p.id]: false }));
    }
  };

  // ── Zoho Books OAuth (authType: "oauth") ────────────────────────────────
  const [orgs, setOrgs] = React.useState([]);

  const loadOrgs = React.useCallback(async () => {
    try {
      const r = await apiRequest("/integrations/zoho_books/organizations");
      setOrgs((r && r.organizations) || []);
    } catch {
      // Organizations only exist once OAuth has stored a refresh token; a
      // failure here just means "not connected yet" — stay quiet.
    }
  }, []);

  // Once Zoho holds credentials, surface its organizations so the active one
  // can be (re)confirmed without reconnecting.
  React.useEffect(() => {
    if (conns.zoho_books && conns.zoho_books.has_credentials) loadOrgs();
  }, [conns.zoho_books, loadOrgs]);

  // The backend callback redirects here with ?zoho=connected after a
  // successful token exchange. Reload orgs, refresh connections, then strip
  // the flag so a page refresh doesn't repeat the toast.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("zoho") !== "connected") return;
    toast("Zoho Books connected — choose an organization", { kind: "success" });
    loadOrgs();
    load();
    params.delete("zoho");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );
  }, [loadOrgs, load]);

  const connectZoho = async (p) => {
    const d = draft[p.id] || {};
    const cfg = (conns[p.id] || {}).config || {};
    const clientId = d.client_id ?? cfg.client_id ?? "";
    const clientSecret = d.client_secret || "";
    if (!clientId || !clientSecret) {
      toast("Enter the Zoho OAuth client ID and secret first", { kind: "error" });
      return;
    }
    try {
      const r = await apiRequest("/integrations/zoho_books/oauth/start", {
        method: "POST",
        body: JSON.stringify({
          region: d.region ?? cfg.region ?? "us",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: d.redirect_uri ?? cfg.redirect_uri ?? defaultRedirectUri(),
        }),
      });
      if (r && r.authorize_url) {
        window.location = r.authorize_url;
      } else {
        toast("Zoho did not return an authorization URL", { kind: "error" });
      }
    } catch (e) {
      toast("Connect failed: " + (e.message || ""), { kind: "error" });
    }
  };

  const selectOrg = async (organizationId) => {
    if (!organizationId) return;
    try {
      await apiRequest("/integrations/zoho_books/select-organization", {
        method: "POST",
        body: JSON.stringify({ organization_id: organizationId }),
      });
      toast("Organization selected", { kind: "success" });
      load();
    } catch (e) {
      toast("Could not select organization: " + (e.message || ""), {
        kind: "error",
      });
    }
  };

  const toggleEnabled = async (p, next) => {
    try {
      await apiRequest(`/integrations/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_enabled: next }),
      });
      toast(`${p.name} ${next ? "enabled" : "disabled"}`, { kind: "success" });
      load();
    } catch (e) {
      toast("Update failed: " + (e.message || ""), { kind: "error" });
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
        description="Connect ClickUp and Zoho Cliq to mirror work and post notifications, and Zoho Books to sync finance records."
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
              {p.authType === "oauth" ? (
                <div className="flex flex-col gap-16">
                  <div
                    className="flex gap-8"
                    style={{ flexWrap: "wrap", alignItems: "flex-end" }}
                  >
                    <div style={{ minWidth: 190 }}>
                      <Field label="Data center" htmlFor={`${p.id}-region`}>
                        <Select
                          id={`${p.id}-region`}
                          value={d.region ?? (c.config || {}).region ?? "us"}
                          onChange={(e) =>
                            setDraft((s) => ({
                              ...s,
                              [p.id]: { ...d, region: e.target.value },
                            }))
                          }
                        >
                          {ZOHO_REGIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <Field label="Client ID" htmlFor={`${p.id}-client-id`}>
                        <Input
                          id={`${p.id}-client-id`}
                          autoComplete="off"
                          value={d.client_id ?? (c.config || {}).client_id ?? ""}
                          onChange={(e) =>
                            setDraft((s) => ({
                              ...s,
                              [p.id]: { ...d, client_id: e.target.value },
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <Field
                        label="Client secret"
                        htmlFor={`${p.id}-client-secret`}
                      >
                        <Input
                          id={`${p.id}-client-secret`}
                          type="password"
                          autoComplete="new-password"
                          placeholder={
                            c.has_credentials ? "Set — leave blank to keep" : ""
                          }
                          value={d.client_secret || ""}
                          onChange={(e) =>
                            setDraft((s) => ({
                              ...s,
                              [p.id]: { ...d, client_secret: e.target.value },
                            }))
                          }
                        />
                      </Field>
                    </div>
                  </div>

                  <div
                    className="flex gap-8"
                    style={{ flexWrap: "wrap", alignItems: "flex-end" }}
                  >
                    <div style={{ flex: 2, minWidth: 280 }}>
                      <Field
                        label="Redirect URI"
                        htmlFor={`${p.id}-redirect`}
                        hint="Register this exact URL as an authorized redirect in your Zoho API console."
                      >
                        <Input
                          id={`${p.id}-redirect`}
                          value={
                            d.redirect_uri ??
                            (c.config || {}).redirect_uri ??
                            defaultRedirectUri()
                          }
                          onChange={(e) =>
                            setDraft((s) => ({
                              ...s,
                              [p.id]: { ...d, redirect_uri: e.target.value },
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <div style={{ marginBottom: 2 }}>
                      <Button
                        variant="primary"
                        size="md"
                        onClick={() => connectZoho(p)}
                      >
                        Connect with Zoho
                      </Button>
                    </div>
                  </div>

                  <div
                    className="flex gap-8"
                    style={{ flexWrap: "wrap", alignItems: "flex-end" }}
                  >
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <Field
                        label="Organization"
                        htmlFor={`${p.id}-org`}
                        hint={
                          orgs.length
                            ? undefined
                            : "Connect with Zoho to load your organizations."
                        }
                      >
                        <Select
                          id={`${p.id}-org`}
                          disabled={!orgs.length}
                          value={
                            d.organization_id ??
                            (c.config || {}).organization_id ??
                            ""
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((s) => ({
                              ...s,
                              [p.id]: { ...d, organization_id: v },
                            }));
                            selectOrg(v);
                          }}
                        >
                          <option value="">
                            {orgs.length
                              ? "Select an organization…"
                              : "No organizations yet"}
                          </option>
                          {orgs.map((o) => (
                            <option
                              key={o.organization_id}
                              value={o.organization_id}
                            >
                              {o.name} ({o.organization_id})
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  </div>

                  <div
                    className="flex gap-8"
                    style={{ flexWrap: "wrap", alignItems: "center" }}
                  >
                    <Switch
                      checked={!!c.is_enabled}
                      disabled={!c.has_credentials}
                      onChange={(next) => toggleEnabled(p, next)}
                      label="Enabled"
                    />
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => testConnection(p)}
                      disabled={!c.has_credentials || checking[p.id]}
                    >
                      {checking[p.id] ? "Checking…" : "Test connection"}
                    </Button>
                  </div>
                </div>
              ) : (
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
                    onClick={() => testConnection(p)}
                    disabled={!c.has_credentials || checking[p.id]}
                  >
                    {checking[p.id] ? "Checking…" : "Test connection"}
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
              )}
              {checks[p.id] && (
                <div
                  className="flex gap-8"
                  style={{
                    marginTop: "var(--sp-2, 8px)",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <StatusPill
                    tone={checkTone(checks[p.id])}
                    label={checkLabel(checks[p.id])}
                  />
                  <span
                    style={{
                      fontSize: "var(--fs-sm, 13px)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {checks[p.id].detail}
                    {checks[p.id].checked_at
                      ? ` (checked ${new Date(
                          checks[p.id].checked_at,
                        ).toLocaleTimeString()})`
                      : ""}
                  </span>
                </div>
              )}
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
