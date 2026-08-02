import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, api, escapeHtml, openPrintWindow } from "../../globals";
import { Button, EmptyState, Menu, ScreenHeader } from "../ui";
// ============ DIFF ============
export default function DiffScreen({ data, openModal }) {
  const [swapped, setSwapped] = React.useState(false);
  const [versionA, setVersionA] = React.useState("current");
  const [bom1Id] = React.useState(1);
  const [bom2Id] = React.useState(2);
  const [apiDiff, setApiDiff] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [snapshots, setSnapshots] = React.useState([]);

  React.useEffect(() => {
    if (api && api.bomEnterprise) {
      setLoading(true);
      api.bomEnterprise
        .compare(bom1Id, bom2Id)
        .then((result) => {
          const changes = [];
          (result.added || []).forEach((p) =>
            changes.push({
              kind: "added",
              pn: p.part_number,
              desc: `Qty ${p.quantity}`,
              side: "b",
            }),
          );
          (result.removed || []).forEach((p) =>
            changes.push({
              kind: "removed",
              pn: p.part_number,
              desc: `Qty ${p.quantity}`,
              side: "a",
            }),
          );
          (result.modified || []).forEach((p) =>
            changes.push({
              kind: "changed",
              pn: p.part_number,
              desc: `Qty ${p.old_quantity} → ${p.new_quantity}`,
              side: "both",
            }),
          );
          setApiDiff({
            a: { ver: result.version_1 || "v1", date: "", author: "" },
            b: { ver: result.version_2 || "v2", date: "", author: "" },
            changes,
          });
        })
        .catch((err) => {
          console.warn("[DiffScreen] BOM diff failed:", err?.message || err);
        })
        .finally(() => setLoading(false));
    }
  }, [bom1Id, bom2Id]);

  // Real archived snapshots for the current BOM, used to populate the
  // "Compare with…" menu with actual saved versions instead of invented
  // ones. Snapshots carry metadata + item_count only (no per-item diff
  // payload), so selecting one shows its real details rather than a
  // fabricated added/removed/changed breakdown — see the empty-state
  // branch in the render below.
  React.useEffect(() => {
    if (api && api.bomEnterprise && api.bomEnterprise.snapshots) {
      api.bomEnterprise.snapshots
        .list(bom2Id)
        .then((list) => setSnapshots(Array.isArray(list) ? list : []))
        .catch((err) => {
          console.warn(
            "[DiffScreen] snapshot list failed:",
            err?.message || err,
          );
          setSnapshots([]);
        });
    }
  }, [bom2Id]);

  const currentDiff = apiDiff || data.diff;
  const selectedSnapshot =
    versionA !== "current"
      ? snapshots.find((s) => String(s.id) === versionA)
      : null;
  const baseDiff = selectedSnapshot ? null : currentDiff;

  const a = baseDiff ? (swapped ? baseDiff.b : baseDiff.a) : null;
  const b = baseDiff ? (swapped ? baseDiff.a : baseDiff.b) : null;
  const flipKind = (k) =>
    swapped ? (k === "added" ? "removed" : k === "removed" ? "added" : k) : k;
  const flipSide = (s) =>
    swapped ? (s === "a" ? "b" : s === "b" ? "a" : s) : s;
  const changes = baseDiff
    ? baseDiff.changes.map((c) => ({
        ...c,
        kind: flipKind(c.kind),
        side: flipSide(c.side),
      }))
    : [];
  const counts = changes.reduce((acc, c) => {
    acc[c.kind] = (acc[c.kind] || 0) + 1;
    return acc;
  }, {});

  const versionChoices = [
    {
      key: "current",
      label:
        (currentDiff?.a?.ver || "A") +
        " ↔ " +
        (currentDiff?.b?.ver || "B") +
        " (" +
        (__t("diff.current") || "current") +
        ")",
    },
    ...snapshots.map((s) => ({
      key: String(s.id),
      label:
        (s.version || s.snapshot_name || `#${s.id}`) +
        (s.snapshot_type ? " · " + s.snapshot_type : ""),
    })),
  ];

  const exportDiff = () => {
    if (!baseDiff || changes.length === 0) {
      toast(__t("diff.nothingToExport") || "No diff data to export", {
        kind: "warn",
      });
      return;
    }
    const rows = changes
      .map(
        (c) =>
          `<tr><td>${escapeHtml(c.kind.toUpperCase())}</td><td>${escapeHtml(c.pn || "")}</td><td>${escapeHtml(c.desc || "")}</td></tr>`,
      )
      .join("");
    const title = `${a.ver} → ${b.ver}`;
    const html =
      "<html><head><title>" +
      escapeHtml(title) +
      "</title><style>body{font-family:monospace;padding:24px}h2{margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}</style></head><body><h2>" +
      escapeHtml(__t("diff.title") || "Compare Revisions") +
      "</h2><p>" +
      escapeHtml(title) +
      "</p><table><thead><tr><th>" +
      escapeHtml(__t("common.type") || "Type") +
      "</th><th>" +
      escapeHtml(__t("diff.partNumberCol") || "Part Number") +
      "</th><th>" +
      escapeHtml(__t("common.description") || "Description") +
      "</th></tr></thead><tbody>" +
      rows +
      "</tbody></table></body></html>";
    openPrintWindow(__t("diff.title") || "Compare Revisions", html, {
      printDelay: 300,
    });
    toast(__t("diff.exportedAsPdf") || "Diff exported as PDF", {
      kind: "success",
    });
  };

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={
          <>
            {__t("diff.title") || "Compare Revisions"}{" "}
            {loading && (
              <span className="fs-10 fg-3 ml-8" role="status">
                {__t("common.loading") || "Loading…"}
              </span>
            )}
          </>
        }
        description={
          selectedSnapshot ? (
            <span className="fg-3">
              {selectedSnapshot.snapshot_name || selectedSnapshot.version} ·{" "}
              {selectedSnapshot.item_count ?? 0} {__t("diff.items") || "items"}
              {selectedSnapshot.created_at
                ? " · " +
                  new Date(selectedSnapshot.created_at).toLocaleDateString()
                : ""}
            </span>
          ) : (
            <>
              <span className="fg-ok">
                +{counts.added || 0} {__t("diff.added") || "added"}
              </span>{" "}
              ·{" "}
              <span className="fg-danger">
                −{counts.removed || 0} {__t("diff.removed") || "removed"}
              </span>{" "}
              ·{" "}
              <span className="fg-warn">
                ↻{counts.changed || 0} {__t("diff.changed") || "changed"}
              </span>
            </>
          )
        }
        actions={
          <div className="flex gap-8">
            <Menu
              ariaLabel={__t("diff.compareWith") || "Compare with…"}
              trigger={
                <Button variant="secondary" size="sm">
                  {selectedSnapshot
                    ? selectedSnapshot.version ||
                      selectedSnapshot.snapshot_name
                    : `${a.ver} ↔ ${b.ver}`}{" "}
                  <Icon.ChevronDown size={10} />
                </Button>
              }
              items={versionChoices.map((v) => ({
                icon:
                  versionA === v.key ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label: v.label,
                onSelect: () => setVersionA(v.key),
              }))}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSwapped((s) => !s)}
            >
              <Icon.Diff size={12} /> {__t("diff.swap") || "Swap A↔B"}
            </Button>
            <Button variant="secondary" size="sm" onClick={exportDiff}>
              <Icon.Export size={12} /> {__t("diff.exportDiff") || "Export diff"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openModal?.("approve-b")}
            >
              <Icon.Check size={12} /> {__t("diff.approveB") || "Approve B"}
            </Button>
          </div>
        }
      />
      {!baseDiff ? (
        <EmptyState
          icon={<Icon.Diff size={22} />}
          title={__t("diff.snapshotTitle") || "Archived snapshot"}
          message={
            selectedSnapshot?.change_description ||
            (__t("diff.snapshotNoDetail") ||
              "This is a saved snapshot. Line-by-line comparison against archived snapshots isn't available yet — showing snapshot details only.") +
              (selectedSnapshot
                ? ` (${selectedSnapshot.item_count ?? 0} ${__t("diff.items") || "items"})`
                : "")
          }
        />
      ) : (
      <div
        className="diff-wrap"
        role="group"
        aria-label={__t("diff.comparisonLabel") || "Revision comparison"}
      >
        <div className="diff-side">
          <div className="diff-head">
            <span className="ver">
              {__t("diff.versionA") || "A"} · {a.ver}
            </span>
            <span className="date">
              {a.date} · {a.author}
            </span>
          </div>
          {changes.map((c) => {
            if (c.side === "b")
              return (
                <div
                  key={c.pn + "-b"}
                  className="diff-row"
                  aria-hidden="true"
                  style={{ visibility: "hidden" }}
                >
                  —
                </div>
              );
            const cls =
              c.kind === "removed"
                ? "removed"
                : c.kind === "changed"
                  ? "changed"
                  : c.kind === "unchanged"
                    ? "unchanged"
                    : "";
            return (
              <div key={c.pn + "-a"} className={"diff-row " + cls}>
                <span
                  className="tag"
                  style={cls === "unchanged" ? { opacity: 0.5 } : {}}
                >
                  {c.kind === "removed"
                    ? __t("diff.removedTag") || "REMOVED"
                    : c.kind === "changed"
                      ? __t("diff.was") || "WAS"
                      : c.kind.toUpperCase()}
                </span>
                <div>
                  <div className="fw-600">{c.pn}</div>
                  <div className="fs-10 fg-3 mt-2">{c.desc}</div>
                </div>
                <span />
              </div>
            );
          })}
        </div>
        <div className="diff-side">
          <div className="diff-head">
            <span className="ver fg-accent">
              {__t("diff.versionB") || "B"} · {b.ver}
            </span>
            <span className="date">
              {b.date} · {b.author}
            </span>
          </div>
          {changes.map((c) => {
            if (c.side === "a")
              return (
                <div
                  key={c.pn + "-a"}
                  className="diff-row"
                  aria-hidden="true"
                  style={{ visibility: "hidden" }}
                >
                  —
                </div>
              );
            const cls =
              c.kind === "added"
                ? "added"
                : c.kind === "changed"
                  ? "changed"
                  : c.kind === "unchanged"
                    ? "unchanged"
                    : "";
            return (
              <div key={c.pn + "-b"} className={"diff-row " + cls}>
                <span
                  className="tag"
                  style={cls === "unchanged" ? { opacity: 0.5 } : {}}
                >
                  {c.kind === "added"
                    ? __t("diff.addedTag") || "ADDED"
                    : c.kind === "changed"
                      ? __t("diff.now") || "NOW"
                      : c.kind.toUpperCase()}
                </span>
                <div>
                  <div className="fw-600">{c.pn}</div>
                  <div className="fs-10 fg-3 mt-2">{c.desc}</div>
                </div>
                <span />
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
DiffScreen.propTypes = {
  data: PropTypes.object,
  openModal: PropTypes.func,
};
