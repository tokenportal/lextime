import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { TimeEntry, Client, MainTask, SubTask, InsertTimeEntry } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useTimeEntries(
  filters?: { employeeId?: string, clientId?: number, startDate?: string, endDate?: string },
  options?: { refetchInterval?: number | false }
) {
  const queryKey = [api.timeEntries.list.path, filters];
  return useQuery({
    queryKey,
    queryFn: async () => {
      const url = filters 
        ? buildUrl(api.timeEntries.list.path) + '?' + new URLSearchParams(filters as any).toString()
        : api.timeEntries.list.path;
      
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return api.timeEntries.list.responses[200].parse(await res.json());
    },
    refetchInterval: options?.refetchInterval,
  });
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: InsertTimeEntry) => {
      const res = await fetch(api.timeEntries.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create time entry");
      return api.timeEntries.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [api.timeEntries.list.path],
        refetchType: 'all'
      });
      toast({ title: "Success", description: "Time entry created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<Omit<InsertTimeEntry, 'endTime'>> & { status?: string, totalDuration?: number, pausedDuration?: number, endTime?: string | Date | null }) => {
      const url = buildUrl(api.timeEntries.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update time entry");
      return api.timeEntries.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      // Use refetchType: 'all' to force refetch of all matching queries including filtered ones
      queryClient.invalidateQueries({ 
        queryKey: [api.timeEntries.list.path],
        refetchType: 'all'
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.timeEntries.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete time entry");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [api.timeEntries.list.path],
        refetchType: 'all'
      });
      toast({ title: "Deleted", description: "Time entry removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}

export function useClients() {
  return useQuery({
    queryKey: [api.clients.list.path],
    queryFn: async () => {
      const res = await fetch(api.clients.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return api.clients.list.responses[200].parse(await res.json());
    },
  });
}

export function useMainTasks() {
  return useQuery({
    queryKey: [api.tasks.listMain.path],
    queryFn: async () => {
      const res = await fetch(api.tasks.listMain.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return api.tasks.listMain.responses[200].parse(await res.json());
    },
  });
}

export function useSubTasks(mainTaskId: number | null) {
  return useQuery({
    queryKey: [api.tasks.listSub.path, mainTaskId],
    enabled: !!mainTaskId,
    queryFn: async () => {
      if (!mainTaskId) return [];
      const url = buildUrl(api.tasks.listSub.path, { id: mainTaskId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sub-tasks");
      return api.tasks.listSub.responses[200].parse(await res.json());
    },
  });
}

export function useEmployeeClientAssignments(employeeId: string | undefined) {
  return useQuery<{ clientId: number; taskLevel: number | null }[]>({
    queryKey: ['/api/client-assignments', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      if (!employeeId) return [];
      const res = await fetch(`/api/client-assignments/${employeeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return res.json();
    },
  });
}
