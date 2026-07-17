interface AuthUser {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
}

interface BOMRowData {
  pn: string;
  name: string;
  rev: string;
  qty: number;
  uom: string;
  category: string;
  vendor: string;
  cost: number;
  lead: number | null;
  origin: string;
  status: string;
  [key: string]: unknown;
}

interface CommentData {
  id: number;
  who: string;
  init: string;
  color: string;
  text: string;
  time: string;
}

interface ApprovalData {
  engineering: string;
  procurement: string;
  finance: string;
}

interface NotificationData {
  id: number;
  who: string;
  init: string;
  color: string;
  action: string;
  obj: string;
  time: string;
  read: boolean;
  route: string;
}

interface SavedView { [key: string]: unknown; }
interface Template { [key: string]: unknown; }
interface ECR { [key: string]: unknown; }
interface CalendarEvent { [key: string]: unknown; }
interface WorkOrder { [key: string]: unknown; }
interface ChecklistItem { [key: string]: unknown; }
interface PODraftItem { [key: string]: unknown; }
interface NotifPrefs { [key: string]: unknown; }
interface Doc { [key: string]: unknown; }
interface RecentScan { [key: string]: unknown; }
interface ThemeData { [key: string]: unknown; }
interface SavedSearch { [key: string]: unknown; }
interface SupplierUser { [key: string]: unknown; }

export const KEYS: Record<string, string> = {
  AUTH: "__bbox_auth",
  ONBOARDING: "__bbox_onb",
  ROLE: "__bbox_role",
  BOM_ROWS: "__bbox_rows",
  COMMENTS: "__bbox_comments",
  APPROVALS: "__bbox_approvals",
  NOTIFICATIONS: "__bbox_notifications",
  SAVED_VIEWS: "__bbox_saved_views",
  TEMPLATES: "__bbox_templates",
  ECRS: "__bbox_ecrs",
  CALENDAR_EVENTS: "__bbox_calendar_events",
  WORK_ORDERS: "__bbox_work_orders",
  CHECKLIST: "__bbox_checklist",
  CHECKLIST_DISMISSED: "__bbox_checklist_dismissed",
  DUP_DISMISSED: "__bbox_dup_dismissed",
  PO_DRAFT: "__bbox_po_draft",
  NOTIF_PREFS: "__bbox_notif",
  DOCS: "__bbox_docs",
  A11Y_MODE: "__bbox_a11y",
  INR_RATE: "__bbox_rate",
  RECENT_SCANS: "__bbox_recent_scans",
  THEME: "__bbox_theme",
  TOKEN: "__bbox_token",
  LANG: "bbox_lang",
  SAVED_SEARCHES: "__bbox_saved_searches",
  SUPPLIER_USERS: "__bbox_supplier_users",
};

function get(key: string, fallback: string): string;
function get(key: string, fallback?: string | null): string | null;
function get(key: string, fallback: any = null): any {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw;
  } catch {
    return fallback;
  }
}

