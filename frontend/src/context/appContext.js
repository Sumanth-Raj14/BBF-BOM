import React from "react";

/**
 * THE single app context object.
 *
 * A leaf module (imports nothing but React) so both context/AppCtx.jsx, which
 * provides it, and root/overlays.jsx, whose useAppStore consumes it, can share
 * one object without the cycle AppCtx.jsx -> globals.js -> overlays.jsx.
 *
 * There used to be two createContext calls, and only one was ever provided, so
 * useAppStore() returned null app-wide and ~40 `ctx?.foo` reads were dead.
 */
export const AppContext = React.createContext(null);

/** Read the app store. Null only outside the provider. */
export const useAppStore = () => React.useContext(AppContext);
