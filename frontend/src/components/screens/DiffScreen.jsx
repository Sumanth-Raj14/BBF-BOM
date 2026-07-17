import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { DropdownButton, api } from "../../globals";
// ============ DIFF ============
export default function DiffScreen({ data }) {
  const [swapped, setSwapped] = React.useState(false);
  const [versionA, setVersionA] = React.useState("v3.1.4");
  const [bom1Id] = React.useState(1);
  const [bom2Id] = React.useState(2);
  const [apiDiff, setApiDiff] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

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

  const diffsBySource = {
    "v3.1.4": apiDiff || data.diff,
    "v3.1.0": {
      a: { ver: "v3.1.0", date: "2026-03-15", author: "M. Park" },
      b: (apiDiff || data.diff).b,
      changes: [
        {
          kind: "added",
          pn: "EL-PCB-MAIN-R3",
          desc: "Main PCB R3 added (was R2)",
          side: "b",
        },
        {
          kind: "removed",
          pn: "EL-PCB-MAIN-R2",
          desc: "Main PCB R2",
          side: "a",
        },
        {
          kind: "changed",
          pn: "EL-PSU-240W",
          desc: "Cost ₹5,644 → ₹6,972",
          side: "both",
        },
        {
          kind: "added",
          pn: "EL-MEM-DDR4-8G",
          desc: "Memory upgrade DDR3 → DDR4",
          side: "b",
        },
        {
          kind: "added",
          pn: "OPT-LNS-25MM",
          desc: "Lens 25mm f/1.8",
          side: "b",
        },
        { kind: "unchanged", pn: "HW-FAS-M3-08", desc: "Screw, M3×8" },
        {
          kind: "changed",
          pn: "EL-FAN-92",
          desc: "80mm → 92mm fan upgrade",
          side: "both",
        },
      ],
    },
    "v3.0.0": {
      a: { ver: "v3.0.0", date: "2026-01-20", author: "E. Chen" },
      b: (apiDiff || data.diff).b,
      changes: [
        {
          kind: "added",
          pn: "ATL-MFR-CTL",
          desc: "New control subsystem",
          side: "b",
        },
        {
          kind: "removed",
          pn: "ATL-MFR-CTL-OLD",
          desc: "Legacy controller",
          side: "a",
        },
        {
          kind: "changed",
          pn: "ATL-MFR-CHS",
          desc: "Major redesign — 2 plates replaced",
          side: "both",
        },
        { kind: "added", pn: "OPT-LNS-25MM", desc: "Lens added", side: "b" },
        { kind: "added", pn: "EL-CAM-IMX477", desc: "Camera added", side: "b" },
        { kind: "removed", pn: "EL-CAM-OV5640", desc: "Old camera", side: "a" },
      ],
    },
  };
  const baseDiff = diffsBySource[versionA] || apiDiff || data.diff;
  const a = swapped ? baseDiff.b : baseDiff.a;
  const b = swapped ? baseDiff.a : baseDiff.b;
  const flipKind = (k) =>
    swapped ? (k === "added" ? "removed" : k === "removed" ? "added" : k) : k;
  const flipSide = (s) =>
    swapped ? (s === "a" ? "b" : s === "b" ? "a" : s) : s;
  const changes = baseDiff.changes.map((c) => ({
    ...c,
    kind: flipKind(c.kind),
    side: flipSide(c.side),
  }));
  const counts = changes.reduce((acc, c) => {
    acc[c.kind] = (acc[c.kind] || 0) + 1;
    return acc;
  }, {});
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>
            {__t("diff.title") || "Compare Revisions"}{" "}
            {loading && (
              <span className="fs-10 fg-3 ml-8">
                {__t("common.loading") || "Loading\u2026"}
              </span>
            )}
          </h1>
          <div className="sub">
            <span className="fg-ok">
              +{counts.added || 0} {__t("diff.added") || "added"}
            </span>{" "}
            ·{" "}
            <span className="fg-danger">
              \u2212{counts.removed || 0} {__t("diff.removed") || "removed"}
            </span>{" "}
            ·{" "}
            <span className="fg-warn">
              \u21BB{counts.changed || 0} {__t("diff.changed") || "changed"}
            </span>
          </div>
        </div>
        <div className="flex gap-8">
          <DropdownButton
            width={220}
            trigger={
              <button className="btn">
                {a.ver} ↔ {b.ver} <Icon.ChevronDown size={10} />
              </button>
            }
            items={[
              { header: __t("diff.compareWith") || "Compare with\u2026" },
              {
                icon:
                  versionA === "v3.1.4" ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label:
                  "v3.1.4 (" +
                  (__t("diff.prevRelease") || "prev release") +
                  ")",
                onClick: () => setVersionA("v3.1.4"),
              },
              {
                icon:
                  versionA === "v3.1.0" ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label: "v3.1.0",
                onClick: () => setVersionA("v3.1.0"),
              },
              {
                icon:
                  versionA === "v3.0.0" ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label: "v3.0.0 (" + (__t("diff.initial") || "initial") + ")",
                onClick: () => setVersionA("v3.0.0"),
              },
            ]}
          />
          <button className="btn" onClick={() => setSwapped((s) => !s)}>
            <Icon.Diff size={12} /> {__t("diff.swap") || "Swap A\u2194B"}
          </button>
          <button
            className="btn"
            onClick={() =>
              toast(__t("diff.exportedAsPdf") || "Diff exported as PDF", {
                kind: "success",
                action: {
                  label: __t("common.download") || "Download",
                  onClick: () =>
                    toast(
                      __t("diff.downloadedPdf") ||
                        "Downloaded diff_" + a.ver + "_to_" + b.ver + ".pdf",
                    ),
                },
              })
            }
          >
            <Icon.Export size={12} /> {__t("diff.exportDiff") || "Export diff"}
          </button>
          <button
            className="btn primary"
            onClick={() => window.__open_approve_b?.()}
          >
            <Icon.Check size={12} /> {__t("diff.approveB") || "Approve B"}
          </button>
        </div>
      </div>
      <div className="diff-wrap">
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
    </div>
  );
}
DiffScreen.propTypes = {
  data: PropTypes.object,
};