function getJSON<T>(key: string, fallback: T): T;
function getJSON<T>(key: string, fallback?: T | null): T | null;
function getJSON(key: string, fallback: any = null): any {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function set(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function setJSON<T = any>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  get,
  getJSON,
  set,
  setJSON,
  remove,

  auth: {
    get: (): AuthUser | null => getJSON<AuthUser>(KEYS.AUTH, null),
    set: (u: AuthUser): boolean => setJSON(KEYS.AUTH, u),
    remove: (): boolean => remove(KEYS.AUTH),
  },

  onboarding: {
    isDone: (): boolean => get(KEYS.ONBOARDING) === "1",
    setDone: (): boolean => set(KEYS.ONBOARDING, "1"),
  },

  role: {
    get: (): string => get(KEYS.ROLE, "Admin") as string,
    set: (r: string): boolean => set(KEYS.ROLE, r),
  },

  bomRows: {
    get: (): BOMRowData[] | null => getJSON<BOMRowData[]>(KEYS.BOM_ROWS, null),
    set: (rows: BOMRowData[]): boolean => setJSON(KEYS.BOM_ROWS, rows),
    remove: (): boolean => remove(KEYS.BOM_ROWS),
  },

  comments: {
    get: (init: Record<string, CommentData[]>): Record<string, CommentData[]> | null => getJSON<Record<string, CommentData[]>>(KEYS.COMMENTS, init),
    set: (c: Record<string, CommentData[]>): boolean => setJSON(KEYS.COMMENTS, c),
  },

  approvals: {
    get: (init: Record<string, ApprovalData>): Record<string, ApprovalData> | null => getJSON<Record<string, ApprovalData>>(KEYS.APPROVALS, init),
    set: (a: Record<string, ApprovalData>): boolean => setJSON(KEYS.APPROVALS, a),
  },

  notifications: {
    get: (init: NotificationData[]): NotificationData[] | null => getJSON<NotificationData[]>(KEYS.NOTIFICATIONS, init),
    set: (n: NotificationData[]): boolean => setJSON(KEYS.NOTIFICATIONS, n),
  },

  savedViews: {
    get: (): SavedView[] => getJSON<SavedView[]>(KEYS.SAVED_VIEWS, []),
    set: (v: SavedView[]): boolean => setJSON(KEYS.SAVED_VIEWS, v),
  },

  templates: {
    get: (): Template[] => getJSON<Template[]>(KEYS.TEMPLATES, []),
    set: (t: Template[]): boolean => setJSON(KEYS.TEMPLATES, t),
  },

  ecrs: {
    get: (): ECR | null => getJSON<ECR>(KEYS.ECRS, null),
    set: (e: ECR): boolean => setJSON(KEYS.ECRS, e),
  },

  calendarEvents: {
    get: (): CalendarEvent | null => getJSON<CalendarEvent>(KEYS.CALENDAR_EVENTS, null),
    set: (e: CalendarEvent): boolean => setJSON(KEYS.CALENDAR_EVENTS, e),
  },

  workOrders: {
    get: (): WorkOrder | null => getJSON<WorkOrder>(KEYS.WORK_ORDERS, null),
    set: (o: WorkOrder): boolean => setJSON(KEYS.WORK_ORDERS, o),
  },

  checklist: {
    get: (): ChecklistItem[] => getJSON<ChecklistItem[]>(KEYS.CHECKLIST, []),
    set: (items: ChecklistItem[]): boolean => setJSON(KEYS.CHECKLIST, items),
    isDismissed: (): boolean => get(KEYS.CHECKLIST_DISMISSED) === "1",
    dismiss: (): boolean => set(KEYS.CHECKLIST_DISMISSED, "1"),
  },

  dupDismissed: {
    get: (): unknown[] => getJSON<unknown[]>(KEYS.DUP_DISMISSED, []),
    set: (ids: unknown[]): boolean => setJSON(KEYS.DUP_DISMISSED, ids),
  },

  poDraft: {
    get: (): PODraftItem[] => getJSON<PODraftItem[]>(KEYS.PO_DRAFT, []),
    set: (d: PODraftItem[]): boolean => setJSON(KEYS.PO_DRAFT, d),
  },

  notifPrefs: {
    get: (): NotifPrefs | null => getJSON<NotifPrefs>(KEYS.NOTIF_PREFS, null),
    set: (p: NotifPrefs): boolean => setJSON(KEYS.NOTIF_PREFS, p),
  },

  docs: {
    get: (): Doc[] => getJSON<Doc[]>(KEYS.DOCS, []),
    set: (d: Doc[]): boolean => setJSON(KEYS.DOCS, d),
  },

  a11yMode: {
    get: (): string => get(KEYS.A11Y_MODE, ""),
    set: (m: string): boolean => set(KEYS.A11Y_MODE, m),
  },

  inrRate: {
    get: (): number => {
      try { return parseFloat(get(KEYS.INR_RATE) ?? "") || (window as any).INR_RATE || 83; }
      catch { return (window as any).INR_RATE || 83; }
    },
    set: (r: number | string): boolean => set(KEYS.INR_RATE, String(r)),
  },

  recentScans: {
    get: (): RecentScan[] => getJSON<RecentScan[]>(KEYS.RECENT_SCANS, []),
    set: (s: RecentScan[]): boolean => setJSON(KEYS.RECENT_SCANS, s),
  },

  theme: {
    get: (): string | null => get(KEYS.THEME, null),
    set: (t: string): boolean => set(KEYS.THEME, t),
  },

  lang: {
    get: (): string => get(KEYS.LANG, "en"),
    set: (l: string): boolean => set(KEYS.LANG, l),
  },

  savedSearches: {
    get: (): SavedSearch[] => getJSON<SavedSearch[]>(KEYS.SAVED_SEARCHES, []),
    set: (list: SavedSearch[]): boolean => setJSON(KEYS.SAVED_SEARCHES, list),
  },

  supplierUsers: {
    get: (): SupplierUser[] => getJSON<SupplierUser[]>(KEYS.SUPPLIER_USERS, []),
    set: (u: SupplierUser[]): boolean => setJSON(KEYS.SUPPLIER_USERS, u),
  },

  token: {
    get: (): string | null => get(KEYS.TOKEN, null),
    remove: (): boolean => remove(KEYS.TOKEN),
  },
};
