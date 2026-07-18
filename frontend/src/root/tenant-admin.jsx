import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { api } from "../globals";
import {
  Button,
  Field,
  Input,
  Select,
  Card,
  DataTable,
  Badge,
  StatusPill,
  Modal,
  ScreenHeader,
  EmptyState,
  Spinner,
} from "../components/ui/index.js";

const PLAN_TONE = {
  free: "neutral",
  starter: "info",
  professional: "warning",
  enterprise: "accent",
};
const STATUS_TONE = {
  active: "success",
  inactive: "neutral",
  suspended: "danger",
};

function TenantsAdminScreen() {
  const [tab, setTab] = React.useState("tenants");
  const [tenants, setTenants] = React.useState([]);
  const [tenantUsers, setTenantUsers] = React.useState([]);
  const [selectedTenant, setSelectedTenant] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [showInvite, setShowInvite] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  const loadTenants = React.useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    (api && api.tenants
      ? api.tenants.list(params)
      : Promise.resolve({ items: [], total: 0 })
    )
      .then((res) => setTenants(res.items || []))
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  React.useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const loadTenantUsers = React.useCallback((tid) => {
    if (!tid) {
      setTenantUsers([]);
      return;
    }
    (api && api.tenants
      ? api.tenants.users(tid)
      : Promise.resolve({ items: [] })
    )
      .then((res) => setTenantUsers(res.items || []))
      .catch(() => setTenantUsers([]));
  }, []);

  const selectTenant = React.useCallback(
    (t) => {
      setSelectedTenant(t);
      setTab("users");
      loadTenantUsers(t.id);
    },
    [loadTenantUsers],
  );

  const tenantColumns = [
    {
      key: "tenant_name",
      header: __t("tenantAdmin.tenant") || "Tenant",
      sortable: false,
    },
    {
      key: "tenant_code",
      header: __t("tenantAdmin.code") || "Code",
      render: (t) => <span className="font-mono fs-11">{t.tenant_code}</span>,
    },
    {
      key: "plan",
      header: __t("tenantAdmin.plan") || "Plan",
      render: (t) => (
        <Badge tone={PLAN_TONE[t.plan] || "neutral"}>{t.plan}</Badge>
      ),
    },
    {
      key: "status",
      header: __t("tenantAdmin.status") || "Status",
      render: (t) => (
        <StatusPill status={t.status} tone={STATUS_TONE[t.status] || "neutral"} />
      ),
    },
    {
      key: "max_users",
      header: __t("tenantAdmin.users") || "Users",
      render: (t) => `${t.max_users} ${__t("tenantAdmin.max") || "max"}`,
    },
    {
      key: "domain",
      header: __t("tenantAdmin.domain") || "Domain",
      render: (t) => (
        <span className="fs-11">{t.domain || "—"}</span>
      ),
    },
    {
      key: "created_at",
      header: __t("tenantAdmin.created") || "Created",
      render: (t) => (
        <span className="fs-11">
          {t.created_at ? t.created_at.slice(0, 10) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (t) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            selectTenant(t);
          }}
        >
          {__t("tenantAdmin.manage") || "Manage"}
        </Button>
      ),
    },
  ];

  const userColumns = [
    {
      key: "fullName",
      header: __t("tenantAdmin.name") || "Name",
      render: (u) => u.fullName || "—",
    },
    {
      key: "email",
      header: __t("tenantAdmin.email") || "Email",
      render: (u) => <span className="fs-11">{u.email}</span>,
    },
    {
      key: "username",
      header: __t("tenantAdmin.username") || "Username",
      render: (u) => <span className="font-mono fs-11">{u.username}</span>,
    },
    {
      key: "status",
      header: __t("tenantAdmin.status") || "Status",
      render: (u) => (
        <Badge tone={u.isActive ? "success" : "neutral"}>
          {u.isActive
            ? __t("tenantAdmin.active") || "Active"
            : __t("tenantAdmin.inactive") || "Inactive"}
        </Badge>
      ),
    },
    {
      key: "isSuperuser",
      header: __t("tenantAdmin.superuser") || "Superuser",
      render: (u) =>
        u.isSuperuser
          ? __t("tenantAdmin.yes") || "Yes"
          : __t("tenantAdmin.no") || "No",
    },
    {
      key: "lastLoginAt",
      header: __t("tenantAdmin.lastLogin") || "Last Login",
      render: (u) => (
        <span className="fs-11">
          {u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="screen-wrap" data-screen-label="Tenant Administration">
      <ScreenHeader
        title={__t("tenantAdmin.title") || "Tenant Administration"}
        description={
          __t("tenantAdmin.subtitle") ||
          "Manage organizations, plans, and user assignments"
        }
        actions={
          <>
            {tab === "tenants" ? (
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                {__t("tenantAdmin.newTenant") || "+ New Tenant"}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setShowInvite(true)}>
                {__t("tenantAdmin.addUser") || "+ Add User"}
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={tab === "tenants"}
              onClick={() => {
                setTab("tenants");
                setSelectedTenant(null);
                loadTenants();
              }}
            >
              {__t("tenantAdmin.backToTenants") || "Back to Tenants"}
            </Button>
          </>
        }
      />

      <div className="flex gap-8 mb-16">
        <Input
          className="flex-1"
          value={search || ""}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            __t("tenantAdmin.searchPlaceholder") ||
            "Search tenants by name, code, or domain…"
          }
          aria-label={__t("tenantAdmin.searchTenants") || "Search tenants"}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={__t("tenantAdmin.filterByStatus") || "Filter by status"}
          style={{ maxWidth: 200 }}
        >
          <option value="">{__t("tenantAdmin.allStatus") || "All status"}</option>
          <option value="active">{__t("tenantAdmin.active") || "Active"}</option>
          <option value="inactive">
            {__t("tenantAdmin.inactive") || "Inactive"}
          </option>
          <option value="suspended">
            {__t("tenantAdmin.suspended") || "Suspended"}
          </option>
        </Select>
      </div>

      {tab === "tenants" ? (
        loading ? (
          <div
            className="flex items-center justify-center"
            style={{ padding: 40 }}
          >
            <Spinner label={__t("common.loading") || "Loading..."} />
          </div>
        ) : (
          <DataTable
            ariaLabel={__t("tenantAdmin.title") || "Tenant Administration"}
            columns={tenantColumns}
            rows={tenants}
            getRowKey={(t) => t.id}
            onRowClick={selectTenant}
            empty={
              <EmptyState
                title={__t("tenantAdmin.noTenantsFound") || "No tenants found"}
              />
            }
          />
        )
      ) : selectedTenant ? (
        <>
          <Card className="mb-16">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="m-0" style={{ fontSize: 16 }}>
                  {selectedTenant.tenant_name}
                </h2>
                <p className="m-0 fs-12 fg-3">
                  {(
                    __t("tenantAdmin.tenantInfo") ||
                    "Code: {code} · Plan: {plan} · Status: {status}"
                  )
                    .replace("{code}", selectedTenant.tenant_code)
                    .replace("{plan}", selectedTenant.plan)
                    .replace("{status}", selectedTenant.status)}
                </p>
              </div>
              <div className="flex gap-8">
                <div
                  className="flex flex-col items-center"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="fs-24 fw-700">{tenantUsers.length}</div>
                  <div className="fs-10 fg-3">
                    {__t("tenantAdmin.users") || "Users"}
                  </div>
                </div>
                <div
                  className="flex flex-col items-center"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="fs-24 fw-700">{selectedTenant.max_users}</div>
                  <div className="fs-10 fg-3">
                    {__t("tenantAdmin.max") || "Max"}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card
            title={(__t("tenantAdmin.usersHeading") || "Users ({count})").replace(
              "{count}",
              tenantUsers.length,
            )}
            actions={
              <Button size="sm" onClick={() => setShowInvite(true)}>
                {__t("tenantAdmin.inviteUser") || "+ Invite User"}
              </Button>
            }
          >
            <DataTable
              ariaLabel={__t("tenantAdmin.usersHeading") || "Users"}
              columns={userColumns}
              rows={tenantUsers}
              getRowKey={(u) => u.id}
              empty={
                <EmptyState
                  message={
                    __t("tenantAdmin.noUsersInTenant") ||
                    "No users in this tenant"
                  }
                />
              }
            />
          </Card>
        </>
      ) : null}

      {showCreate ? (
        <CreateTenantModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadTenants();
          }}
        />
      ) : null}

      {showInvite && selectedTenant ? (
        <InviteUserModal
          tenantId={selectedTenant.id}
          tenantName={selectedTenant.tenant_name}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            loadTenantUsers(selectedTenant.id);
          }}
        />
      ) : null}
    </div>
  );
}

