import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClients } from "@/hooks/use-time-tracking";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Building, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertClientSchema, api } from "@shared/routes";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { useCreateClient as useCreateClientMutation } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import type { Client } from "@shared/schema";

export default function ClientsPage() {
  const { data: clients, isLoading } = useClients();
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const createClient = useCreateClientMutation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const form = useForm<z.infer<typeof insertClientSchema>>({
    resolver: zodResolver(insertClientSchema),
    defaultValues: {
      name: "",
      contactInfo: "",
      billingAddress: "",
      status: "Active",
    },
  });

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

  const onSubmit = async (data: z.infer<typeof insertClientSchema>) => {
    await createClient.mutateAsync(data);
    setOpen(false);
    form.reset();
  };

  const filteredClients = clients?.filter((c: any) => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary">Clients</h1>
          <p className="text-muted-foreground">Manage your firm's client portfolio</p>
        </div>
        
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
                      <FormControl>
                        <Input placeholder="Acme Corp" {...field} />
                      </FormControl>
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
                      <FormControl>
                        <Input placeholder="Email or Phone" {...field} value={field.value || ''} />
                      </FormControl>
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
                      <FormControl>
                        <Input placeholder="123 Legal Way" {...field} value={field.value || ''} />
                      </FormControl>
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
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : filteredClients?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No clients found</TableCell>
              </TableRow>
            ) : (
              filteredClients?.map((client: any) => (
                <TableRow 
                  key={client.id} 
                  className="hover:bg-slate-50/50 cursor-pointer group"
                  data-testid={`row-client-${client.id}`}
                >
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
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${client.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                      {client.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {permissions.canEditClients && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="gap-1" 
                          onClick={() => setEditingClient(client)}
                          data-testid={`button-edit-client-${client.id}`}
                        >
                          <Pencil className="w-4 h-4" />
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

      <Dialog open={!!editingClient} onOpenChange={(v) => !v && setEditingClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          {editingClient && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Client Name</Label>
                <Input
                  value={editingClient.name}
                  onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                  data-testid="input-edit-client-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Info</Label>
                <Input
                  value={editingClient.contactInfo || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, contactInfo: e.target.value })}
                  data-testid="input-edit-client-contact"
                />
              </div>
              <div className="space-y-2">
                <Label>Billing Address</Label>
                <Input
                  value={editingClient.billingAddress || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, billingAddress: e.target.value })}
                  data-testid="input-edit-client-address"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editingClient.status}
                  onValueChange={(v) => setEditingClient({ ...editingClient, status: v })}
                >
                  <SelectTrigger data-testid="select-edit-client-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              onClick={() => editingClient && updateClientMutation.mutate({
                id: editingClient.id,
                name: editingClient.name,
                contactInfo: editingClient.contactInfo || undefined,
                billingAddress: editingClient.billingAddress || undefined,
                status: editingClient.status,
              })} 
              disabled={updateClientMutation.isPending}
              data-testid="button-save-edit-client"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
