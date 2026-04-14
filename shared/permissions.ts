// All permission keys used in the system
export const PERMISSION_KEYS = [
  "canAccessDashboard",
  "canAccessTimeTracker",
  "canAccessAdminPortal",
  "canAccessClients",
  "canViewClientDetails",
  "canEditClients",
  "canDeleteClients",
  "canAssignClients",
  "canAccessTasks",
  "canAccessRates",
  "canAccessInvoices",
  "canAccessInvoiceSettings",
  "canAccessUsers",
  "canAccessRoles",
  "canAccessTimeEntries",
  "canAccessClientAssignment",
  "canViewOwnEntriesOnly",
  "canSuperAdmin",
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

export type RolePermissions = Record<PermissionKey, boolean>;

// Default permission sets for built-in roles
export const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  Admin: {
    canAccessDashboard: true,
    canAccessTimeTracker: true,
    canAccessAdminPortal: true,
    canAccessClients: true,
    canViewClientDetails: true,
    canEditClients: true,
    canDeleteClients: true,
    canAssignClients: true,
    canAccessTasks: true,
    canAccessRates: true,
    canAccessInvoices: true,
    canAccessInvoiceSettings: true,
    canAccessUsers: true,
    canAccessRoles: true,
    canAccessTimeEntries: true,
    canAccessClientAssignment: true,
    canViewOwnEntriesOnly: false,
    canSuperAdmin: true,
  },
  Assistant: {
    canAccessDashboard: false,
    canAccessTimeTracker: false,
    canAccessAdminPortal: false,
    canAccessClients: true,
    canViewClientDetails: false,
    canEditClients: true,
    canDeleteClients: false,
    canAssignClients: true,
    canAccessTasks: false,
    canAccessRates: false,
    canAccessInvoices: false,
    canAccessInvoiceSettings: false,
    canAccessUsers: false,
    canAccessRoles: false,
    canAccessTimeEntries: false,
    canAccessClientAssignment: true,
    canViewOwnEntriesOnly: false,
    canSuperAdmin: false,
  },
  Accountant: {
    canAccessDashboard: false,
    canAccessTimeTracker: true,
    canAccessAdminPortal: false,
    canAccessClients: false,
    canViewClientDetails: false,
    canEditClients: false,
    canDeleteClients: false,
    canAssignClients: false,
    canAccessTasks: false,
    canAccessRates: false,
    canAccessInvoices: false,
    canAccessInvoiceSettings: false,
    canAccessUsers: false,
    canAccessRoles: false,
    canAccessTimeEntries: true,
    canAccessClientAssignment: false,
    canViewOwnEntriesOnly: true,
    canSuperAdmin: false,
  },
};

const FALLBACK = DEFAULT_ROLE_PERMISSIONS.Accountant;

// In-memory cache of DB-loaded role permissions: roleName -> RolePermissions
let _roleCache: Map<string, RolePermissions> = new Map();
let _cacheLoaded = false;

export function setCachedRolePermissions(roles: { name: string; permissions: Record<string, boolean> }[]) {
  _roleCache = new Map();
  for (const role of roles) {
    _roleCache.set(role.name, buildPermissions(role.permissions));
  }
  _cacheLoaded = true;
}

export function isCacheLoaded(): boolean {
  return _cacheLoaded;
}

function buildPermissions(raw: Record<string, boolean>): RolePermissions {
  const result = { ...FALLBACK };
  for (const key of PERMISSION_KEYS) {
    if (key in raw) {
      result[key] = raw[key];
    }
  }
  return result;
}

export function getPermissions(role: string | null | undefined): RolePermissions {
  if (!role) return FALLBACK;

  // Check DB cache first
  if (_cacheLoaded && _roleCache.has(role)) {
    return _roleCache.get(role)!;
  }

  // Normalise legacy role names → canonical
  const normalised = normaliseRole(role);
  if (_cacheLoaded && _roleCache.has(normalised)) {
    return _roleCache.get(normalised)!;
  }

  // Fall back to static defaults
  if (normalised in DEFAULT_ROLE_PERMISSIONS) {
    return DEFAULT_ROLE_PERMISSIONS[normalised];
  }

  return FALLBACK;
}

export function normaliseRole(role: string): string {
  if (role === "Administrator" || role === "Admin") return "Admin";
  if (role === "Admin Assistant" || role === "Assistant") return "Assistant";
  if (role === "Employee" || role === "Accountant") return "Accountant";
  return role;
}

// Legacy alias kept for backward compat
export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;
export type UserRole = "Admin" | "Assistant" | "Accountant";
export const AVAILABLE_ROLES: UserRole[] = ["Admin", "Assistant", "Accountant"];
