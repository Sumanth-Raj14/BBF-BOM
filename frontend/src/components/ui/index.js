// UI primitives — single token-only layer every screen should consume.
// Namespaced .ui-* CSS (additive, no !important) lives in ./ui.css.
import "./ui.css";

export { Button } from "./Button.jsx";
export { Field, Input, Textarea, Select } from "./Field.jsx";
export { Checkbox, Radio, Switch } from "./Choice.jsx";
export { Card } from "./Card.jsx";
export { DataTable } from "./DataTable.jsx";
export { Badge, StatusPill, STATUS_TONES, toneForStatus } from "./Badge.jsx";
export { Tabs, TabPanel } from "./Tabs.jsx";
export { Modal } from "./Modal.jsx";
export { Toaster, toast } from "./Toast.jsx";
export { Tooltip } from "./Tooltip.jsx";
export { Menu } from "./Menu.jsx";
export { Breadcrumb, Pagination } from "./Navigation.jsx";
export { Spinner, Skeleton, EmptyState } from "./Feedback.jsx";
export { ScreenHeader, ContentFrame } from "./ScreenHeader.jsx";

import { Button } from "./Button.jsx";
import { Field, Input, Textarea, Select } from "./Field.jsx";
import { Checkbox, Radio, Switch } from "./Choice.jsx";
import { Card } from "./Card.jsx";
import { DataTable } from "./DataTable.jsx";
import { Badge, StatusPill, STATUS_TONES, toneForStatus } from "./Badge.jsx";
import { Tabs, TabPanel } from "./Tabs.jsx";
import { Modal } from "./Modal.jsx";
import { Toaster, toast } from "./Toast.jsx";
import { Tooltip } from "./Tooltip.jsx";
import { Menu } from "./Menu.jsx";
import { Breadcrumb, Pagination } from "./Navigation.jsx";
import { Spinner, Skeleton, EmptyState } from "./Feedback.jsx";
import { ScreenHeader, ContentFrame } from "./ScreenHeader.jsx";

// Bridge for the legacy window.* screens (root/*.jsx) that don't yet use ES
// imports. Namespaced under window.UI so it never clobbers existing globals
// (e.g. the legacy window.EmptyState / window.Modal).
export const UI = {
  Button,
  Field,
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  Switch,
  Card,
  DataTable,
  Badge,
  StatusPill,
  STATUS_TONES,
  toneForStatus,
  Tabs,
  TabPanel,
  Modal,
  Toaster,
  toast,
  Tooltip,
  Menu,
  Breadcrumb,
  Pagination,
  Spinner,
  Skeleton,
  EmptyState,
  ScreenHeader,
  ContentFrame,
};

if (typeof window !== "undefined") {
  window.UI = UI;
}
