import React from "react";
import { Z } from "../utils/design-tokens.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { api } from "../globals";
const useState = React.useState,
  useEffect = React.useEffect,
  useCallback = React.useCallback;

const S = {
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: 700, color: "var(--fg)", margin: 0 },
  grid: { display: "grid", gap: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "2px solid var(--border)",
    color: "var(--muted)",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid var(--border)",
    color: "var(--fg)",
  },
};

function TenantsAdminScreen() {
  const _useState = useState("tenants"),
    tab = _useState[0],
    setTab = _useState[1];
  const _useState2 = useState([]),
    tenants = _useState2[0],
    setTenants = _useState2[1];
  const _useState3 = useState([]),
    tenantUsers = _useState3[0],
    setTenantUsers = _useState3[1];
  const _useState4 = useState(null),
    selectedTenant = _useState4[0],
    setSelectedTenant = _useState4[1];
  const _useState5 = useState(true),
    loading = _useState5[0],
    setLoading = _useState5[1];
  const _useState6 = useState(false),
    showCreate = _useState6[0],
    setShowCreate = _useState6[1];
  const _useState7 = useState(false),
    showInvite = _useState7[0],
    setShowInvite = _useState7[1];
  const _useState8 = useState(null),
    search = _useState8[0],
    setSearch = _useState8[1];
  const _useState9 = useState(""),
    statusFilter = _useState9[0],
    setStatusFilter = _useState9[1];

  const loadTenants = useCallback(
    function () {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      (api && api.tenants
        ? api.tenants.list(params)
        : Promise.resolve({ items: [], total: 0 })
      )
        .then(function (res) {
          setTenants(res.items || []);
        })
        .catch(function () {
          setTenants([]);
        })
        .finally(function () {
          setLoading(false);
        });
    },
    [search, statusFilter],
  );

  useEffect(
    function () {
      loadTenants();
    },
    [loadTenants],
  );

  const loadTenantUsers = useCallback(function (tid) {
    if (!tid) {
      setTenantUsers([]);
      return;
    }
    (api && api.tenants
      ? api.tenants.users(tid)
      : Promise.resolve({ items: [] })
    )
      .then(function (res) {
        setTenantUsers(res.items || []);
      })
      .catch(function () {
        setTenantUsers([]);
      });
  }, []);

  const selectTenant = useCallback(
    function (t) {
      setSelectedTenant(t);
      setTab("users");
      loadTenantUsers(t.id);
    },
    [loadTenantUsers],
  );

  const badge = function (color, label) {
    return React.createElement(
      "span",
      {
        style: {
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600,
          background: color + "20",
          color: color,
        },
      },
      label,
    );
  };

  const planColor = {
    free: "var(--fg-4)",
    starter: "var(--info)",
    professional: "var(--warn)",
    enterprise: "var(--accent)",
  };
  const statusColor = {
    active: "var(--ok)",
    inactive: "var(--fg-4)",
    suspended: "var(--danger)",
  };

  return React.createElement(
    "div",
    {
      style: {
        padding: 24,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      },
    },
    React.createElement(
      "div",
      { style: S.header },
      React.createElement(
        "div",
        null,
        React.createElement(
          "h1",
          { style: S.title },
          __t("tenantAdmin.title") || "Tenant Administration",
        ),
        React.createElement(
          "p",
          { style: { fontSize: 12, color: "var(--muted)", margin: "2px 0 0" } },
          __t("tenantAdmin.subtitle") ||
            "Manage organizations, plans, and user assignments",
        ),
      ),
      React.createElement(
        "div",
        { style: { display: "flex", gap: 8 } },
        tab === "tenants"
          ? React.createElement(
              "button",
              {
                className: "btn primary",
                onClick: function () {
                  setShowCreate(true);
                },
                style: { fontSize: 12 },
              },
              __t("tenantAdmin.newTenant") || "+ New Tenant",
            )
          : React.createElement(
              "button",
              {
                className: "btn",
                onClick: function () {
                  setShowInvite(true);
                },
                style: { fontSize: 12 },
              },
              __t("tenantAdmin.addUser") || "+ Add User",
            ),
        React.createElement(
          "button",
          {
            className: "btn",
            onClick: function () {
              setTab("tenants");
              setSelectedTenant(null);
              loadTenants();
            },
            style: { fontSize: 12, opacity: tab === "tenants" ? 0.5 : 1 },
          },
          __t("tenantAdmin.backToTenants") || "Back to Tenants",
        ),
      ),
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 8, marginBottom: 16 } },
      React.createElement("input", {
        className: "input",
        placeholder:
          __t("tenantAdmin.searchPlaceholder") ||
          "Search tenants by name, code, or domain\u2026",
        value: search || "",
        onChange: function (e) {
          setSearch(e.target.value);
        },
        style: { flex: 1, fontSize: 12, padding: "6px 10px" },
      }),
      React.createElement(
        "select",
        {
          className: "select",
          value: statusFilter,
          onChange: function (e) {
            setStatusFilter(e.target.value);
          },
          style: { fontSize: 12, padding: "6px 10px" },
        },
        React.createElement(
          "option",
          { value: "" },
          __t("tenantAdmin.allStatus") || "All status",
        ),
        React.createElement(
          "option",
          { value: "active" },
          __t("tenantAdmin.active") || "Active",
        ),
        React.createElement(
          "option",
          { value: "inactive" },
          __t("tenantAdmin.inactive") || "Inactive",
        ),
        React.createElement(
          "option",
          { value: "suspended" },
          __t("tenantAdmin.suspended") || "Suspended",
        ),
      ),
    ),
    tab === "tenants"
      ? React.createElement(
          "div",
          { style: { flex: 1, overflow: "auto" } },
          loading
            ? React.createElement(
                "div",
                {
                  style: {
                    textAlign: "center",
                    padding: 40,
                    color: "var(--muted)",
                  },
                },
                __t("common.loading") || "Loading...",
              )
            : tenants.length === 0
              ? React.createElement(
                  "div",
                  {
                    style: {
                      textAlign: "center",
                      padding: 40,
                      color: "var(--muted)",
                    },
                  },
                  __t("tenantAdmin.noTenantsFound") || "No tenants found",
                )
              : React.createElement(
                  "table",
                  { style: S.table },
                  React.createElement(
                    "thead",
                    null,
                    React.createElement(
                      "tr",
                      null,
                      React.createElement(
                        "th",
                        { style: S.th },
                        __t("tenantAdmin.tenant") || "Tenant",
                      ),
                      React.createElement(
                        "th",
                        { style: S.th },
                        __t("tenantAdmin.code") || "Code",
                      ),
                      React.createElement(
                        "th",
                        { style: S.th },
                        __t("tenantAdmin.plan") || "Plan",
                      ),
                      React.createElement(
                        "th",
                        { style: S.th },
                        __t("tenantAdmin.status") || "Status",
                      ),
                      React.createElement(
                        "th",
                        { style: S.th },
                        __t("tenantAdmin.users") || "Users",
                      ),
                      React.createElement(
                        "th",
                        { style: S.th },
                        __t("tenantAdmin.domain") || "Domain",
                      ),
                      React.createElement(
                        "th",
                        { style: S.th },
                        __t("tenantAdmin.created") || "Created",
                      ),
                      React.createElement("th", { style: S.th }),
                    ),
                  ),
                  React.createElement(
                    "tbody",
                    null,
                    tenants.map(function (t) {
                      return React.createElement(
                        "tr",
                        {
                          key: t.id,
                          style: { cursor: "pointer" },
                          onClick: function () {
                            selectTenant(t);
                          },
                        },
                        React.createElement(
                          "td",
                          {
                            style: S.td,
                            "data-label": __t("tenantAdmin.tenant") || "Tenant",
                          },
                          t.tenant_name,
                        ),
                        React.createElement(
                          "td",
                          {
                            style: Object.assign({}, S.td, {
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                            }),
                            "data-label": __t("tenantAdmin.code") || "Code",
                          },
                          t.tenant_code,
                        ),
                        React.createElement(
                          "td",
                          {
                            style: S.td,
                            "data-label": __t("tenantAdmin.plan") || "Plan",
                          },
                          badge(planColor[t.plan] || "var(--fg-4)", t.plan),
                        ),
                        React.createElement(
                          "td",
                          {
                            style: S.td,
                            "data-label": __t("tenantAdmin.status") || "Status",
                          },
                          badge(
                            statusColor[t.status] || "var(--fg-4)",
                            t.status,
                          ),
                        ),
                        React.createElement(
                          "td",
                          {
                            style: S.td,
                            "data-label": __t("tenantAdmin.users") || "Users",
                          },
                          t.max_users + " " + (__t("tenantAdmin.max") || "max"),
                        ),
                        React.createElement(
                          "td",
                          {
                            style: Object.assign({}, S.td, { fontSize: 11 }),
                            "data-label": __t("tenantAdmin.domain") || "Domain",
                          },
                          t.domain || "\u2014",
                        ),
                        React.createElement(
                          "td",
                          {
                            style: Object.assign({}, S.td, { fontSize: 11 }),
                            "data-label":
                              __t("tenantAdmin.created") || "Created",
                          },
                          t.created_at ? t.created_at.slice(0, 10) : "\u2014",
                        ),
                        React.createElement(
                          "td",
                          { style: S.td },
                          React.createElement(
                            "button",
                            {
                              className: "btn small",
                              onClick: function (e) {
                                e.stopPropagation();
                                selectTenant(t);
                              },
                              style: { fontSize: 10 },
                            },
                            __t("tenantAdmin.manage") || "Manage",
                          ),
                        ),
                      );
                    }),
                  ),
                ),
        )
      : selectedTenant
        ? React.createElement(
            "div",
            { style: { flex: 1, overflow: "auto" } },
            React.createElement(
              "div",
              { style: Object.assign({}, S.card, { marginBottom: 16 }) },
              React.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  },
                },
                React.createElement(
                  "div",
                  null,
                  React.createElement(
                    "h2",
                    {
                      style: {
                        margin: "0 0 4px",
                        fontSize: 16,
                        color: "var(--fg)",
                      },
                    },
                    selectedTenant.tenant_name,
                  ),
                  React.createElement(
                    "p",
                    {
                      style: { margin: 0, fontSize: 12, color: "var(--muted)" },
                    },
                    (
                      __t("tenantAdmin.tenantInfo") ||
                      "Code: {code} · Plan: {plan} · Status: {status}"
                    )
                      .replace("{code}", selectedTenant.tenant_code)
                      .replace("{plan}", selectedTenant.plan)
                      .replace("{status}", selectedTenant.status),
                  ),
                ),
                React.createElement(
                  "div",
                  { style: { display: "flex", gap: 8 } },
                  React.createElement(
                    "span",
                    {
                      style: Object.assign({}, S.card, {
                        textAlign: "center",
                        padding: "8px 16px",
                      }),
                    },
                    React.createElement(
                      "div",
                      {
                        style: {
                          fontSize: 24,
                          fontWeight: 700,
                          color: "var(--fg)",
                        },
                      },
                      tenantUsers.length,
                    ),
                    React.createElement(
                      "div",
                      { style: { fontSize: 10, color: "var(--muted)" } },
                      __t("tenantAdmin.users") || "Users",
                    ),
                  ),
                  React.createElement(
                    "span",
                    {
                      style: Object.assign({}, S.card, {
                        textAlign: "center",
                        padding: "8px 16px",
                      }),
                    },
                    React.createElement(
                      "div",
                      {
                        style: {
                          fontSize: 24,
                          fontWeight: 700,
                          color: "var(--fg)",
                        },
                      },
                      selectedTenant.max_users,
                    ),
                    React.createElement(
                      "div",
                      { style: { fontSize: 10, color: "var(--muted)" } },
                      __t("tenantAdmin.max") || "Max",
                    ),
                  ),
                ),
              ),
            ),
            React.createElement(
              "div",
              { style: Object.assign({}, S.card, { flex: 1 }) },
              React.createElement(
                "div",
                { style: Object.assign({}, S.header, { marginBottom: 12 }) },
                React.createElement(
                  "h3",
                  { style: { margin: 0, fontSize: 14, color: "var(--fg)" } },
                  (
                    __t("tenantAdmin.usersHeading") || "Users ({count})"
                  ).replace("{count}", tenantUsers.length),
                ),
                React.createElement(
                  "button",
                  {
                    className: "btn small",
                    onClick: function () {
                      setShowInvite(true);
                    },
                    style: { fontSize: 11 },
                  },
                  __t("tenantAdmin.inviteUser") || "+ Invite User",
                ),
              ),
              tenantUsers.length === 0
                ? React.createElement(
                    "div",
                    {
                      style: {
                        textAlign: "center",
                        padding: 20,
                        color: "var(--muted)",
                        fontSize: 12,
                      },
                    },
                    __t("tenantAdmin.noUsersInTenant") ||
                      "No users in this tenant",
                  )
                : React.createElement(
                    "table",
                    { style: S.table },
                    React.createElement(
                      "thead",
                      null,
                      React.createElement(
                        "tr",
                        null,
                        React.createElement(
                          "th",
                          { style: S.th },
                          __t("tenantAdmin.name") || "Name",
                        ),
                        React.createElement(
                          "th",
                          { style: S.th },
                          __t("tenantAdmin.email") || "Email",
                        ),
                        React.createElement(
                          "th",
                          { style: S.th },
                          __t("tenantAdmin.username") || "Username",
                        ),
                        React.createElement(
                          "th",
                          { style: S.th },
                          __t("tenantAdmin.status") || "Status",
                        ),
                        React.createElement(
                          "th",
                          { style: S.th },
                          __t("tenantAdmin.superuser") || "Superuser",
                        ),
                        React.createElement(
                          "th",
                          { style: S.th },
                          __t("tenantAdmin.lastLogin") || "Last Login",
                        ),
                      ),
                    ),
                    React.createElement(
                      "tbody",
                      null,
                      tenantUsers.map(function (u) {
                        return React.createElement(
                          "tr",
                          { key: u.id },
                          React.createElement(
                            "td",
                            { style: S.td },
                            u.fullName || "\u2014",
                          ),
                          React.createElement(
                            "td",
                            {
                              style: Object.assign({}, S.td, { fontSize: 11 }),
                            },
                            u.email,
                          ),
                          React.createElement(
                            "td",
                            {
                              style: Object.assign({}, S.td, {
                                fontFamily: "var(--font-mono)",
                                fontSize: 11,
                              }),
                            },
                            u.username,
                          ),
                          React.createElement(
                            "td",
                            { style: S.td },
                            badge(
                              u.isActive ? "var(--ok)" : "var(--fg-4)",
                              u.isActive
                                ? __t("tenantAdmin.active") || "Active"
                                : __t("tenantAdmin.inactive") || "Inactive",
                            ),
                          ),
                          React.createElement(
                            "td",
                            { style: S.td },
                            u.isSuperuser
                              ? __t("tenantAdmin.yes") || "Yes"
                              : __t("tenantAdmin.no") || "No",
                          ),
                          React.createElement(
                            "td",
                            {
                              style: Object.assign({}, S.td, { fontSize: 11 }),
                            },
                            u.lastLoginAt
                              ? u.lastLoginAt.slice(0, 10)
                              : "\u2014",
                          ),
                        );
                      }),
                    ),
                  ),
            ),
          )
        : null,
    showCreate
      ? React.createElement(CreateTenantModal, {
          onClose: function () {
            setShowCreate(false);
          },
          onCreated: function () {
            setShowCreate(false);
            loadTenants();
          },
        })
      : null,
    showInvite && selectedTenant
      ? React.createElement(InviteUserModal, {
          tenantId: selectedTenant.id,
          tenantName: selectedTenant.tenant_name,
          onClose: function () {
            setShowInvite(false);
          },
          onInvited: function () {
            setShowInvite(false);
            loadTenantUsers(selectedTenant.id);
          },
        })
      : null,
  );
}

