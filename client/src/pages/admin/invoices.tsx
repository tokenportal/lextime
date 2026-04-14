import { useState } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClients } from "@/hooks/use-time-tracking";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CalendarIcon, FileText, Plus, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { api } from "@shared/routes";
import type { Invoice, Client } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function InvoicesPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const { data: clients } = useClients();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  if (!permissions.canAccessInvoices) {
    return <Redirect to={permissions.canAccessTimeTracker ? "/tracker" : "/admin/clients"} />;
  }
  
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null);

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: [api.invoices.list.path],
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: { clientId: number; startDate: Date; endDate: Date }) => {
      const invoiceNumber = `INV-${Date.now()}`;
      return apiRequest("POST", api.invoices.create.path, {
        clientId: data.clientId,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
        invoiceNumber,
        status: "Draft",
      });
    },
    onSuccess: async (response) => {
      const invoice = await response.json();
      queryClient.invalidateQueries({ queryKey: [api.invoices.list.path] });
      toast({ title: "Success", description: "Draft invoice created" });
      navigate(`/admin/invoices/${invoice.id}`);
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to create invoice", variant: "destructive" });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.invoices.list.path] });
      toast({ title: "Success", description: "Invoice deleted" });
      setDeleteInvoiceId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete invoice", variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    if (!selectedClientId || !startDate || !endDate) {
      toast({ title: "Missing fields", description: "Please select a client and date range", variant: "destructive" });
      return;
    }
    createInvoiceMutation.mutate({ clientId: selectedClientId, startDate, endDate });
  };

  const getClientName = (clientId: number) => {
    const client = clients?.find((c: Client) => c.id === clientId);
    return client?.name || "Unknown";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary">Invoices</h1>
        <p className="text-muted-foreground">Generate and manage client invoices</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create New Invoice
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select
                value={selectedClientId?.toString() || ""}
                onValueChange={(v) => setSelectedClientId(Number(v))}
              >
                <SelectTrigger data-testid="select-invoice-client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.filter((c: Client) => c.status === "Active").map((client: Client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                    data-testid="button-invoice-start-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                    data-testid="button-invoice-end-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleGenerate}
                disabled={!selectedClientId || !startDate || !endDate || createInvoiceMutation.isPending}
                className="w-full"
                data-testid="button-generate-invoice"
              >
                <FileText className="w-4 h-4 mr-2" />
                Generate Invoice
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading invoices...</div>
          ) : invoices?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No invoices yet. Create your first invoice above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices?.map((invoice) => (
                  <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{getClientName(invoice.clientId)}</TableCell>
                    <TableCell>
                      {format(new Date(invoice.startDate), "MMM d")} - {format(new Date(invoice.endDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === "Finalized" ? "default" : "secondary"}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invoice.generatedAt ? format(new Date(invoice.generatedAt), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/invoices/${invoice.id}`)}
                          data-testid={`button-view-invoice-${invoice.id}`}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteInvoiceId(invoice.id)}
                          data-testid={`button-delete-invoice-${invoice.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteInvoiceId !== null} onOpenChange={() => setDeleteInvoiceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this invoice and all its line items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteInvoiceId && deleteInvoiceMutation.mutate(deleteInvoiceId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
