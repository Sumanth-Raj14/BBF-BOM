/* global WebSocket */
import React from "react";
import PropTypes from "prop-types";
import { toast } from "../utils/toast";
import config from "../config.js";
export const CollabContext = React.createContext(null);
export function CollabProvider({ channel, children, onPresence, onDocUpdate }) {
  const wsRef = React.useRef(null);
  const [connected, setConnected] = React.useState(null);
  const [users, setUsers] = React.useState([]);
  const [cursors, setCursors] = React.useState({});
  const [typing, setTyping] = React.useState({});
  const [locks, setLocks] = React.useState({});
  const [userId] = React.useState(null);
  const reconnectTimer = React.useRef(null);
  const handlersRef = React.useRef({ onPresence, onDocUpdate });
  React.useEffect(() => {
    handlersRef.current = { onPresence, onDocUpdate };
  }, [onPresence, onDocUpdate]);
  const connect = React.useCallback(() => {
    // Same-origin WS_BASE from config.js (derived from window.location by
    // default — see config.js) so this always targets whatever reverse
    // proxy served the page, matching frontend/nginx.conf's /ws/ route.
    const wsBase = config.WS_BASE;
    const url = wsBase + "/" + encodeURIComponent(channel || "bom-editor");
    const ws = new WebSocket(url);
    ws.onopen = () => {
      setConnected(true);
      clearTimeout(reconnectTimer.current);
    };
    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch (_) {
        return;
      }
      switch (msg.type) {
        case "presence":
          setUsers(msg.users || []);
          if (handlersRef.current.onPresence)
            handlersRef.current.onPresence(msg);
          break;
        case "cursor":
          setCursors((prev) => {
            const next = { ...prev };
            if (msg.position)
              next[msg.user_id] = {
                position: msg.position,
                selection: msg.selection,
              };
            else delete next[msg.user_id];
            return next;
          });
          break;
        case "typing":
          setTyping((prev) => {
            const next = { ...prev };
            next[msg.user_id] = msg.is_typing;
            return next;
          });
          break;
        case "lock":
          setLocks((prev) => {
            const next = { ...prev };
            if (msg.action === "acquired") next[msg.document_id] = msg.user_id;
            else delete next[msg.document_id];
            return next;
          });
          break;
        case "doc_update":
          if (handlersRef.current.onDocUpdate)
            handlersRef.current.onDocUpdate(msg);
          break;
        case "lock_error":
          toast(msg.message || "Document is locked", { kind: "warn" });
          break;
      }
    };
    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [channel]);
  React.useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);
  const send = React.useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);
  const broadcast = React.useCallback(
    (type, data) => send({ type, ...data }),
    [send],
  );
  const acquireLock = React.useCallback(
    (docId) => send({ type: "lock", document_id: docId, action: "acquire" }),
    [send],
  );
  const releaseLock = React.useCallback(
    (docId) => send({ type: "lock", document_id: docId, action: "release" }),
    [send],
  );
  const sendCursor = React.useCallback(
    (pos) => send({ type: "cursor", position: pos }),
    [send],
  );
  const sendTyping = React.useCallback(
    (isTyping) => send({ type: "typing", is_typing: isTyping }),
    [send],
  );
  const sendDocUpdate = React.useCallback(
    (docId, patch, version) =>
      send({ type: "doc_update", document_id: docId, patch, version }),
    [send],
  );
  const ctxVal = {
    connected,
    users,
    cursors,
    typing,
    locks,
    userId,
    send,
    broadcast,
    acquireLock,
    releaseLock,
    sendCursor,
    sendTyping,
    sendDocUpdate,
  };
  return React.createElement(
    CollabContext.Provider,
    { value: ctxVal },
    children,
  );
}
CollabProvider.propTypes = {
  channel: PropTypes.string,
  children: PropTypes.node,
  onPresence: PropTypes.func,
  onDocUpdate: PropTypes.func,
};
export function useCollab() {
  const ctx = React.useContext(CollabContext);
  return (
    ctx || {
      connected: false,
      users: [],
      cursors: {},
      typing: {},
      locks: {},
      userId: null,
      send: () => {},
      broadcast: () => {},
      acquireLock: () => {},
      releaseLock: () => {},
      sendCursor: () => {},
      sendTyping: () => {},
      sendDocUpdate: () => {},
    }
  );
}
const COLLAB_COLORS = [
  "#ba4816",
  "#1a7f5a",
  "#2b6cb0",
  "#9b2c6e",
  "#c05621",
  "#276749",
  "#6b46c1",
  "#b83209",
];
function getColorForUser(uid) {
  return COLLAB_COLORS[Math.abs(uid || 0) % COLLAB_COLORS.length];
}
export function PresenceAvatar({ userId, active, size }) {
  const color = getColorForUser(userId);
  const initial = String.fromCharCode(65 + (Math.abs(userId || 0) % 26));
  return React.createElement(
    "span",
    {
      className: "collab-avatar",
      style: {
        background: color,
        width: size || 22,
        height: size || 22,
        fontSize: (size || 22) * 0.45,
        opacity: active === false ? 0.4 : 1,
      },
      title: "User " + userId,
    },
    initial,
  );
}
PresenceAvatar.propTypes = {
  userId: PropTypes.number,
  active: PropTypes.bool,
  size: PropTypes.number,
};
export function CollaborationBar({ channel, docId, onDocUpdate }) {
  const { connected, users, typing, locks, acquireLock, releaseLock } =
    useCollab();
  const isLocked = docId && locks[docId] != null;
  const typingUsers = Object.keys(typing).filter((k) => typing[k]);
  return React.createElement(
    "div",
    {
      className: "collab-bar",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 12px",
        borderBottom: "1px solid var(--line)",
        background: "var(--bg-sunk)",
        fontSize: 12,
        minHeight: 30,
      },
    },
    React.createElement("span", {
      className: "collab-status",
      style: {
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: connected ? "var(--ok)" : "var(--fg-4)",
        display: "inline-block",
      },
      title: connected ? "Connected" : "Disconnected",
    }),
    React.createElement(
      "span",
      { className: "fg-3 fs-10", style: { marginRight: 4 } },
      connected ? users.length + " online" : "offline",
    ),
    React.createElement(
      "span",
      { className: "collab-avatars", style: { display: "flex", gap: 2 } },
      users
        .slice(0, 6)
        .map((uid) =>
          React.createElement(PresenceAvatar, {
            key: uid,
            userId: uid,
            size: 20,
          }),
        ),
      users.length > 6
        ? React.createElement(
            "span",
            { className: "fg-3 fs-10", style: { marginLeft: 2 } },
            "+" + (users.length - 6),
          )
        : null,
    ),
    typingUsers.length > 0
      ? React.createElement(
          "span",
          { className: "fg-accent fs-10", style: { fontStyle: "italic" } },
          typingUsers.length + " typing...",
        )
      : null,
    React.createElement("span", { className: "flex-1" }),
    docId
      ? React.createElement(
          "button",
          {
            className: "btn small",
            onClick: () => (isLocked ? releaseLock(docId) : acquireLock(docId)),
            style: {
              fontSize: 10,
              padding: "2px 8px",
              color: isLocked ? "var(--warn)" : "var(--fg-2)",
            },
            title: isLocked
              ? "Release document lock"
              : "Lock document for editing",
          },
          isLocked ? "\uD83D\uDD12 Locked" : "\uD83D\uDD13 Lock",
        )
      : null,
  );
}
CollaborationBar.propTypes = {
  channel: PropTypes.string,
  docId: PropTypes.string,
  onDocUpdate: PropTypes.func,
};
export function CursorOverlay({ containerRef }) {
  const { cursors } = useCollab();
  if (!containerRef || !cursors || !Object.keys(cursors).length) return null;
  return React.createElement(
    "div",
    {
      className: "collab-cursors",
      style: {
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
      },
    },
    Object.keys(cursors).map((uid) => {
      const c = cursors[uid];
      if (!c || !c.position) return null;
      const color = getColorForUser(parseInt(uid));
      return React.createElement(
        "div",
        {
          key: uid,
          className: "collab-cursor",
          style: {
            position: "absolute",
            left: c.position.x + "px",
            top: c.position.y + "px",
            transition: "left 0.1s, top 0.1s",
          },
          title: "User " + uid,
        },
        React.createElement("div", {
          style: {
            width: 2,
            height: 18,
            background: color,
            position: "absolute",
            top: 0,
            left: 0,
          },
        }),
        React.createElement(
          "span",
          {
            style: {
              background: color,
              color: "#fff",
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 3,
              marginTop: 18,
              whiteSpace: "nowrap",
            },
          },
          "User " + uid,
        ),
      );
    }),
  );
}
CursorOverlay.propTypes = { containerRef: PropTypes.any };
window.CollabProvider = CollabProvider;
window.useCollab = useCollab;
window.CollaborationBar = CollaborationBar;
window.CursorOverlay = CursorOverlay;
window.PresenceAvatar = PresenceAvatar;
window.CollabContext = CollabContext;
