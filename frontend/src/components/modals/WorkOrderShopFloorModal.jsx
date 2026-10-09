import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Badge, Button, EmptyState, Input, Modal, Spinner, StatusPill } from "../ui";

// Shop-floor execution for one work order: status transitions, per-operation
// start/complete, and material issue.
//
// Why: /work-orders/{id}/action, .../operations/{op}/start|complete and
// .../materials/{mat}/issue all existed with no client wrapper and no UI, so a
// work order could be created but never actually RUN from the application —
// no operation could be started or completed, and no material issued.
//
// Everything here reads from GET /work-orders/{id}, which returns
// `operations[]` and `materials[]` inline. That endpoint caches for 300s;
// until this change nothing invalidated it, so a refetch after an action
// returned the pre-action snapshot (fixed in work_order_service).

const ACTION_LABELS = {
  release: "Release",
  start: "Start",
  complete: "Complete",
  close: "Close",
  hold: "Hold",
  scrap: "Scrap",
};

export default function WorkOrderShopFloorModal({ open, workOrderId, onClose }) {
  const [state, setState] = React.useState({ loading: true, wo: null, error: null });
  const [busy, setBusy] = React.useState(false);
  // Per-operation and per-material input, keyed by row id.
  const [opInput, setOpInput] = React.useState({});
  const [matInput, setMatInput] = React.useState({});

  const load = React.useCallback(async () => {
    if (workOrderId == null) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const wo = await api.workOrders.get(workOrderId);
      setState({ loading: false, wo, error: null });
    } catch (e) {
      setState({ loading: false, wo: null, error: e?.message || String(e) });
    }
  }, [workOrderId]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;
  const { loading, wo, error } = state;

  const fail = (e, what) => toast(`${what}: ${e?.message || String(e)}`, { kind: "error" });

  // Every mutation refetches. The detail payload is the only source of the
  // operation/material state, so updating local state optimistically would be
  // inventing a result the server has not confirmed.
  async function run(fn, successMsg, failMsg) {
    setBusy(true);
    try {
      await fn();
      await load();
      toast(successMsg, { kind: "success" });
    } catch (e) {
      fail(e, failMsg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        wo
          ? `${__t("power.workOrders.shopFloor") || "Shop floor"} · ${wo.wo_number || wo.id}`
          : __t("power.workOrders.shopFloor") || "Shop floor"
      }
      subtitle={wo ? `${wo.quantity_completed ?? 0} / ${wo.quantity_ordered ?? 0}` : ""}
      closeLabel={__t("common.close") || "Close"}
    >
      {loading && <Spinner label={__t("common.loading") || "Loading…"} />}
      {!loading && error && (
        <p className="fs-12 fg-3">
          {__t("common.loadFailed") || "Load failed"}: {error}
        </p>
      )}

      {!loading && !error && wo && (
        <>
          <div className="flex items-center gap-8" style={{ marginBottom: 14 }}>
            <StatusPill status={wo.status} label={wo.status} />
            {busy && <Spinner />}
          </div>

          {/* ---- status transitions ---- */}
          <h4 className="m-0 fs-12 fw-600">
            {__t("power.workOrders.transition") || "Change status"}
          </h4>
          <div className="flex items-center gap-8" style={{ flexWrap: "wrap", marginTop: 8 }}>
            {(api.workOrderOps?.ACTIONS || []).map((a) => (
              <Button
                key={a}
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.workOrderOps.action(wo.id, a),
                    `${ACTION_LABELS[a] || a} → ${__t("common.saved") || "saved"}`,
                    __t("power.workOrders.actionFailed") || "Action rejected",
                  )
                }
              >
                {__t(`power.workOrders.action.${a}`) || ACTION_LABELS[a] || a}
              </Button>
            ))}
          </div>
          <p className="fs-11 fg-3" style={{ margin: "6px 0 0" }}>
            {__t("power.workOrders.transitionHint") ||
              "The server decides whether a transition is allowed and reports the reason if it is not."}
          </p>

          {/* ---- operations ---- */}
          <h4 className="m-0 fs-12 fw-600" style={{ marginTop: 20 }}>
            {__t("power.workOrders.operations") || "Operations"}
          </h4>
          {(wo.operations || []).length === 0 ? (
            <EmptyState message={__t("power.workOrders.noOps") || "No operations on this work order."} />
          ) : (
            <div style={{ marginTop: 8 }}>
              {wo.operations.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center gap-8 bg-sunk rounded-r2"
                  style={{ padding: 10, marginBottom: 8, flexWrap: "wrap" }}
                >
                  <span className="font-mono fs-11">{op.operation_number}</span>
                  <span className="flex-1 fs-12">{op.operation_name}</span>
                  {op.work_center && <Badge tone="neutral">{op.work_center}</Badge>}
                  <StatusPill status={op.status} label={op.status} />

                  {op.status !== "in_progress" && op.status !== "completed" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api.workOrderOps.startOperation(wo.id, op.id),
                          __t("power.workOrders.opStarted") || "Operation started",
                          __t("power.workOrders.opStartFailed") || "Could not start operation",
                        )
                      }
                    >
                      {__t("common.start") || "Start"}
                    </Button>
                  )}

                  {op.status === "in_progress" && (
                    <>
                      <Input
                        mono
                        inputMode="numeric"
                        placeholder={__t("power.workOrders.good") || "Good"}
                        aria-label={`${__t("power.workOrders.good") || "Good"} ${op.operation_number}`}
                        style={{ width: 72 }}
                        value={opInput[op.id]?.good ?? ""}
                        onChange={(e) =>
                          setOpInput({
                            ...opInput,
                            [op.id]: { ...opInput[op.id], good: e.target.value },
                          })
                        }
                      />
                      <Input
                        mono
                        inputMode="numeric"
                        placeholder={__t("power.workOrders.scrap") || "Scrap"}
                        aria-label={`${__t("power.workOrders.scrap") || "Scrap"} ${op.operation_number}`}
                        style={{ width: 72 }}
                        value={opInput[op.id]?.scrap ?? ""}
                        onChange={(e) =>
                          setOpInput({
                            ...opInput,
                            [op.id]: { ...opInput[op.id], scrap: e.target.value },
                          })
                        }
                      />
                      <Button
                        size="sm"
                        // quantity_good is REQUIRED by the endpoint; without it
                        // the call 422s, so the button stays disabled until it
                        // is supplied rather than failing after the click.
                        disabled={busy || !opInput[op.id]?.good}
                        onClick={() =>
                          run(
                            () =>
                              api.workOrderOps.completeOperation(
                                wo.id,
                                op.id,
                                Number(opInput[op.id].good),
                                Number(opInput[op.id]?.scrap || 0),
                              ),
                            __t("power.workOrders.opCompleted") || "Operation completed",
                            __t("power.workOrders.opCompleteFailed") ||
                              "Could not complete operation",
                          )
                        }
                      >
                        {__t("common.complete") || "Complete"}
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ---- materials ---- */}
          <h4 className="m-0 fs-12 fw-600" style={{ marginTop: 20 }}>
            {__t("power.workOrders.materials") || "Materials"}
          </h4>
          {(wo.materials || []).length === 0 ? (
            <EmptyState message={__t("power.workOrders.noMaterials") || "No materials on this work order."} />
          ) : (
            <div style={{ marginTop: 8 }}>
              {wo.materials.map((mat) => {
                const outstanding =
                  (mat.quantity_required || 0) - (mat.quantity_issued || 0);
                return (
                  <div
                    key={mat.id}
                    className="flex items-center gap-8 bg-sunk rounded-r2"
                    style={{ padding: 10, marginBottom: 8, flexWrap: "wrap" }}
                  >
                    <span className="font-mono fs-11 flex-1">
                      {mat.part_number || `part ${mat.part_id}`}
                    </span>
                    <span className="font-mono fs-11 fg-3">
                      {mat.quantity_issued || 0} / {mat.quantity_required || 0} {mat.unit || ""}
                    </span>
                    {mat.issue_status && <Badge tone="neutral">{mat.issue_status}</Badge>}
                    <Input
                      mono
                      inputMode="decimal"
                      placeholder={__t("power.workOrders.issueQty") || "Qty"}
                      aria-label={`${__t("power.workOrders.issueQty") || "Issue quantity"} ${mat.part_number || mat.id}`}
                      style={{ width: 80 }}
                      value={matInput[mat.id]?.qty ?? ""}
                      onChange={(e) =>
                        setMatInput({
                          ...matInput,
                          [mat.id]: { ...matInput[mat.id], qty: e.target.value },
                        })
                      }
                    />
                    <Input
                      placeholder={__t("power.workOrders.lot") || "Lot"}
                      aria-label={`${__t("power.workOrders.lot") || "Lot"} ${mat.part_number || mat.id}`}
                      style={{ width: 96 }}
                      value={matInput[mat.id]?.lot ?? ""}
                      onChange={(e) =>
                        setMatInput({
                          ...matInput,
                          [mat.id]: { ...matInput[mat.id], lot: e.target.value },
                        })
                      }
                    />
                    <Button
                      size="sm"
                      disabled={busy || !matInput[mat.id]?.qty}
                      onClick={() =>
                        run(
                          () =>
                            api.workOrderOps.issueMaterial(
                              wo.id,
                              mat.id,
                              Number(matInput[mat.id].qty),
                              matInput[mat.id]?.lot,
                            ),
                          __t("power.workOrders.issued") || "Material issued",
                          __t("power.workOrders.issueFailed") || "Could not issue material",
                        )
                      }
                    >
                      {__t("power.workOrders.issue") || "Issue"}
                    </Button>
                    {outstanding > 0 && (
                      <span className="fs-11 fg-3">
                        {outstanding} {__t("power.workOrders.outstanding") || "outstanding"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

WorkOrderShopFloorModal.propTypes = {
  open: PropTypes.bool,
  workOrderId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onClose: PropTypes.func,
};