function CreateTenantModal({ onClose, onCreated }) {
  const [form, setForm] = React.useState({
    tenant_name: "",
    tenant_code: "",
    domain: "",
    plan: "free",
    max_users: 5,
    max_storage_gb: 1,
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const canSave = form.tenant_name && form.tenant_code;

  const handleCreate = () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    (api && api.tenants
      ? api.tenants.create(form)
      : Promise.reject(new Error("API not available"))
    )
      .then(() => {
        toast(__t("tenantAdmin.tenantCreated") || "Tenant created", {
          kind: "success",
        });
        onCreated();
      })
      .catch((err) => {
        setError(
          err.message ||
            __t("tenantAdmin.failedToCreate") ||
            "Failed to create tenant",
        );
      })
      .finally(() => setSaving(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={__t("tenantAdmin.createNewTenant") || "Create New Tenant"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={!canSave || saving}
            loading={saving}
            onClick={handleCreate}
          >
            {saving
              ? __t("tenantAdmin.creating") || "Creating..."
              : __t("tenantAdmin.createTenant") || "Create Tenant"}
          </Button>
        </>
      }
    >
      {error ? (
        <div
          role="alert"
          className="fs-12"
          style={{
            padding: "8px 12px",
            marginBottom: 12,
            borderRadius: "var(--radius-sm)",
            background:
              "color-mix(in oklch, var(--status-danger) 10%, var(--bg-surface))",
            color: "var(--status-danger-text)",
          }}
        >
          {error}
        </div>
      ) : null}

      <Field
        label={__t("tenantAdmin.tenantNameRequired") || "Tenant Name"}
        required
        htmlFor="tenant-create-name"
      >
        <Input
          value={form.tenant_name}
          onChange={(e) => set("tenant_name", e.target.value)}
          placeholder={
            __t("tenantAdmin.tenantNamePlaceholder") || "e.g. Acme Corp"
          }
        />
      </Field>

      <Field
        label={__t("tenantAdmin.tenantCodeRequired") || "Tenant Code"}
        required
        htmlFor="tenant-create-code"
      >
        <Input
          mono
          value={form.tenant_code}
          onChange={(e) =>
            set(
              "tenant_code",
              e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
            )
          }
          placeholder={
            __t("tenantAdmin.tenantCodePlaceholder") || "e.g. acme_corp"
          }
        />
      </Field>

      <Field
        label={__t("tenantAdmin.domainOptional") || "Domain (optional)"}
        htmlFor="tenant-create-domain"
      >
        <Input
          value={form.domain}
          onChange={(e) => set("domain", e.target.value)}
          placeholder={__t("tenantAdmin.domainPlaceholder") || "e.g. acme.com"}
        />
      </Field>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--sp-3)",
        }}
      >
        <Field label={__t("tenantAdmin.plan") || "Plan"} htmlFor="tenant-create-plan">
          <Select
            value={form.plan}
            onChange={(e) => set("plan", e.target.value)}
          >
            <option value="free">{__t("tenant.planFree") || "Free"}</option>
            <option value="starter">
              {__t("tenant.planStarter") || "Starter"}
            </option>
            <option value="professional">
              {__t("tenant.planProfessional") || "Professional"}
            </option>
            <option value="enterprise">
              {__t("tenant.planEnterprise") || "Enterprise"}
            </option>
          </Select>
        </Field>

        <Field
          label={__t("tenantAdmin.maxUsers") || "Max Users"}
          htmlFor="tenant-create-max-users"
        >
          <Input
            type="number"
            min={1}
            value={form.max_users}
            onChange={(e) => set("max_users", parseInt(e.target.value) || 1)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function InviteUserModal({ tenantId, tenantName, onClose, onInvited }) {
  const [form, setForm] = React.useState({
    email: "",
    username: "",
    fullName: "",
    isSuperuser: false,
  });
  const [saving, setSaving] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const canSave = !!form.email;

  const handleInvite = () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    (api && api.tenants
      ? api.tenants.inviteUser(tenantId, form)
      : Promise.reject(new Error("API not available"))
    )
      .then((res) => {
        toast(__t("tenantAdmin.userInvitedToast") || "User invited", {
          kind: "success",
        });
        setResult(res);
      })
      .catch((err) => {
        setError(
          err.message ||
            __t("tenantAdmin.failedToInvite") ||
            "Failed to invite user",
        );
      })
      .finally(() => setSaving(false));
  };

  if (result) {
    return (
      <Modal
        open
        onClose={onInvited}
        title={__t("tenantAdmin.userInvited") || "User Invited"}
        footer={
          <Button variant="primary" block onClick={onInvited}>
            {__t("common.done") || "Done"}
          </Button>
        }
      >
        <div
          style={{
            padding: 12,
            borderRadius: "var(--radius-md)",
            background:
              "color-mix(in oklch, var(--status-success) 10%, var(--bg-surface))",
          }}
        >
          <p className="m-0 fs-13" style={{ marginBottom: 8 }}>
            {(
              __t("tenantAdmin.invitationSent") || "Invitation sent to {email}"
            ).replace("{email}", result.email)}
          </p>
          <div className="fs-12">
            <strong>
              {__t("tenantAdmin.tempPassword") || "Temporary Password:"}
            </strong>
            <code
              className="font-mono fs-13"
              style={{
                display: "block",
                padding: "8px 12px",
                marginTop: 4,
                background: "var(--bg-subtle)",
                borderRadius: "var(--radius-sm)",
                userSelect: "all",
              }}
            >
              {result.temp_password}
            </code>
          </div>
          <p className="fs-11 fg-3" style={{ margin: "8px 0 0" }}>
            {__t("tenantAdmin.sharePassword") ||
              "Share this password securely with the user."}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={__t("tenantAdmin.inviteUserTitle") || "Invite User"}
      subtitle={(__t("tenantAdmin.addUserToTenant") || "Add a user to {name}").replace(
        "{name}",
        tenantName,
      )}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={!canSave || saving}
            loading={saving}
            onClick={handleInvite}
          >
            {saving
              ? __t("tenantAdmin.inviting") || "Inviting..."
              : __t("tenantAdmin.sendInvitation") || "Send Invitation"}
          </Button>
        </>
      }
    >
      {error ? (
        <div
          role="alert"
          className="fs-12"
          style={{
            padding: "8px 12px",
            marginBottom: 12,
            borderRadius: "var(--radius-sm)",
            background:
              "color-mix(in oklch, var(--status-danger) 10%, var(--bg-surface))",
            color: "var(--status-danger-text)",
          }}
        >
          {error}
        </div>
      ) : null}

      <Field
        label={__t("tenantAdmin.emailRequired") || "Email"}
        required
        htmlFor="invite-email"
      >
        <Input
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder={__t("tenantAdmin.emailPlaceholder") || "user@acme.com"}
        />
      </Field>

      <Field
        label={__t("tenantAdmin.fullName") || "Full Name"}
        htmlFor="invite-fullname"
      >
        <Input
          value={form.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          placeholder={__t("tenantAdmin.fullNamePlaceholder") || "Jane Smith"}
        />
      </Field>

      <Field
        label={__t("tenantAdmin.username") || "Username"}
        htmlFor="invite-username"
      >
        <Input
          value={form.username}
          onChange={(e) => set("username", e.target.value)}
          placeholder={__t("tenantAdmin.usernamePlaceholder") || "jsmith"}
        />
      </Field>

      <label className="flex items-center gap-8 fs-12" style={{ cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={form.isSuperuser}
          onChange={(e) => set("isSuperuser", e.target.checked)}
        />
        {__t("tenantAdmin.superuserLabel") ||
          "Superuser (bypasses tenant isolation)"}
      </label>
    </Modal>
  );
}

export { TenantsAdminScreen };
window.TenantsAdminScreen = TenantsAdminScreen;
