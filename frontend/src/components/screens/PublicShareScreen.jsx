import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { api } from "../../../api.js";
import { Button, EmptyState, Field, Input, ScreenHeader, Spinner } from "../ui";
import { DataTable } from "../ui/DataTable.jsx";

// ============ PUBLIC BOM SHARE VIEWER ============
//
// GET /api/v1/bom-shares/public/{token} — the one route in the product that
// takes NO session: an external supplier opens /share/<token> with no account.
// App.jsx renders this screen BEFORE the auth gate for exactly that reason.
//
// The server answers unknown, expired, revoked and wrong-password with a
// byte-identical 404 so a token cannot be probed. This screen therefore shows
// ONE neutral message for every failure and never guesses which happened —
// including when a password is entered and rejected.
//
// The payload is read-only by construction (no cost, no ids, no write route),
// so there is nothing to edit here and no action offered.
export default function PublicShareScreen({ token }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [password, setPassword] = React.useState("");

  const load = React.useCallback(
    async (pw) => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await api.bomShares.resolvePublic(token, pw || undefined);
        setData(res);
      } catch {
        // Deliberately ignores the error text: the server gives one answer for
        // every failure mode, so the UI must not invent a distinction.
        setData(null);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  React.useEffect(() => {
    load();
  }, [load]);

  const items = React.useMemo(() => {
    const raw = Array.isArray(data?.items)
      ? data.items
      : data?.items?.items || [];
    // parentLine is a position in THIS payload, so depth is a walk up those
    // positions. Guarded against a cycle so a bad payload cannot hang the page.
    const byLine = new Map(raw.map((it) => [it.line, it]));
    return raw.map((it) => {
      let depth = 0;
      let parent = it.parentLine;
      while (parent != null && depth < 32) {
        depth += 1;
        parent = byLine.get(parent)?.parentLine;
      }
      return { ...it, depth };
    });
  }, [data]);

  const columns = [
    {
      key: "line",
      header: __t("share.line") || "#",
      align: "num",
      width: 56,
      render: (row) => row.line,
    },
    {
      key: "partNumber",
      header: __t("share.partNumber") || "Part number",
      render: (row) => (
        <span
          className="font-mono fs-11"
          style={{ paddingLeft: row.depth * 16 }}
        >
          {row.partNumber || "—"}
        </span>
      ),
    },
    {
      key: "partName",
      header: __t("share.partName") || "Name",
      render: (row) => row.partName || row.description || "—",
    },
    {
      key: "manufacturer",
      header: __t("share.manufacturer") || "Manufacturer",
      render: (row) =>
        [row.manufacturer, row.mpn].filter(Boolean).join(" · ") || "—",
    },
    {
      key: "quantity",
      header: __t("share.quantity") || "Qty",
      align: "num",
      render: (row) =>
        row.quantity == null
          ? "—"
          : row.uom
            ? row.quantity + " " + row.uom
            : String(row.quantity),
    },
    {
      key: "referenceDesignator",
      header: __t("share.refDes") || "Ref des",
      render: (row) => row.referenceDesignator || "—",
    },
    {
      key: "notes",
      header: __t("share.notes") || "Notes",
      render: (row) => row.notes || "—",
    },
  ];

  return (
    <div className="content-frame" style={{ padding: "24px 32px" }}>
      {loading && (
        <div
          className="flex items-center gap-8 fs-12 fg-2"
          style={{ padding: 24 }}
          role="status"
        >
          <Spinner /> {__t("common.loading") || "Loading…"}
        </div>
      )}

      {!loading && failed && (
        <>
          <ScreenHeader
            title={__t("share.unavailableTitle") || "This link is unavailable"}
            description={
              __t("share.unavailable") ||
              "This share link cannot be opened. It may be invalid, expired, revoked, or protected by a password. Ask the person who sent it for a current link."
            }
          />
          <form
            style={{ maxWidth: 360 }}
            onSubmit={(e) => {
              e.preventDefault();
              load(password);
            }}
          >
            <Field
              label={__t("share.password") || "Password"}
              hint={
                __t("share.passwordHint") ||
                "If the link is password protected, enter it here."
              }
            >
              <Input
                name="sharePassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={__t("share.password") || "Password"}
              />
            </Field>
            <Button type="submit" variant="primary">
              {__t("share.open") || "Open link"}
            </Button>
          </form>
        </>
      )}

      {!loading && !failed && data && (
        <>
          <ScreenHeader
            title={data.bom?.name || __t("share.bom") || "Bill of materials"}
            description={
              [
                data.bom?.projectCode,
                data.bom?.description,
                __t("share.readOnly") || "Read-only shared view",
              ]
                .filter(Boolean)
                .join(" · ")
            }
          />
          <div className="fs-11 fg-3 mb-12">
            {(__t("share.lineCount") || "Lines") +
              ": " +
              (data.bom?.lineCount ?? items.length)}
            {data.expiresAt
              ? " · " +
                (__t("share.expires") || "Link expires") +
                " " +
                new Date(data.expiresAt).toLocaleString()
              : ""}
          </div>

          {items.length === 0 ? (
            <EmptyState
              title={__t("share.emptyTitle") || "No lines"}
              message={
                __t("share.empty") || "This BOM has no lines to show yet."
              }
            />
          ) : (
            <DataTable
              columns={columns}
              rows={items}
              dense
              getRowKey={(row) => row.line}
              ariaLabel={data.bom?.name || "Bill of materials"}
            />
          )}
        </>
      )}
    </div>
  );
}
PublicShareScreen.propTypes = {
  token: PropTypes.string.isRequired,
};
