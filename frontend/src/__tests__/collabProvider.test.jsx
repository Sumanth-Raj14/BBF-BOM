import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// ?raw is Vite's own source-as-string import. node:fs can't be used here --
// under jsdom import.meta.url is an http URL, not a file path.
import bomEditorSource from "../root/bom-editor.jsx?raw";
import { CollabProvider, CollaborationBar } from "../root/collaboration.jsx";

/**
 * Regression test for the "real-time collaboration shows offline" gap.
 *
 * The WebSocket backend (main.py, WS /ws/{channel}) was complete, and
 * bom-editor.jsx rendered <CollaborationBar> -- but never wrapped it in a
 * <CollabProvider>. useCollab() falls back to a no-op {connected:false,
 * users:[]} when there is no CollabContext above it, so the presence bar
 * reported "offline" forever and no socket was ever opened.
 *
 * That failure is silent: the bar renders, it just renders a lie. So the test
 * asserts on the thing that actually differs -- whether mounting the bar opens
 * a WebSocket at all.
 */

class FakeWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CollabProvider wiring", () => {
  it("opens a WebSocket for the channel when the bar is inside a provider", () => {
    render(
      <CollabProvider channel="bom-editor">
        <CollaborationBar channel="bom-editor" />
      </CollabProvider>,
    );

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain("bom-editor");
  });

  it("opens NO socket when the bar is rendered without a provider", () => {
    // This is exactly what bom-editor.jsx used to do. If someone removes the
    // provider again, the test above goes red and this one keeps passing --
    // which is the signal that the bar has gone back to rendering a no-op.
    render(<CollaborationBar channel="bom-editor" />);

    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("bom-editor.jsx actually mounts the provider around the bar", () => {
    // The tests above prove the provider works. This one proves it is USED --
    // the bug was never in collaboration.jsx, it was that bom-editor rendered
    // the bar outside any provider. Rendering BomEditor here would need most
    // of the app's context, so assert on the wiring in the source instead.
    const src = bomEditorSource;
    const open = src.indexOf("<CollabProvider");
    const bar = src.indexOf("<CollaborationBar");
    const close = src.indexOf("</CollabProvider>");

    expect(open, "bom-editor must render a <CollabProvider>").toBeGreaterThan(
      -1,
    );
    expect(bar, "bom-editor must render a <CollaborationBar>").toBeGreaterThan(
      -1,
    );
    expect(
      open < bar && bar < close,
      "<CollaborationBar> must be INSIDE <CollabProvider> or it renders a no-op",
    ).toBe(true);
  });

  it("targets the channel it is given, not a hardcoded default", () => {
    render(
      <CollabProvider channel="bom-42">
        <CollaborationBar channel="bom-42" />
      </CollabProvider>,
    );

    expect(FakeWebSocket.instances[0].url).toContain("bom-42");
  });
});
