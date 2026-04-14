import { useState, useEffect, useMemo } from "react";
import { useRoute, Link, Redirect } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Save, Loader2, Clock, Building, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import type { Client, TimeEntry, MainTask, SubTask, User, ClientTaskOverride, ClientSubtaskOverride } from "@shared/schema";

type TimeEntryWithRelations = TimeEntry & {
  client: Client;
  mainTask: MainTask;
  subTask: SubTask | null;
  employee: User;
};

type EditedEntry = {
  id: number;
  totalDuration: number;
  rateLevel: number;
  description: string;
  mainTaskId: number;
  mainTaskDescription: string;
  subTaskId: number | null;
  subTaskDescription: string | null;
  originalDuration: number;
  originalRateLevel: number;
  originalDescription: string;
  originalMainTaskDescription: string;
  originalSubTaskDescription: string | null;
};

export default function ClientDetailPage() {
  const [, params] = useRoute("/admin/clients/:id");
  const clientId = params?.id ? parseInt(params.id) : null;
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  
  if (!permissions.canViewClientDetails) {
    return <Redirect to="/admin/clients" />;
  }

  const [editedEntries, setEditedEntries] = useState<Map<number, EditedEntry>>(new Map());

  const { data: client, isLoading: clientLoading } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch client");
      return res.json();
    },
    enabled: !!clientId,
  });

  const { data: clientEntries = [], isLoading: entriesLoading } = useQuery<TimeEntryWithRelations[]>({
    queryKey: ["/api/time-entries", "client", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/time-entries?clientId=${clientId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return res.json();
    },
    enabled: !!clientId,
    staleTime: 0,
  });

  const { data: taskOverrides = [] } = useQuery<ClientTaskOverride[]>({
    queryKey: ["/api/clients", clientId, "task-overrides"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/task-overrides`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId,
  });

  const { data: subtaskOverrides = [] } = useQuery<ClientSubtaskOverride[]>({
    queryKey: ["/api/clients", clientId, "subtask-overrides"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/subtask-overrides`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId,
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
        const level = entry.rateLevel ?? 1;
        const desc = entry.description || "";
        const mainTaskDesc = getEffectiveTaskDescription(entry);
        const subTaskDesc = getEffectiveSubtaskDescription(entry);
        initial.set(entry.id, {
          id: entry.id,
          totalDuration: duration,
          rateLevel: level,
          description: desc,
          mainTaskId: entry.mainTaskId,
          mainTaskDescription: mainTaskDesc,
          subTaskId: entry.subTaskId,
          subTaskDescription: subTaskDesc,
          originalDuration: duration,
          originalRateLevel: level,
          originalDescription: desc,
          originalMainTaskDescription: mainTaskDesc,
          originalSubTaskDescription: subTaskDesc,
        });
      });
      setEditedEntries(initial);
    }
  }, [clientEntries, taskOverrides, subtaskOverrides]);

  const hasChanges = useMemo(() => {
    const entries = Array.from(editedEntries.values());
    return entries.some(
      edited => edited.totalDuration !== edited.originalDuration || 
                edited.rateLevel !== edited.originalRateLevel ||
                edited.description !== edited.originalDescription ||
                edited.mainTaskDescription !== edited.originalMainTaskDescription ||
                edited.subTaskDescription !== edited.originalSubTaskDescription
    );
  }, [editedEntries]);

  const updateMutation = useMutation({
    mutationFn: async (updates: EditedEntry[]) => {
      const promises: Promise<unknown>[] = [];
      
      const changedMainTasks = new Map<number, string>();
      const changedSubTasks = new Map<number, string>();
      
      updates.forEach(e => {
        if (e.totalDuration !== e.originalDuration || 
            e.rateLevel !== e.originalRateLevel ||
            e.description !== e.originalDescription) {
          promises.push(
            apiRequest("PUT", `/api/time-entries/${e.id}`, {
              totalDuration: e.totalDuration,
              rateLevel: e.rateLevel,
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
        promises.push(
          apiRequest("POST", `/api/clients/${clientId}/task-overrides`, { mainTaskId, description })
        );
      });
      
      changedSubTasks.forEach((description, subTaskId) => {
        promises.push(
          apiRequest("POST", `/api/clients/${clientId}/subtask-overrides`, { subTaskId, description })
        );
      });
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "task-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "subtask-overrides"] });
      toast({
        title: "Success",
        description: "All changes saved successfully. Task descriptions are customized for this client only.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDurationChange = (entryId: number, value: string) => {
    const minutes = parseInt(value) || 0;
    const seconds = minutes * 60;
    
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) {
        updated.set(entryId, { ...existing, totalDuration: seconds });
      }
      return updated;
    });
  };

  const handleRateLevelChange = (entryId: number, level: number, checked: boolean) => {
    if (!checked) return;
    
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) {
        updated.set(entryId, { ...existing, rateLevel: level });
      }
      return updated;
    });
  };

  const handleDescriptionChange = (entryId: number, value: string) => {
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) {
        updated.set(entryId, { ...existing, description: value });
      }
      return updated;
    });
  };

  const handleMainTaskChange = (entryId: number, value: string) => {
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) {
        updated.set(entryId, { ...existing, mainTaskDescription: value });
      }
      return updated;
    });
  };

  const handleSubTaskChange = (entryId: number, value: string) => {
    setEditedEntries(prev => {
      const updated = new Map(prev);
      const existing = updated.get(entryId);
      if (existing) {
        updated.set(entryId, { ...existing, subTaskDescription: value });
      }
      return updated;
    });
  };

  const handleSaveAll = () => {
    const updates = Array.from(editedEntries.values());
    updateMutation.mutate(updates);
  };

  const getDurationInMinutes = (seconds: number) => {
    return Math.round(seconds / 60);
  };

  if (clientLoading || entriesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <Link href="/admin/clients">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Clients
          </Button>
        </Link>
        <p className="text-muted-foreground">Client not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/clients">
            <Button variant="ghost" size="icon" data-testid="button-back-clients">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-primary">{client.name}</h1>
                <p className="text-sm text-muted-foreground">{client.contactInfo || "No contact info"}</p>
              </div>
            </div>
          </div>
        </div>

        {hasChanges && (
          <Button 
            onClick={handleSaveAll}
            disabled={updateMutation.isPending}
            className="gap-2"
            data-testid="button-save-changes"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save All Changes
          </Button>
        )}
      </div>

      <Alert className="bg-blue-50 border-blue-200">
        <AlertTriangle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          Task description edits on this page are saved only for this client. They won't affect the standard tasks used in the Time Tracker or other clients.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Time Entries
          </CardTitle>
          <CardDescription>
            Edit time worked and assign rate levels for each entry. Task descriptions edited here are customized for this client only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clientEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No time entries for this client yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Time (mins)</TableHead>
                    <TableHead className="text-center">Level 1</TableHead>
                    <TableHead className="text-center">Level 2</TableHead>
                    <TableHead className="text-center">Level 3</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientEntries.map((entry) => {
                    const edited = editedEntries.get(entry.id);
                    const currentDuration = edited?.totalDuration ?? entry.totalDuration;
                    const taskReviewLevel = entry.mainTask?.reviewLevel ?? 1;
                    const currentRateLevel = edited?.rateLevel ?? entry.rateLevel ?? taskReviewLevel;

                    return (
                      <TableRow key={entry.id} data-testid={`row-time-entry-${entry.id}`}>
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
                              value={edited?.mainTaskDescription ?? entry.mainTask?.description ?? ""}
                              onChange={(e) => handleMainTaskChange(entry.id, e.target.value)}
                              placeholder="Main task..."
                              data-testid={`input-main-task-${entry.id}`}
                            />
                            {(entry.subTask || edited?.subTaskDescription) && (
                              <Input
                                type="text"
                                className="w-full text-xs"
                                value={edited?.subTaskDescription ?? entry.subTask?.description ?? ""}
                                onChange={(e) => handleSubTaskChange(entry.id, e.target.value)}
                                placeholder="Sub-task..."
                                data-testid={`input-sub-task-${entry.id}`}
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
                            placeholder="Add description..."
                            data-testid={`input-description-${entry.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            className="w-20 mx-auto text-center"
                            value={getDurationInMinutes(currentDuration)}
                            onChange={(e) => handleDurationChange(entry.id, e.target.value)}
                            data-testid={`input-duration-${entry.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={currentRateLevel === 1}
                            onCheckedChange={(checked) => handleRateLevelChange(entry.id, 1, !!checked)}
                            data-testid={`checkbox-level1-${entry.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={currentRateLevel === 2}
                            onCheckedChange={(checked) => handleRateLevelChange(entry.id, 2, !!checked)}
                            data-testid={`checkbox-level2-${entry.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={currentRateLevel === 3}
                            onCheckedChange={(checked) => handleRateLevelChange(entry.id, 3, !!checked)}
                            data-testid={`checkbox-level3-${entry.id}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {hasChanges && clientEntries.length > 0 && (
            <div className="flex justify-end mt-6 pt-4 border-t">
              <Button 
                onClick={handleSaveAll}
                disabled={updateMutation.isPending}
                className="gap-2"
                data-testid="button-save-changes-bottom"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save All Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
