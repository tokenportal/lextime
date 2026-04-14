import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions, PERMISSION_KEYS } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, ShieldCheck } from "lucide-react";
import type { Role } from "@shared/schema";

// Human-readable labels for each permission key
const PERMISSION_LABELS: Record<string, string> = {
  canAccessDashboard: "View Dashboard",
  canAccessTimeTracker: "Track Time",
  canAccessAdminPortal: "Access Admin Portal",
  canAccessClients: "View Clients",
  canViewClientDetails: "View Client Details",
  canEditClients: "Edit Clients",
  canDeleteClients: "Delete Clients",
  canAssignClients: "Assign Clients to Employees",
  canAccessTasks: "Manage Tasks",
  canAccessRates: "Manage Rates",
  canAccessInvoices: "Access Invoices",
  canAccessInvoiceSettings: "Invoice Settings",
  canAccessUsers: "Manage Users",
  canAccessRoles: "Manage Roles",
  canAccessTimeEntries: "Access Time Entries",
  canAccessClientAssignment: "Client Assignment",
  canViewOwnEntriesOnly: "View Own Entries Only",
  canSuperAdmin: "Super Admin",
};

const DEFAULT_PERMISSIONS = Object.fromEntries(PERMISSION_KEYS.map(k => [k, false]));

export default function RolesPage() {
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (!permissions.canAccessRoles) {
    return <Redirect to="/admin/dashboard" />;
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState("");
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>(DEFAULT_PERMISSIONS);
  const [deleteRoleId, setDeleteRoleId] = useState<number | null>(null);

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    queryFn: async () => {
      const res = await fetch("/api/roles", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load roles");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; permissions: Record<string, boolean> }) => {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create role");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({ title: "Role created" });
      closeDialog();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, permissions }: { id: number; name: string; permissions: Record<string, boolean> }) => {
      const res = await fetch(`/api/roles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, permissions }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({ title: "Role updated" });
      closeDialog();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/roles/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({ title: "Role deleted" });
      setDeleteRoleId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingRole(null);
    setRoleName("");
    setRolePerms({ ...DEFAULT_PERMISSIONS });
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    const perms = { ...DEFAULT_PERMISSIONS, ...(role.permissions as Record<string, boolean>) };
    setRolePerms(perms);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingRole(null);
  };

  const handleSave = () => {
    if (!roleName.trim()) return;
    if (editingRole) {
      updateMutation.mutate({ id: editingRole.id, name: roleName.trim(), permissions: rolePerms });
    } else {
      createMutation.mutate({ name: roleName.trim(), permissions: rolePerms });
    }
  };

  const togglePerm = (key: string) => {
    setRolePerms(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary">Roles</h1>
          <p className="text-muted-foreground">Create and configure custom roles with granular permissions.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> New Role
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4">
          {roles.map(role => {
            const perms = role.permissions as Record<string, boolean>;
            const enabledCount = PERMISSION_KEYS.filter(k => perms[k]).length;
            return (
              <Card key={role.id} className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                      {role.name}
                      {role.isDefault && (
                        <span className="text-xs font-normal bg-muted text-muted-foreground px-2 py-0.5 rounded-full">default</span>
                      )}
                    </CardTitle>
                    <CardDescription>{enabledCount} of {PERMISSION_KEYS.length} permissions enabled</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(role)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {!role.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteRoleId(role.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {PERMISSION_KEYS.filter(k => perms[k]).map(k => (
                      <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {PERMISSION_LABELS[k] || k}
                      </span>
                    ))}
                    {enabledCount === 0 && (
                      <span className="text-xs text-muted-foreground italic">No permissions enabled</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Create Role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="space-y-2">
              <Label>Role Name</Label>
              <Input
                value={roleName}
                onChange={e => setRoleName(e.target.value)}
                placeholder="e.g. Paralegal, Secretary 1, Junior Associate"
                disabled={editingRole?.isDefault}
              />
              {editingRole?.isDefault && (
                <p className="text-xs text-muted-foreground">Default role names cannot be changed.</p>
              )}
            </div>

            <div className="space-y-3">
              <Label>Permissions</Label>
              <div className="divide-y rounded-md border">
                {PERMISSION_KEYS.map(key => (
                  <div key={key} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm">{PERMISSION_LABELS[key] || key}</span>
                    <Switch
                      checked={!!rolePerms[key]}
                      onCheckedChange={() => togglePerm(key)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={isPending || !roleName.trim()} className="gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingRole ? "Save Changes" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteRoleId !== null} onOpenChange={() => setDeleteRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the role. Users currently assigned this role will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRoleId !== null && deleteMutation.mutate(deleteRoleId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