function CreateTenantModal(_ref) {
  const onClose = _ref.onClose,
    onCreated = _ref.onCreated;
  const _useState10 = useState({
      tenant_name: "",
      tenant_code: "",
      domain: "",
      plan: "free",
      max_users: 5,
      max_storage_gb: 1,
    }),
    form = _useState10[0],
    setForm = _useState10[1];
  const _useState11 = useState(false),
    saving = _useState11[0],
    setSaving = _useState11[1];
  const _useState12 = useState(null),
    error = _useState12[0],
    setError = _useState12[1];

  const set = function (k, v) {
    setForm(Object.assign({}, form, ((_a = {}), (_a[k] = v), _a)));
    let _a;
  };
  const canSave = form.tenant_name && form.tenant_code;

  return React.createElement(
    "div",
    {
      className: "modal-overlay",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: Z.MODAL,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          background: "var(--card)",
          borderRadius: 12,
          padding: 24,
          minWidth: 400,
          maxWidth: 520,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        },
      },
      React.createElement(
        "h2",
        { style: { margin: "0 0 16px", fontSize: 16, color: "var(--fg)" } },
        __t("tenantAdmin.createNewTenant") || "Create New Tenant",
      ),
      error
        ? React.createElement(
            "div",
            {
              style: {
                padding: "8px 12px",
                marginBottom: 12,
                borderRadius: 6,
                background: "color-mix(in oklch, var(--danger) 10%, var(--bg))",
                color: "var(--danger)",
                fontSize: 12,
              },
            },
            error,
          )
        : null,
      React.createElement(
        "div",
        { style: { display: "grid", gap: 12 } },
        React.createElement(
          "div",
          { className: "field" },
          React.createElement(
            "label",
            {
              style: {
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--fg-2)",
                marginBottom: 4,
              },
            },
            __t("tenantAdmin.tenantNameRequired") || "Tenant Name *",
          ),
          React.createElement("input", {
            className: "input",
            value: form.tenant_name,
            onChange: function (e) {
              set("tenant_name", e.target.value);
            },
            placeholder:
              __t("tenantAdmin.tenantNamePlaceholder") || "e.g. Acme Corp",
            style: { width: "100%", fontSize: 12 },
          }),
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement(
            "label",
            {
              style: {
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--fg-2)",
                marginBottom: 4,
              },
            },
            __t("tenantAdmin.tenantCodeRequired") || "Tenant Code *",
          ),
          React.createElement("input", {
            className: "input",
            value: form.tenant_code,
            onChange: function (e) {
              set(
                "tenant_code",
                e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
              );
            },
            placeholder:
              __t("tenantAdmin.tenantCodePlaceholder") || "e.g. acme_corp",
            style: {
              width: "100%",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            },
          }),
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement(
            "label",
            {
              style: {
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--fg-2)",
                marginBottom: 4,
              },
            },
            __t("tenantAdmin.domainOptional") || "Domain (optional)",
          ),
          React.createElement("input", {
            className: "input",
            value: form.domain,
            onChange: function (e) {
              set("domain", e.target.value);
            },
            placeholder:
              __t("tenantAdmin.domainPlaceholder") || "e.g. acme.com",
            style: { width: "100%", fontSize: 12 },
          }),
        ),
        React.createElement(
          "div",
          {
            style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
          },
          React.createElement(
            "div",
            { className: "field" },
            React.createElement(
              "label",
              {
                style: {
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--fg-2)",
                  marginBottom: 4,
                },
              },
              __t("tenantAdmin.plan") || "Plan",
            ),
            React.createElement(
              "select",
              {
                className: "select",
                value: form.plan,
                onChange: function (e) {
                  set("plan", e.target.value);
                },
                style: { width: "100%", fontSize: 12 },
              },
              React.createElement(
                "option",
                { value: "free" },
                __t("tenant.planFree") || "Free",
              ),
              React.createElement(
                "option",
                { value: "starter" },
                __t("tenant.planStarter") || "Starter",
              ),
              React.createElement(
                "option",
                { value: "professional" },
                __t("tenant.planProfessional") || "Professional",
              ),
              React.createElement(
                "option",
                { value: "enterprise" },
                __t("tenant.planEnterprise") || "Enterprise",
              ),
            ),
          ),
          React.createElement(
            "div",
            { className: "field" },
            React.createElement(
              "label",
              {
                style: {
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--fg-2)",
                  marginBottom: 4,
                },
              },
              __t("tenantAdmin.maxUsers") || "Max Users",
            ),
            React.createElement("input", {
              className: "input",
              type: "number",
              value: form.max_users,
              onChange: function (e) {
                set("max_users", parseInt(e.target.value) || 1);
              },
              min: 1,
              style: { width: "100%", fontSize: 12 },
            }),
          ),
        ),
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 20,
          },
        },
        React.createElement(
          "button",
          { className: "btn", onClick: onClose, style: { fontSize: 12 } },
          __t("common.cancel") || "Cancel",
        ),
        React.createElement(
          "button",
          {
            className: "btn primary",
            disabled: !canSave || saving,
            onClick: function () {
              if (!canSave) return;
              setSaving(true);
              setError(null);
              (api && api.tenants
                ? api.tenants.create(form)
                : Promise.reject(new Error("API not available"))
              )
                .then(function () {
                  toast(__t("tenantAdmin.tenantCreated") || "Tenant created", {
                    kind: "success",
                  });
                  onCreated();
                })
                .catch(function (err) {
                  setError(
                    err.message ||
                      __t("tenantAdmin.failedToCreate") ||
                      "Failed to create tenant",
                  );
                })
                .finally(function () {
                  setSaving(false);
                });
            },
            style: { fontSize: 12 },
          },
          saving
            ? __t("tenantAdmin.creating") || "Creating..."
            : __t("tenantAdmin.createTenant") || "Create Tenant",
        ),
      ),
    ),
  );
}

