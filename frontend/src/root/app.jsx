import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "../screens/App.jsx";
import {
  downloadCSV,
  downloadJSON,
  generateXLSX,
  downloadBlob,
  printBOM,
} from "../utils/download.js";
import { ErrorBoundary } from "../globals";

const root = createRoot(document.getElementById("root"));
root.render(
  React.createElement(
    BrowserRouter,
    null,
    React.createElement(
      ErrorBoundary || React.Fragment,
      null,
      React.createElement(App, null),
    ),
  ),
);

export { downloadCSV, downloadJSON, generateXLSX, downloadBlob, printBOM };
