import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

window.React = React;

vi.mock("../../../../api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual };
});

import { ECRScreen } from "../ECRScreen.jsx";

beforeEach(() => {
  localStorage.clear();
});

describe("debug", () => {
  it("shows initial state", () => {
    render(<ECRScreen />);
    screen.debug(undefined, 30000);
  });
});
