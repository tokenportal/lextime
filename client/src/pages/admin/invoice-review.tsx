import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation, Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClients, useTimeEntries } from "@/hooks/use-time-tracking";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, GripVertical, Save, Trash2, FileDown, AlertTriangle, Check } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { api } from "@shared/routes";
import type { Invoice, InvoiceItem, Client, TimeEntry, HourlyRate } from "@shared/schema";
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface LocalInvoiceItem {
  id: number;
  tempId?: string;
  timeEntryId: number | null;
  employeeName: string;
  taskDescription: string;
  subTaskDescription: string | null;
  workDate: Date;
  taxYear: number | null;
  notes: string | null;
  hours: string;
  rateLevel: number;
  rateAmount: string;
  lineTotal: string;
  displayOrder: number;
  included: boolean;
}

function SortableRow({ item, index, onUpdate, onDelete, rates, disabled }: {
  item: LocalInvoiceItem;
  index: number;
  onUpdate: (id: number, updates: Partial<LocalInvoiceItem>) => void;
  onDelete: (id: number) => void;
  rates: HourlyRate[];
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleHoursChange = (value: string) => {
    const hours = parseFloat(value) || 0;
    const rate = rates.find(r => r.reviewLevel === item.rateLevel);
    const rateAmount = parseFloat(rate?.rateAmount || "0");
    const lineTotal = (hours * rateAmount).toFixed(2);
    onUpdate(item.id, { hours: value, lineTotal });
  };

  const handleRateLevelChange = (level: number) => {
    const rate = rates.find(r => r.reviewLevel === level);
    const rateAmount = rate?.rateAmount || "0";
    const hours = parseFloat(item.hours) || 0;
    const lineTotal = (hours * parseFloat(rateAmount)).toFixed(2);
    onUpdate(item.id, { rateLevel: level, rateAmount, lineTotal });
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        isDragging && "opacity-50 bg-muted",
        !item.included && "opacity-60 bg-muted/30"
      )}
      data-testid={`row-invoice-item-${item.id}`}
    >
      <TableCell className="w-8">
        {!disabled && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
            data-testid={`drag-handle-${item.id}`}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </TableCell>
      <TableCell>
        <Checkbox
          checked={item.included}
          onCheckedChange={(checked) => onUpdate(item.id, { included: !!checked })}
          disabled={disabled}
          data-testid={`checkbox-include-${item.id}`}
        />
      </TableCell>
      <TableCell>
        <div className="text-sm">
          {format(new Date(item.workDate), "MMM d, yyyy")}
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          {item.taskDescription}
          {item.subTaskDescription && (
            <span className="text-muted-foreground"> - {item.subTaskDescription}</span>
          )}
        </div>
        {item.notes && (
          <div className="text-xs text-muted-foreground mt-1">{item.notes}</div>
        )}
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.25"
          min="0"
          value={item.hours}
          onChange={(e) => handleHoursChange(e.target.value)}
          className="w-20 text-right"
          disabled={disabled}
          data-testid={`input-hours-${item.id}`}
        />
      </TableCell>
      <TableCell>
        <Select
          value={item.rateLevel.toString()}
          onValueChange={(v) => handleRateLevelChange(Number(v))}
          disabled={disabled}
        >
          <SelectTrigger className="w-24" data-testid={`select-rate-level-${item.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Level 1</SelectItem>
            <SelectItem value="2">Level 2</SelectItem>
            <SelectItem value="3">Level 3</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        ${parseFloat(item.rateAmount).toFixed(2)}
      </TableCell>
      <TableCell className="text-right font-medium">
        ${parseFloat(item.lineTotal).toFixed(2)}
      </TableCell>
      <TableCell>
        {!disabled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.id)}
            data-testid={`button-delete-item-${item.id}`}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function InvoiceReviewPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = Number(params.id);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  if (!permissions.canAccessInvoices) {
    return <Redirect to={permissions.canAccessTimeTracker ? "/tracker" : "/admin/clients"} />;
  }

  const { data: clients } = useClients();
  const { data: invoice, isLoading: invoiceLoading } = useQuery<Invoice>({
    queryKey: ["/api/invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!invoiceId,
  });

  const { data: existingItems } = useQuery<InvoiceItem[]>({
    queryKey: ["/api/invoices", invoiceId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    enabled: !!invoiceId,
  });

  const { data: rates } = useQuery<HourlyRate[]>({
    queryKey: [api.rates.list.path],
  });

  const { data: timeEntries } = useTimeEntries({
    clientId: invoice?.clientId,
    startDate: invoice?.startDate ? startOfDay(new Date(invoice.startDate)).toISOString() : undefined,
    endDate: invoice?.endDate ? endOfDay(new Date(invoice.endDate)).toISOString() : undefined,
  });

  const [items, setItems] = useState<LocalInvoiceItem[]>([]);
  const [summaryNotes, setSummaryNotes] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [discountDescription, setDiscountDescription] = useState("");
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [hasInitializedItems, setHasInitializedItems] = useState(false);

  useEffect(() => {
    if (invoice) {
      setSummaryNotes(invoice.summaryNotes || "");
      setDiscountAmount(invoice.discountAmount || "0");
      setDiscountDescription(invoice.discountDescription || "");
    }
  }, [invoice]);

  useEffect(() => {
    if (hasLocalChanges) return;
    if (!existingItems) return;
    
    if (existingItems.length > 0) {
      const serverItems = existingItems
        .map(item => ({
          ...item,
          workDate: new Date(item.workDate),
          hours: item.hours?.toString() ?? "0",
          rateAmount: item.rateAmount?.toString() ?? "0",
          lineTotal: item.lineTotal?.toString() ?? "0",
        }))
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      setItems(serverItems);
      setHasInitializedItems(true);
    } else if (!hasInitializedItems && timeEntries && timeEntries.length > 0 && rates) {
      const defaultItems: LocalInvoiceItem[] = timeEntries
        .filter((entry: any) => entry.status === "Completed")
        .map((entry: any, index: number) => {
          const hours = (entry.totalDuration / 3600).toFixed(2);
          const rateLevel = entry.rateLevel || 1;
          const rate = rates.find(r => r.reviewLevel === rateLevel);
          const rateAmount = rate?.rateAmount || "0";
          const lineTotal = (parseFloat(hours) * parseFloat(rateAmount)).toFixed(2);

          return {
            id: -1 * (index + 1),
            tempId: `temp-${index}`,
            timeEntryId: entry.id,
            employeeName: entry.employee?.firstName && entry.employee?.lastName 
              ? `${entry.employee.firstName} ${entry.employee.lastName}`
              : entry.employee?.email || "Unknown",
            taskDescription: entry.mainTask?.description || "Unknown Task",
            subTaskDescription: entry.subTask?.description || null,
            workDate: new Date(entry.startTime),
            taxYear: entry.taxYear,
            notes: entry.description,
            hours,
            rateLevel,
            rateAmount,
            lineTotal,
            displayOrder: index,
            included: true,
          };
        });
      setItems(defaultItems);
      setHasInitializedItems(true);
      setHasLocalChanges(true);
    }
  }, [existingItems, timeEntries, rates, hasLocalChanges, hasInitializedItems]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((currentItems) => {
        const oldIndex = currentItems.findIndex((i) => i.id === active.id);
        const newIndex = currentItems.findIndex((i) => i.id === over.id);
        const reordered = arrayMove(currentItems, oldIndex, newIndex);
        return reordered.map((item, index) => ({ ...item, displayOrder: index }));
      });
      setHasLocalChanges(true);
    }
  };

  const handleUpdateItem = (id: number, updates: Partial<LocalInvoiceItem>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item));
    setHasLocalChanges(true);
  };

  const handleDeleteItem = (id: number) => {
    setItems(items.filter(item => item.id !== id));
    setDeleteItemId(null);
    setHasLocalChanges(true);
  };

  const subtotal = useMemo(() => {
    return items
      .filter(item => item.included)
      .reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0);
  }, [items]);

  const total = useMemo(() => {
    return subtotal - parseFloat(discountAmount || "0");
  }, [subtotal, discountAmount]);

  const saveInvoiceMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/invoices/${invoiceId}`, {
        summaryNotes,
        discountAmount,
        discountDescription,
        subtotal: subtotal.toFixed(2),
        total: total.toFixed(2),
      });

      const existingServerIds = existingItems?.map(i => i.id) || [];
      const currentItemIds = new Set(items.filter(i => i.id > 0).map(i => i.id));
      
      for (const serverId of existingServerIds) {
        if (!currentItemIds.has(serverId)) {
          await apiRequest("DELETE", `/api/invoices/${invoiceId}/items/${serverId}`);
        }
      }

      for (const item of items) {
        if (item.id > 0) {
          await apiRequest("PUT", `/api/invoices/${invoiceId}/items/${item.id}`, {
            hours: item.hours,
            rateLevel: item.rateLevel,
            rateAmount: item.rateAmount,
            lineTotal: item.lineTotal,
            displayOrder: items.indexOf(item),
            included: item.included,
          });
        }
      }

      const newItems = items
        .filter(item => item.id < 0)
        .map((item) => {
          const workDateValue = item.workDate instanceof Date && !isNaN(item.workDate.getTime())
            ? item.workDate.toISOString()
            : new Date().toISOString();
          return {
            timeEntryId: item.timeEntryId,
            employeeName: item.employeeName,
            taskDescription: item.taskDescription,
            subTaskDescription: item.subTaskDescription,
            workDate: workDateValue,
            taxYear: item.taxYear,
            notes: item.notes,
            hours: item.hours,
            rateLevel: item.rateLevel,
            rateAmount: item.rateAmount,
            lineTotal: item.lineTotal,
            displayOrder: items.indexOf(item),
            included: item.included,
          };
        });
      if (newItems.length > 0) {
        await apiRequest("POST", `/api/invoices/${invoiceId}/items`, newItems);
      }
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/invoices", invoiceId, "items"] });
      await queryClient.refetchQueries({ queryKey: ["/api/invoices", invoiceId] });
      setHasLocalChanges(false);
      toast({ title: "Saved", description: "Invoice saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save invoice", variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      await saveInvoiceMutation.mutateAsync();
      return apiRequest("POST", `/api/invoices/${invoiceId}/finalize`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId] });
      toast({ title: "Finalized", description: "Invoice has been finalized" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to finalize invoice", variant: "destructive" });
    },
  });

  const handleDownloadPdf = () => {
    window.open(`/api/invoices/${invoiceId}/pdf`, '_blank');
  };

  const client = clients?.find((c: Client) => c.id === invoice?.clientId);
  const isFinalized = invoice?.status === "Finalized";

  if (invoiceLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading invoice...</div>;
  }

  if (!invoice) {
    return <div className="p-8 text-center text-muted-foreground">Invoice not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/invoices")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-primary">
              Invoice {invoice.invoiceNumber}
            </h1>
            <p className="text-sm text-muted-foreground">
              {client?.name} | {format(new Date(invoice.startDate), "MMM d")} - {format(new Date(invoice.endDate), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={invoice.status === "Finalized" ? "default" : "secondary"}>
            {invoice.status}
          </Badge>
          <Button variant="outline" onClick={handleDownloadPdf} data-testid="button-download-pdf">
            <FileDown className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
          {!isFinalized && (
            <>
              <Button onClick={() => saveInvoiceMutation.mutate()} disabled={saveInvoiceMutation.isPending} data-testid="button-save-invoice">
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending} variant="default" data-testid="button-finalize-invoice">
                <Check className="w-4 h-4 mr-2" />
                Finalize
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
              <CardDescription>
                Review and adjust time entries for this invoice. Drag to reorder.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No time entries found for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="w-12">Include</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead className="w-20">Hours</TableHead>
                        <TableHead className="w-24">Rate Level</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        <TableBody>
                          {items.map((item, index) => (
                            <SortableRow
                              key={item.id}
                              item={item}
                              index={index}
                              onUpdate={handleUpdateItem}
                              onDelete={(id) => setDeleteItemId(id)}
                              rates={rates || []}
                              disabled={isFinalized}
                            />
                          ))}
                        </TableBody>
                      </SortableContext>
                    </DndContext>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="space-y-2">
                <Label>Discount</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-24"
                    disabled={isFinalized}
                    data-testid="input-discount"
                  />
                  <Input
                    placeholder="Reason (optional)"
                    value={discountDescription}
                    onChange={(e) => setDiscountDescription(e.target.value)}
                    className="flex-1"
                    disabled={isFinalized}
                    data-testid="input-discount-reason"
                  />
                </div>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea
                  placeholder="Any additional notes for this invoice..."
                  value={summaryNotes}
                  onChange={(e) => setSummaryNotes(e.target.value)}
                  rows={3}
                  disabled={isFinalized}
                  data-testid="textarea-notes"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={deleteItemId !== null} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete Line Item?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this time entry from the invoice. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItemId && handleDeleteItem(deleteItemId)}
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
