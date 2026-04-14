import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Save, Loader2, Clock, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { useClients } from "@/hooks/use-time-tracking";
import type { Client, TimeEntry, MainTask, SubTask, User, ClientTaskOverride, ClientSubtaskOverride } from "@shared/schema";

type TimeEntryWithRelations = TimeEntry & {
  client: Client;
  mainTask: MainTask;
  subTask: SubTask | null;
  employee: User;
};

// billingLevel: 1=2nd Level, 2=1st Level, 3=Attorney, null=Non-Billable
const BILLING_LEVELS = [
  { value: 3, label: "Attorney" },
  { value: 2, label: "1st Level" },
  { value: 1, label: "2nd Level" },
  { value: null, label: "Non-Billable" },
] as const;

type EditedEntry = {
  id: number;
  totalDuration: number;
  billingLevel: number | null;
  description: string;
  mainTaskId: number;
  mainTaskDescription: string;
  subTaskId: number | null;
  subTaskDescription: string | null;
  originalDuration: number;
  originalBillingLevel: number | null;
  originalDescription: string;
  originalMainTaskDescription: string;
  originalSubTaskDescription: string | null;
};

export default function TimeEntriesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const { data: clients } = useClients();

  if (!permissions.canViewClientDetails) {
    return <Redirect to="/admin/clients" />;
  }

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [editedEntries, setEditedEntries] = useState<Map<number, EditedEntry>>(new Map());

  const activeClients = (clients?.filter((c: Client) => c.status === "Active") || []).sort((a: Client, b: Client) => a.name.localeCompare(b.name));

  const { data: allEntries = [], isLoading: entriesLoading } = useQuery<TimeEntryWithRelations[]>({
    queryKey: ["/api/time-entries", "admin-view", selectedClientId],
    queryFn: async () => {
      const url = `/api/time-entries?clientId=${selectedClientId}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return res.json();
    },
    enabled: !!selectedClientId,
    staleTime: 0,
  });

  const clientEntries = allEntries;

  const { data: taskOverrides = [] } = useQuery<ClientTaskOverride[]>({
    queryKey: ["/api/clients", selectedClientId, "task-overrides"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${selectedClientId}/task-overrides`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedClientId && selectedClientId !== "all",
  });

  const { data: subtaskOverrides = [] } = useQuery<ClientSubtaskOverride[]>({
    queryKey: ["/api/clients", selectedClientId, "subtask-overrides"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${selectedClientId}/subtask-overrides`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedClientId && selectedClientId !== "all",
  });

  const getEffectiveTaskDescription = (entry: TimeEntryWithRelations): string => {
    const override = taskOverrides.find(o => o.mainTaskId === entry.mainTaskId);
    return override?.description || entry.mainTask?.description || "";
  };

  const getEffectiveSubtaskDescription = (entry: TimeEntryWithRelations): string | null => {
    if (!entry.subTaskId) return null;
    const override = subtaskOverrides.find(o => o.subTaskId === entry.subTaskId);
    return override?.description || entry.subTask?.description || null;
  };

  useEffect(() => {
    if (clientEntries.length > 0) {
      const initial = new Map<number, EditedEntry>();
      clientEntries.forEach(entry => {
        const duration = entry.totalDuration;
        // billingLevel takes priority; fall back to rateLevel for legacy data
        const level = entry.billingLevel !== undefined ? entry.billingLevel : (entry.rateLevel ?? null);
        const desc = entry.description || "";
        const mainTaskDesc = getEffectiveTaskDescription(entry);
        const subTaskDesc = getEffectiveSubtaskDescription(entry);
        initial.set(entry.id, {
          id: entry.id,
          totalDuration: duration,
          billingLevel: level,
          description: desc,
          mainTaskId: entry.mainTaskId,
          mainTaskDescription: mainTaskDesc,
          subTaskId: entry.subTaskId,
          subTaskDescription: subTaskDesc,
          originalDuration: duration,
          originalBillingLevel: level,
          originalDescription: desc,
          originalMainTaskDescription: mainTaskDesc,
          originalSubTaskDescription: subTaskDesc,
        });
      });
      setEditedEntries(initial);
    } else {
      setEditedEntries(new Map());
    }
  }, [clientEntries, taskOverrides, subtaskOverrides]);

  const hasChanges = useMemo(() => {
    return Array.from(editedEntries.values()).some(
      e => e.totalDuration !== e.originalDuration ||
           e.billingLevel !== e.originalBillingLevel ||
           e.description !== e.originalDescription ||
           e.mainTaskDescription !== e.originalMainTaskDescription ||
           e.subTaskDescription !== e.originalSubTaskDescription
    );
  }, [editedEntries]);

  const updateMutation = useMutation({
    mutationFn: async (updates: EditedEntry[]) => {
      const promises: Promise<unknown>[] = [];
      const changedMainTasks = new Map<number, string>();
      const changedSubTasks = new Map<number, string>();

      updates.forEach(e => {
        if (e.totalDuration !== e.originalDuration ||
            e.billingLevel !== e.originalBillingLevel ||
            e.description !== e.originalDescription) {
          promises.push(
            apiRequest("PUT", `/api/time-entries/${e.id}`, {
              totalDuration: e.totalDuration,
              billingLevel: e.billingLevel,
              rateLevel: e.billingLevel, // keep in sync for legacy
              description: e.description,
            })
          );
        }
        if (e.mainTaskDescription !== e.originalMainTaskDescription) {
          changedMainTasks.set(e.mainTaskId, e.mainTaskDescription);
        }
        if (e.subTaskId && e.subTaskDescription !== e.originalSubTaskDescription) {
          changedSubTasks.set(e.subTaskId, e.subTaskDescription || "");
        }
      });

      changedMainTasks.forEach((description, mainTaskId) => {
        promises.push(apiRequest("POST", `/api/clients/${selectedClientId}/task-overrides`, { mainTaskId, description }));
      });
      changedSubTasks.forEach((description, subTaskId) => {
        promises.push(apiRequest("POST", `/api/clients/${selectedClientId}/subtask-overrides`, { subTaskId, description }));
      });

      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", selectedClientId, "task-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", selectedClientId, "subtask-overrides"] });
      toast({ title: "Success", description: "All changes saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleDurationChange = (entryId: number, value: string) => {
    const minutes = parseInt(value) || 0;
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) updated.set(entryId, { ...existing, totalDuration: minutes * 60 });
      return updated;
    });
  };

  const handleBillingLevelChange = (entryId: number, level: number | null) => {
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) updated.set(entryId, { ...existing, billingLevel: level });
      return updated;
    });
  };

  // Select all entries in a given level
  const handleSelectAllByLevel = (level: number | null) => {
    setEditedEntries(prev => {
      const updated = new Map(prev);
      updated.forEach((entry, id) => {
        updated.set(id, { ...entry, billingLevel: level });
      });
      return updated;
    });
  };

  const handleDescriptionChange = (entryId: number, value: string) => {
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) updated.set(entryId, { ...existing, description: value });
      return updated;
    });
  };

  const handleMainTaskChange = (entryId: number, value: string) => {
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) updated.set(entryId, { ...existing, mainTaskDescription: value });
      return updated;
    });
  };

  const handleSubTaskChange = (entryId: number, value: string) => {
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) updated.set(entryId, { ...existing, subTaskDescription: value });
      return updated;
    });
  };

  const handleSaveAll = () => updateMutation.mutate(Array.from(editedEntries.values()));

  const getDurationInMinutes = (seconds: number) => Math.round(seconds / 60);
  const selectedClient = activeClients.find((c: Client) => c.id === Number(selectedClientId));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary">Time Entries</h1>
          <p className="text-muted-foreground">View and edit time entries by client</p>
        </div>
        {hasChanges && (
          <Button onClick={handleSaveAll} disabled={updateMutation.isPending} className="gap-2">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save All Changes
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
          <CardDescription>Choose a client to view and manage their time entries</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] max-w-sm space-y-2">
              <Label>Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent>
                  {activeClients.map((client: Client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedClientId ? (
        <>
          <Alert className="bg-blue-50 border-blue-200">
            <AlertTriangle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              Task description edits are saved only for this client. Click a billing level column header to assign that level to all entries at once.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Time Entries — {selectedClient?.name || "Selected Client"}
              </CardTitle>
              <CardDescription>
                Edit time worked and assign billing levels per entry. Billing level is independent of who performed the work.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {entriesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : clientEntries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No time entries for this client yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Date</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-center">Time (mins)</TableHead>
                        {/* Clickable level headers — click to assign that level to ALL entries */}
                        {BILLING_LEVELS.map(({ value, label }) => (
                          <TableHead
                            key={String(value)}
                            className="text-center cursor-pointer hover:bg-slate-100 select-none group"
                            title={`Click to assign all entries to ${label}`}
                            onClick={() => handleSelectAllByLevel(value)}
                          >
                            <span className="group-hover:underline">{label}</span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientEntries.map((entry) => {
                        const edited = editedEntries.get(entry.id);
                        const currentDuration = edited?.totalDuration ?? entry.totalDuration;
                        const currentBillingLevel = edited !== undefined
                          ? edited.billingLevel
                          : (entry.billingLevel !== undefined ? entry.billingLevel : entry.rateLevel ?? null);

                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="whitespace-nowrap">
                              {new Date(entry.startTime).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {entry.employee?.firstName || entry.employee?.email || "Unknown"}
                            </TableCell>
                            <TableCell className="min-w-[180px]">
                              <div className="flex flex-col gap-1">
                                <Input
                                  type="text"
                                  className="w-full text-sm font-medium"
                                  value={edited?.mainTaskDescription ?? getEffectiveTaskDescription(entry)}
                                  onChange={(e) => handleMainTaskChange(entry.id, e.target.value)}
                                  placeholder="Main task..."
                                />
                                {(entry.subTask || edited?.subTaskDescription) && (
                                  <Input
                                    type="text"
                                    className="w-full text-xs"
                                    value={edited?.subTaskDescription ?? getEffectiveSubtaskDescription(entry) ?? ""}
                                    onChange={(e) => handleSubTaskChange(entry.id, e.target.value)}
                                    placeholder="Sub-task..."
                                  />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="min-w-[200px]">
                              <Input
                                type="text"
                                className="w-full"
                                value={edited?.description ?? entry.description ?? ""}
                                onChange={(e) => handleDescriptionChange(entry.id, e.target.value)}
                                placeholder="Add notes..."
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min="0"
                                className="w-20 mx-auto text-center"
                                value={getDurationInMinutes(currentDuration)}
                                onChange={(e) => handleDurationChange(entry.id, e.target.value)}
                              />
                            </TableCell>
                            {BILLING_LEVELS.map(({ value }) => (
                              <TableCell key={String(value)} className="text-center">
                                <Checkbox
                                  checked={currentBillingLevel === value}
                                  onCheckedChange={(checked) => {
                                    if (checked) handleBillingLevelChange(entry.id, value);
                                  }}
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {hasChanges && clientEntries.length > 0 && (
                <div className="flex justify-end mt-6 pt-4 border-t">
                  <Button onClick={handleSaveAll} disabled={updateMutation.isPending} className="gap-2">
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save All Changes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Please select a client above to view their time entries.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
