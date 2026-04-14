export type UserRole = "Admin" | "Assistant" | "Accountant";

export interface RolePermissions {
  canAccessDashboard: boolean;
  canAccessTimeTracker: boolean;
  canAccessAdminPortal: boolean;
  canAccessClients: boolean;
  canViewClientDetails: boolean;
  canEditClients: boolean;
  canAccessTasks: boolean;
  canAccessRates: boolean;
  canAccessInvoices: boolean;
  canAccessInvoiceSettings: boolean;
  canAccessUsers: boolean;
  canAccessTimeEntries: boolean;
  canAccessClientAssignment: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  Admin: {
    canAccessDashboard: true,
    canAccessTimeTracker: true,
    canAccessAdminPortal: true,
    canAccessClients: true,
    canViewClientDetails: true,
    canEditClients: true,
    canAccessTasks: true,
    canAccessRates: true,
    canAccessInvoices: true,
    canAccessInvoiceSettings: true,
    canAccessUsers: true,
    canAccessTimeEntries: true,
    canAccessClientAssignment: true,
  },
  Assistant: {
    canAccessDashboard: false,
    canAccessTimeTracker: false,
    canAccessAdminPortal: false,
    canAccessClients: true,
    canViewClientDetails: false,
    canEditClients: true,
    canAccessTasks: false,
    canAccessRates: false,
    canAccessInvoices: false,
    canAccessInvoiceSettings: false,
    canAccessUsers: false,
    canAccessTimeEntries: false,
    canAccessClientAssignment: false,
  },
  Accountant: {
    canAccessDashboard: false,
    canAccessTimeTracker: true,
    canAccessAdminPortal: false,
    canAccessClients: false,
    canViewClientDetails: false,
    canEditClients: false,
    canAccessTasks: false,
    canAccessRates: false,
    canAccessInvoices: false,
    canAccessInvoiceSettings: false,
    canAccessUsers: false,
    canAccessTimeEntries: true, // Needed for Time Tracker functionality
    canAccessClientAssignment: false,
  },
};

export function getPermissions(role: string | null | undefined): RolePermissions {
  if (role === "Admin" || role === "Administrator") {
    return ROLE_PERMISSIONS.Admin;
  }
  if (role === "Assistant" || role === "Admin Assistant") {
    return ROLE_PERMISSIONS.Assistant;
  }
  if (role === "Accountant" || role === "Employee") {
    return ROLE_PERMISSIONS.Accountant;
  }
  return ROLE_PERMISSIONS.Accountant;
}

export const AVAILABLE_ROLES: UserRole[] = ["Admin", "Assistant", "Accountant"];