function InviteUserModal(_ref2) {
  const tenantId = _ref2.tenantId,
    tenantName = _ref2.tenantName,
    onClose = _ref2.onClose,
    onInvited = _ref2.onInvited;
  const _useState13 = useState({
      email: "",
      username: "",
      fullName: "",
      isSuperuser: false,
    }),
    form = _useState13[0],
    setForm = _useState13[1];
  const _useState14 = useState(false),
    saving = _useState14[0],
    setSaving = _useState14[1];
  const _useState15 = useState(null),
    result = _useState15[0],
    setResult = _useState15[1];
  const _useState16 = useState(null),
    error = _useState16[0],
    setError = _useState16[1];

  const set = function (k, v) {
    setForm(Object.assign({}, form, ((_a = {}), (_a[k] = v), _a)));
    let _a;
  };
  const canSave = form.email;

  if (result) {
    return React.createElement(
      "div",
      {
        className: "modal-overlay",
        style: {
          position: "fixed",
          inset: 0,
          zIndex: Z.MODAL,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            background: "var(--card)",
            borderRadius: 12,
            padding: 24,
            minWidth: 400,
            maxWidth: 520,
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          },
        },
        React.createElement(
          "h2",
          { style: { margin: "0 0 16px", fontSize: 16, color: "var(--fg)" } },
          __t("tenantAdmin.userInvited") || "User Invited",
        ),
        React.createElement(
          "div",
          {
            style: {
              padding: 12,
              borderRadius: 8,
              background: "color-mix(in oklch, var(--ok) 10%, var(--bg))",
              marginBottom: 16,
            },
          },
          React.createElement(
            "p",
            { style: { margin: "0 0 8px", fontSize: 13, color: "var(--fg)" } },
            (
              __t("tenantAdmin.invitationSent") || "Invitation sent to {email}"
            ).replace("{email}", result.email),
          ),
          React.createElement(
            "div",
            { style: { fontSize: 12 } },
            React.createElement(
              "strong",
              null,
              __t("tenantAdmin.tempPassword") || "Temporary Password:",
            ),
            React.createElement(
              "code",
              {
                style: {
                  display: "block",
                  padding: "8px 12px",
                  marginTop: 4,
                  background: "var(--bg)",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  userSelect: "all",
                },
              },
              result.temp_password,
            ),
          ),
          React.createElement(
            "p",
            {
              style: { margin: "8px 0 0", fontSize: 11, color: "var(--muted)" },
            },
            __t("tenantAdmin.sharePassword") ||
              "Share this password securely with the user.",
          ),
        ),
        React.createElement(
          "button",
          {
            className: "btn primary",
            onClick: onInvited,
            style: { fontSize: 12, width: "100%" },
          },
          __t("common.done") || "Done",
        ),
      ),
    );
  }

  return React.createElement(
    "div",
    {
      className: "modal-overlay",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: Z.MODAL,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          background: "var(--card)",
          borderRadius: 12,
          padding: 24,
          minWidth: 400,
          maxWidth: 520,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        },
      },
      React.createElement(
        "h2",
        { style: { margin: "0 0 4px", fontSize: 16, color: "var(--fg)" } },
        __t("tenantAdmin.inviteUserTitle") || "Invite User",
      ),
      React.createElement(
        "p",
        { style: { margin: "0 0 16px", fontSize: 12, color: "var(--muted)" } },
        (__t("tenantAdmin.addUserToTenant") || "Add a user to {name}").replace(
          "{name}",
          tenantName,
        ),
      ),
      error
        ? React.createElement(
            "div",
            {
              style: {
                padding: "8px 12px",
                marginBottom: 12,
                borderRadius: 6,
                background: "color-mix(in oklch, var(--danger) 10%, var(--bg))",
                color: "var(--danger)",
                fontSize: 12,
              },
            },
            error,
          )
        : null,
      React.createElement(
        "div",
        { style: { display: "grid", gap: 12 } },
        React.createElement(
          "div",
          { className: "field" },
          React.createElement(
            "label",
            {
              style: {
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--fg-2)",
                marginBottom: 4,
              },
            },
            __t("tenantAdmin.emailRequired") || "Email *",
          ),
          React.createElement("input", {
            className: "input",
            type: "email",
            value: form.email,
            onChange: function (e) {
              set("email", e.target.value);
            },
            placeholder: __t("tenantAdmin.emailPlaceholder") || "user@acme.com",
            style: { width: "100%", fontSize: 12 },
          }),
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement(
            "label",
            {
              style: {
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--fg-2)",
                marginBottom: 4,
              },
            },
            __t("tenantAdmin.fullName") || "Full Name",
          ),
          React.createElement("input", {
            className: "input",
            value: form.fullName,
            onChange: function (e) {
              set("fullName", e.target.value);
            },
            placeholder: __t("tenantAdmin.fullNamePlaceholder") || "Jane Smith",
            style: { width: "100%", fontSize: 12 },
          }),
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement(
            "label",
            {
              style: {
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--fg-2)",
                marginBottom: 4,
              },
            },
            __t("tenantAdmin.username") || "Username",
          ),
          React.createElement("input", {
            className: "input",
            value: form.username,
            onChange: function (e) {
              set("username", e.target.value);
            },
            placeholder: __t("tenantAdmin.usernamePlaceholder") || "jsmith",
            style: { width: "100%", fontSize: 12 },
          }),
        ),
        React.createElement(
          "label",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--fg)",
              cursor: "pointer",
            },
          },
          React.createElement("input", {
            type: "checkbox",
            checked: form.isSuperuser,
            onChange: function (e) {
              set("isSuperuser", e.target.checked);
            },
          }),
          __t("tenantAdmin.superuserLabel") ||
            "Superuser (bypasses tenant isolation)",
        ),
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 20,
          },
        },
        React.createElement(
          "button",
          { className: "btn", onClick: onClose, style: { fontSize: 12 } },
          __t("common.cancel") || "Cancel",
        ),
        React.createElement(
          "button",
          {
            className: "btn primary",
            disabled: !canSave || saving,
            onClick: function () {
              if (!canSave) return;
              setSaving(true);
              setError(null);
              (api && api.tenants
                ? api.tenants.inviteUser(tenantId, form)
                : Promise.reject(new Error("API not available"))
              )
                .then(function (res) {
                  toast(__t("tenantAdmin.userInvitedToast") || "User invited", {
                    kind: "success",
                  });
                  setResult(res);
                })
                .catch(function (err) {
                  setError(
                    err.message ||
                      __t("tenantAdmin.failedToInvite") ||
                      "Failed to invite user",
                  );
                })
                .finally(function () {
                  setSaving(false);
                });
            },
            style: { fontSize: 12 },
          },
          saving
            ? __t("tenantAdmin.inviting") || "Inviting..."
            : __t("tenantAdmin.sendInvitation") || "Send Invitation",
        ),
      ),
    ),
  );
}

export { TenantsAdminScreen };
window.TenantsAdminScreen = TenantsAdminScreen;
