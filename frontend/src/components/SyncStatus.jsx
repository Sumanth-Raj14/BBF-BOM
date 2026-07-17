import React from "react";
import { AppContext } from "../context/AppCtx.jsx";

export default function SyncStatus() {
  const ctx = React.useContext(AppContext);
  const { syncStatus, apiConnected } = ctx;

  if (!apiConnected) return null;

  if (syncStatus.syncing) {
    return (
      <span
        className="fs-9 ml-6 fw-500 fg-accent"
        title="Syncing data to server..."
      >
        <span
          className="inline-block"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent)",
            marginRight: 4,
            animation: "pulse 1s ease-in-out infinite",
          }}
        />
        SYNC
      </span>
    );
  }

  if (syncStatus.pendingCount > 0) {
    return (
      <span
        className="fs-9 ml-6 fw-500"
        title={`${syncStatus.pendingCount} pending changes to sync`}
        style={{ color: "var(--amber, #eab308)" }}
      >
        <span
          className="inline-block"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--amber, #eab308)",
            marginRight: 4,
          }}
        />
        {syncStatus.pendingCount} PENDING
      </span>
    );
  }

  if (syncStatus.lastSync) {
    const ago = Math.floor((Date.now() - syncStatus.lastSync) / 60000);
    return (
      <span
        className="fs-9 ml-6 fw-500 fg-3"
        title={`Last synced ${ago > 0 ? ago + "m ago" : "just now"}`}
        style={{ color: "var(--green, #10b981)" }}
      >
        <span
          className="inline-block"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--green, #10b981)",
            marginRight: 4,
          }}
        />
        SAVED
      </span>
    );
  }

  return null;
}
