import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Building, Pencil, Trash2, LayoutGrid, List } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertClientSchema, api } from "@shared/routes";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { useCreateClient as useCreateClientMutation } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Client } from "@shared/schema";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";

type ViewMode = "list" | "kanban";
const KANBAN_COLS = ["Active", "On Hold", "Closed"] as const;
type KanbanStatus = typeof KANBAN_COLS[number];

function useClients(mine: boolean) {
  return useQuery<Client[]>({
    queryKey: [api.clients.list.path, mine ? "mine" : "all"],
    queryFn: async () => {
      const url = mine ? `${api.clients.list.path}?mine=true` : api.clients.list.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });
}

function DraggableCard({
  client,
  permissions,
  onEdit,
  onDelete,
}: {
  client: Client;
  permissions: ReturnType<typeof getPermissions>;
  onEdit: (c: Client) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: client.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Building className="w-4 h-4" />
          </div>
          <p className="font-semibold text-sm text-slate-800 truncate">{client.name}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {permissions.canEditClients && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(client); }}
              className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {permissions.canDeleteClients && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(client.id); }}
              className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {client.contactInfo && (
        <p className="text-xs text-muted-foreground mt-2 truncate">{client.contactInfo}</p>
      )}
    </div>
  );
}

function KanbanColumn({
  status,
  clients,
  permissions,
  onEdit,
  onDelete,
}: {
  status: KanbanStatus;
  clients: Client[];
  permissions: ReturnType<typeof getPermissions>;
  onEdit: (c: Client) => void;
  onDelete: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const colColors: Record<KanbanStatus, string> = {
    Active: "border-green-400 bg-green-50/40",
    "On Hold": "border-amber-400 bg-amber-50/40",
    Closed: "border-slate-400 bg-slate-50/40",
  };
  const headerColors: Record<KanbanStatus, string> = {
    Active: "text-green-700 bg-green-100",
    "On Hold": "text-amber-700 bg-amber-100",
    Closed: "text-slate-600 bg-slate-100",
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[220px] rounded-xl border-2 transition-colors ${colColors[status]} ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="p-3 border-b border-slate-200/60">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${headerColors[status]}`}>{status}</span>
          <span className="text-xs text-muted-foreground font-medium">{clients.length}</span>
        </div>
      </div>
      <div className="p-3 space-y-2 min-h-[120px]">
        {clients.map(c => (
          <DraggableCard
            key={c.id}
            client={c}
            permissions={permissions}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const isMyClientsMode = permissions.canViewOwnEntriesOnly;
  const { data: clients, isLoading } = useClients(isMyClientsMode);
  const createClient = useCreateClientMutation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const updateClientMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; contactInfo?: string; billingAddress?: string; status?: string }) => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update client");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.clients.list.path] });
      toast({ title: "Success", description: "Client updated" });
      setEditingClient(null);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete client");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.clients.list.path] });
      toast({ title: "Client deleted" });
      setDeletingClientId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setDeletingClientId(null);
    },
  });

  const form = useForm<z.infer<typeof insertClientSchema>>({
    resolver: zodResolver(insertClientSchema),
    defaultValues: { name: "", contactInfo: "", billingAddress: "", status: "Active" },
  });

  const onSubmit = async (data: z.infer<typeof insertClientSchema>) => {
    await createClient.mutateAsync(data);
    setOpen(false);
    form.reset();
  };

  const filteredClients = (clients || []).filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Kanban drag handlers
  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const clientId = active.id as number;
    const newStatus = over.id as string;
    const client = (clients || []).find(c => c.id === clientId);
    if (!client || client.status === newStatus) return;
    updateClientMutation.mutate({ id: clientId, status: newStatus });
  }

  const activeClient = activeId ? (clients || []).find(c => c.id === activeId) : null;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary">
            {isMyClientsMode ? "My Clients" : "Clients"}
          </h1>
          <p className="text-muted-foreground">
            {isMyClientsMode
              ? "Clients assigned to you"
              : "Manage your firm's client portfolio"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow text-primary" : "text-muted-foreground hover:text-primary"}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-2 rounded-md transition-all ${viewMode === "kanban" ? "bg-white shadow text-primary" : "text-muted-foreground hover:text-primary"}`}
              title="Kanban view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {permissions.canEditClients && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  <Plus className="w-4 h-4 mr-2" /> Add Client
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Client</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Name</FormLabel>
                          <FormControl><Input placeholder="Acme Corp" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contactInfo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Info</FormLabel>
                          <FormControl><Input placeholder="Email or Phone" {...field} value={field.value || ''} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="billingAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billing Address</FormLabel>
                          <FormControl><Input placeholder="123 Legal Way" {...field} value={field.value || ''} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={createClient.isPending}>
                      {createClient.isPending ? "Creating..." : "Create Client"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm max-w-md">
        <Search className="w-4 h-4 text-muted-foreground ml-2" />
        <Input
          placeholder="Search clients..."
          className="border-none shadow-none focus-visible:ring-0"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Client Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : filteredClients.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No clients found</TableCell></TableRow>
              ) : (
                filteredClients.map((client) => (
                  <TableRow key={client.id} className="hover:bg-slate-50/50 group">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <Building className="w-4 h-4" />
                        </div>
                        {client.name}
                      </div>
                    </TableCell>
                    <TableCell>{client.contactInfo || "-"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        client.status === "Active" ? "bg-green-100 text-green-700" :
                        client.status === "On Hold" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {client.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {permissions.canEditClients && (
                          <Button variant="ghost" size="sm" onClick={() => setEditingClient(client)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {permissions.canDeleteClients && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setDeletingClientId(client.id); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* KANBAN VIEW */}
      {viewMode === "kanban" && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {KANBAN_COLS.map(col => (
              <KanbanColumn
                key={col}
                status={col}
                clients={filteredClients.filter(c => (c.status || "Active") === col)}
                permissions={permissions}
                onEdit={setEditingClient}
                onDelete={setDeletingClientId}
              />
            ))}
          </div>
          <DragOverlay>
            {activeClient && (
              <div className="bg-white rounded-xl border border-primary/40 p-4 shadow-xl w-56 rotate-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Building className="w-4 h-4" />
                  </div>
                  <p className="font-semibold text-sm text-slate-800 truncate">{activeClient.name}</p>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* EDIT DIALOG */}
      <Dialog open={!!editingClient} onOpenChange={(v) => !v && setEditingClient(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
          {editingClient && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Client Name</Label>
                <Input
                  value={editingClient.name}
                  onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Info</Label>
                <Input
                  value={editingClient.contactInfo || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, contactInfo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Billing Address</Label>
                <Input
                  value={editingClient.billingAddress || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, billingAddress: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editingClient.status}
                  onValueChange={(v) => setEditingClient({ ...editingClient, status: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="On Hold">On Hold</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button
              onClick={() => editingClient && updateClientMutation.mutate({
                id: editingClient.id,
                name: editingClient.name,
                contactInfo: editingClient.contactInfo || undefined,
                billingAddress: editingClient.billingAddress || undefined,
                status: editingClient.status,
              })}
              disabled={updateClientMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRM */}
      <AlertDialog open={deletingClientId !== null} onOpenChange={() => setDeletingClientId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the client and all assignments. This action cannot be undone.
              Note: clients with linked time entries or invoices cannot be deleted — archive them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingClientId !== null && deleteClientMutation.mutate(deletingClientId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
