import React from "react";
import { AppContext } from "../context/AppCtx.jsx";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  BulkVendorImportModal,
  CommandPalette,
  EmailParseModal,
  LandedCostModal,
  MarginModal,
  NetworkBadge,
  NotifPrefsModal,
  PricingModal,
  ProductTour,
  RoadmapModal,
  ScheduledReportsModal,
  ShareLinkModal,
  TenantSettingsModal,
  WebhooksModal,
} from "../globals";
export default function ModalsHost() {
  const ctx = React.useContext(AppContext);
  const {
    modal,
    setModal,
    closeModal,
    modalContext,
    modalCtxRef,
    project,
    setProject,
    notifications,
    setNotifications,
    approvals,
    setApprovals,
    setSavedViews,
    showAI,
    setShowAI,
    showTour,
    setShowTour,
  } = ctx;

  return (
    <>
      <window.NewPOModal
        open={modal === "new-po"}
        onClose={() => setModal(null)}
      />
      <window.NewVendorModal
        open={modal === "new-vendor"}
        onClose={() => setModal(null)}
      />
      <window.UploadModal
        open={modal === "upload"}
        onClose={() => setModal(null)}
        files={modalContext?.files}
      />
      <window.CADImportModal
        open={modal === "upload-cad"}
        onClose={closeModal}
      />
      <window.NewPartModal
        open={modal === "new-part"}
        onClose={() => setModal(null)}
      />
      <window.FindAlternatesModal
        open={modal === "find-alternates"}
        onClose={closeModal}
        row={modalContext}
      />
      <window.SendRFQModal
        open={modal === "send-rfq"}
        onClose={closeModal}
        row={modalContext}
      />
      <window.DocPreviewModal
        open={modal === "doc-preview"}
        onClose={closeModal}
        doc={modalContext}
      />
      <window.PODetailModal
        open={modal === "po-detail"}
        onClose={closeModal}
        item={modalContext}
      />
      <window.VendorDetailModal
        open={modal === "vendor-detail"}
        onClose={closeModal}
        vendor={modalContext}
      />
      <window.BarcodeScanModal
        open={modal === "barcode-scan"}
        onClose={closeModal}
        onFound={modalContext?.onFound}
      />
      <window.GlobalSearchModal
        open={modal === "global-search"}
        onClose={closeModal}
      />
      <window.ProfileModal open={modal === "profile"} onClose={closeModal} />
      <window.SettingsModal open={modal === "settings"} onClose={closeModal} />
      <window.HelpModal open={modal === "help"} onClose={closeModal} />
      <TenantSettingsModal
        open={modal === "tenant-settings"}
        onClose={closeModal}
      />
      <window.ImportRFQsModal
        open={modal === "import-rfqs"}
        onClose={closeModal}
      />
      <window.QuoteHistoryModal
        open={modal === "quote-history"}
        onClose={closeModal}
        vendor={modalContext}
      />
      <window.AutoScrapeModal
        open={modal === "auto-scrape"}
        onClose={closeModal}
        row={modalContext}
      />
      <window.ChangeOwnerModal
        open={modal === "change-owner"}
        onClose={closeModal}
        row={modalContext}
      />
      <window.AuditLogModal open={modal === "audit-log"} onClose={closeModal} />
      <window.APIKeysModal open={modal === "api-keys"} onClose={closeModal} />
      <window.BulkImportModal
        open={modal === "bulk-import"}
        onClose={closeModal}
      />
      <BulkVendorImportModal
        open={modal === "bulk-vendor-import"}
        onClose={closeModal}
      />
      <PricingModal open={modal === "pricing"} onClose={closeModal} />
      <RoadmapModal open={modal === "roadmap"} onClose={closeModal} />
      <NotifPrefsModal open={modal === "notif-prefs"} onClose={closeModal} />
      <window.RFQCompareModal
        open={modal === "rfq-compare"}
        onClose={closeModal}
      />
      <window.CostSimulatorModal
        open={modal === "cost-sim"}
        onClose={closeModal}
      />
      <LandedCostModal open={modal === "landed-cost"} onClose={closeModal} />
      <MarginModal open={modal === "margin"} onClose={closeModal} />
      <ShareLinkModal open={modal === "share-link"} onClose={closeModal} />
      <WebhooksModal open={modal === "webhooks"} onClose={closeModal} />
      <ScheduledReportsModal
        open={modal === "scheduled-reports"}
        onClose={closeModal}
      />
      <EmailParseModal open={modal === "email-parse"} onClose={closeModal} />
      <CommandPalette open={modal === "command-palette"} onClose={closeModal} />
      <window.BOMTemplatesModal
        open={modal === "bom-templates"}
        onClose={closeModal}
      />
      <window.BOMDuplicationModal
        open={modal === "bom-duplication"}
        onClose={closeModal}
      />
      <window.RollbackModal open={modal === "rollback"} onClose={closeModal} />
      <window.ProcurementAlertsModal
        open={modal === "procurement-alerts"}
        onClose={closeModal}
      />
      <window.PriceAlertsModal
        open={modal === "price-alerts"}
        onClose={closeModal}
      />
      <window.InflationAnalysisModal
        open={modal === "inflation"}
        onClose={closeModal}
      />
      <window.InternetScrapeModal
        open={modal === "scraping"}
        onClose={closeModal}
      />
      <window.CADRevisionsModal
        open={modal === "cad-revisions"}
        onClose={closeModal}
        file={modalContext}
      />
      <window.CADWhereUsedModal
        open={modal === "cad-where-used"}
        onClose={closeModal}
        file={modalContext}
      />
      <window.CADMarkupModal
        open={modal === "cad-markup"}
        onClose={closeModal}
        file={modalContext}
      />
      <window.CADAttrsModal
        open={modal === "cad-attrs"}
        onClose={closeModal}
        file={modalContext}
      />
      <window.CADSyncModal open={modal === "cad-sync"} onClose={closeModal} />
      <window.DrawingReleaseModal
        open={modal === "drawing-release"}
        onClose={closeModal}
      />
      <window.AIAssistant open={showAI} onClose={() => setShowAI(false)} />
      <window.OnboardingChecklist />
      {showTour && <ProductTour onClose={() => setShowTour(false)} />}
      <NetworkBadge />
      <window.BulkEditModal
        open={modal === "bulk-edit"}
        onClose={closeModal}
        count={modalContext?.count || 0}
        onApply={(patch) => {
          modalCtxRef.current?.onApply?.(patch);
        }}
      />
      <window.SaveViewModal
        open={modal === "save-view"}
        onClose={closeModal}
        filters={modalContext?.filters}
        onSave={(name) => {
          const id = "sv-" + Date.now();
          setSavedViews((prev) => [
            ...prev,
            { id, name, filters: modalCtxRef.current?.filters },
          ]);
        }}
      />
      <window.ConfirmModal
        open={modal === "release"}
        onClose={() => setModal(null)}
        title={__t("bomShell.releaseConfirmTitle", {
          version: (() => {
            const [maj, min] = project.version.replace(/^v/, "").split(".");
            return "v" + maj + "." + (parseInt(min) + 1) + ".0";
          })(),
        })}
        body={
          <>
            This will lock the next revision and create an immutable snapshot.
            The changelog will be sent to engineering, procurement, and finance.
            You can still create the following revision afterwards.
          </>
        }
        confirmLabel={__t("bomShell.releaseConfirmLabel")}
        onConfirm={() => {
          const [maj, min] = project.version.replace(/^v/, "").split(".");
          const newVer = "v" + maj + "." + (parseInt(min) + 1) + ".0";
          const newRev = String.fromCharCode(project.rev.charCodeAt(0) + 1);
          setProject({
            ...project,
            version: newVer,
            rev: newRev,
            updated: "2026-05-25",
          });
          setNotifications([
            {
              id: Date.now(),
              who: "System",
              init: "\u232C",
              color: "sys",
              action: "released BOM",
              obj: newVer,
              time: "just now",
              read: false,
              route: "bom",
            },
            ...notifications,
          ]);
          toast(__t("bomShell.releaseConfirmLabel") + " " + newVer, {
            kind: "success",
          });
        }}
      />
      <window.ConfirmModal
        open={modal === "approve-b"}
        onClose={() => setModal(null)}
        title={__t("bomShell.approveConfirmTitle")}
        body={
          <>
            You're approving <b>{project.version}</b> as the current revision.
            The previous revision will move to history.
          </>
        }
        confirmLabel={__t("bomShell.approveConfirmLabel")}
        onConfirm={() => {
          const next = { ...approvals };
          Object.keys(next).forEach((k) => {
            next[k] = {
              engineering: "approved",
              procurement: "approved",
              finance: "approved",
            };
          });
          setApprovals(next);
          setNotifications([
            {
              id: Date.now(),
              who: "E. Chen",
              init: "EC",
              color: "",
              action: "approved",
              obj: project.version,
              time: "just now",
              read: false,
              route: "bom",
            },
            ...notifications,
          ]);
          toast(__t("bomShell.approveConfirmLabel") + " " + project.version, {
            kind: "success",
            action: {
              label: __t("common.search"),
              onClick: () => window.__nav("bom"),
            },
          });
        }}
      />
    </>
  );
}
