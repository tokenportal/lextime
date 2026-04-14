import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTimeEntries, useCreateTimeEntry, useUpdateTimeEntry, useClients, useMainTasks, useSubTasks, useEmployeeClientAssignments } from "@/hooks/use-time-tracking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Play, Pause, Square, History, CheckSquare } from "lucide-react";
import { format, differenceInSeconds, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export default function Tracker() {
  const { user } = useAuth();
  
  // State for new entry
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedMainTask, setSelectedMainTask] = useState<string>("");
  const [selectedSubTask, setSelectedSubTask] = useState<string>("");
  const [selectedTaxYear, setSelectedTaxYear] = useState<string>("");
  const [description, setDescription] = useState("");
  
  // Timer States
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  
  // State for active entry from DB
  const [activeEntry, setActiveEntry] = useState<any>(null);

  // Queries
  const { data: allClients, isLoading: loadingClients } = useClients();
  const { data: clientAssignments } = useEmployeeClientAssignments(user?.id);
  const { data: mainTasks, isLoading: loadingMainTasks } = useMainTasks();
  const { data: subTasks, isLoading: loadingSubTasks } = useSubTasks(selectedMainTask ? parseInt(selectedMainTask) : null);
  
  // Use local timezone-aware date filtering
  const today = new Date();
  const { data: todayEntries, isLoading: loadingEntries } = useTimeEntries({
    employeeId: user?.id,
    startDate: startOfDay(today).toISOString(),
    endDate: endOfDay(today).toISOString(),
  }, { 
    refetchInterval: isRunning && !isPaused ? 5000 : false
  });

  // Filter clients based on assignments (exclude taskLevel = 0 which means "None"/no access)
  const clients = allClients?.filter((client: any) => {
    const assignment = clientAssignments?.find(a => a.clientId === client.id);
    // If there's an assignment with taskLevel = 0, hide this client
    if (assignment && assignment.taskLevel === 0) {
      return false;
    }
    return true;
  });

  // Mutations
  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();

  // Find active entry on load and sync state
  useEffect(() => {
    if (todayEntries) {
      const active = todayEntries.find((e: any) => e.status === "In Progress" || e.status === "Paused");
      if (active) {
        setActiveEntry(active);
        const isCurrentlyRunning = active.status === "In Progress";
        setIsRunning(true);
        setIsPaused(!isCurrentlyRunning);
        
        if (isCurrentlyRunning) {
          const start = new Date(active.startTime);
          const now = new Date();
          // Fix: ensure we use the current timezone difference correctly
          const diff = differenceInSeconds(now, start);
          setSeconds(diff > 0 ? diff : 0);
        } else {
          setSeconds(active.totalDuration || 0);
        }
        
        setSelectedClient(active.clientId.toString());
        setSelectedMainTask(active.mainTaskId.toString());
        setSelectedSubTask(active.subTaskId?.toString() || "");
        setSelectedTaxYear(active.taxYear?.toString() || "");
        setDescription(active.description || "");
      } else {
        // Only reset if we are not currently starting a new one
        if (!isRunning) {
          setActiveEntry(null);
          setIsRunning(false);
          setIsPaused(false);
          setSeconds(0);
        }
      }
    }
  }, [todayEntries]);

  // CRITICAL: REAL-TIME TIMER LOGIC
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && !isPaused) {
      interval = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, isPaused]);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStart = async () => {
    if (!selectedClient || !selectedMainTask) return;
    
    try {
      const entry = await createEntry.mutateAsync({
        employeeId: user!.id,
        clientId: parseInt(selectedClient),
        mainTaskId: parseInt(selectedMainTask),
        subTaskId: selectedSubTask ? parseInt(selectedSubTask) : undefined,
        taxYear: selectedTaxYear ? parseInt(selectedTaxYear) : undefined,
        description,
        startTime: new Date(),
        status: "In Progress",
      });
      
      setActiveEntry(entry);
      setIsRunning(true);
      setIsPaused(false);
      setSeconds(0);
    } catch (err) {
      console.error("Failed to start entry:", err);
    }
  };

  const handlePause = async () => {
    if (!activeEntry) {
      console.error("No active entry to pause");
      return;
    }
    try {
      await updateEntry.mutateAsync({
        id: activeEntry.id,
        status: "Paused",
        totalDuration: seconds,
      });
      setIsPaused(true);
    } catch (err) {
      console.error("Failed to pause entry:", err);
    }
  };

  const handleResume = async () => {
    if (!activeEntry) {
      console.error("No active entry to resume");
      return;
    }
    try {
      await updateEntry.mutateAsync({
        id: activeEntry.id,
        status: "In Progress",
      });
      setIsPaused(false);
    } catch (err) {
      console.error("Failed to resume entry:", err);
    }
  };

  const handleStop = async () => {
    if (!activeEntry) {
      console.error("No active entry to stop");
      return;
    }
    
    try {
      await updateEntry.mutateAsync({
        id: activeEntry.id,
        status: "Completed",
        endTime: new Date().toISOString(),
        totalDuration: seconds,
      });
      
      setIsRunning(false);
      setIsPaused(false);
      setSeconds(0);
      setActiveEntry(null);
      
      // Clear selections
      setSelectedClient("");
      setSelectedMainTask("");
      setSelectedSubTask("");
      setSelectedTaxYear("");
      setDescription("");
    } catch (err) {
      console.error("Failed to stop entry:", err);
    }
  };

  // Get the task level for the selected client from assignments
  const selectedClientAssignment = clientAssignments?.find(a => a.clientId === parseInt(selectedClient));
  const clientTaskLevel = selectedClientAssignment?.taskLevel ?? user?.reviewLevel ?? 1;
  
  const filteredMainTasks = mainTasks?.filter((t: any) => 
    t.status === "Active" && (t.reviewLevel ?? 1) === clientTaskLevel
  );

  return (
    <div className="max-w-xl mx-auto py-12 px-6">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-display font-bold text-primary mb-2">Time Tracker</h1>
        <p className="text-muted-foreground">{format(new Date(), "EEEE, MMMM do, yyyy")}</p>
      </div>

      <Card className="mb-8 border-none shadow-2xl bg-white overflow-hidden relative">
        <div className={cn(
          "absolute top-0 left-0 w-full h-1 transition-colors duration-500",
          (isRunning && !isPaused) ? "bg-green-500 animate-pulse" : 
          isPaused ? "bg-amber-500" : "bg-primary"
        )} />
        <CardContent className="p-8 space-y-6">
          {/* 1. Client dropdown */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</label>
            <Select value={selectedClient} onValueChange={(val) => { setSelectedClient(val); setSelectedMainTask(""); setSelectedSubTask(""); }} disabled={isRunning}>
              <SelectTrigger className="h-12 bg-slate-50 border-slate-200">
                <SelectValue placeholder="Select Client" />
              </SelectTrigger>
              <SelectContent>
                {loadingClients ? <div className="p-2 text-sm">Loading...</div> : 
                  clients?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>
          
          {/* 2. Main Task dropdown */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Main Task</label>
            <Select value={selectedMainTask} onValueChange={(val) => { setSelectedMainTask(val); setSelectedSubTask(""); }} disabled={isRunning}>
              <SelectTrigger className="h-12 bg-slate-50 border-slate-200">
                <SelectValue placeholder="Select Task" />
              </SelectTrigger>
              <SelectContent>
                {loadingMainTasks ? <div className="p-2 text-sm">Loading...</div> : 
                  filteredMainTasks?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id.toString()}>{t.description}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>

          {/* 3. Sub-task dropdown */}
          {selectedMainTask && subTasks && subTasks.length > 0 && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sub Task</label>
              <Select value={selectedSubTask} onValueChange={(val) => { setSelectedSubTask(val); setSelectedTaxYear(""); }} disabled={isRunning}>
                <SelectTrigger className="h-12 bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Select Sub Task" />
                </SelectTrigger>
                <SelectContent>
                  {subTasks.map((t: any) => (
                    <SelectItem key={t.id} value={t.id.toString()}>{t.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 4. Tax Year dropdown (if main task or sub-task requires it) */}
          {(() => {
            const selectedMainTaskObj = mainTasks?.find((t: any) => t.id.toString() === selectedMainTask);
            const selectedSubTaskObj = subTasks?.find((t: any) => t.id.toString() === selectedSubTask);
            
            // Show tax year if: main task requires it (and has no sub-tasks or no sub-task selected), OR selected sub-task requires it
            const mainTaskRequiresTaxYear = selectedMainTaskObj?.requiresTaxYear && (!selectedMainTaskObj?.hasSubTasks || !subTasks?.length);
            const subTaskRequiresTaxYear = selectedSubTaskObj?.requiresTaxYear;
            
            if (selectedMainTask && (mainTaskRequiresTaxYear || subTaskRequiresTaxYear)) {
              return (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tax Year</label>
                  <Select value={selectedTaxYear} onValueChange={setSelectedTaxYear} disabled={isRunning}>
                    <SelectTrigger className="h-12 bg-slate-50 border-slate-200">
                      <SelectValue placeholder="Select Tax Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            return null;
          })()}

          {/* 5. Notes field */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
            <Textarea 
              className="bg-slate-50 border-slate-200 min-h-[100px] transition-all focus:min-h-[120px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isRunning}
            />
          </div>

          {/* 5. Timer display */}
          <div className="py-8 flex flex-col items-center justify-center space-y-2">
            <div className={cn(
              "text-6xl font-mono font-medium tracking-tight tabular-nums transition-colors duration-500",
              (isRunning && !isPaused) ? "text-green-600" : 
              isPaused ? "text-amber-600" : "text-primary"
            )}>
              {formatTime(seconds)}
            </div>
            {isRunning && !isPaused && (
              <div className="flex items-center gap-2 text-green-600 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-current" />
                <span className="text-xs font-bold uppercase tracking-widest">Running</span>
              </div>
            )}
            {isPaused && (
              <div className="flex items-center gap-2 text-amber-600">
                <div className="w-2 h-2 rounded-full bg-current" />
                <span className="text-xs font-bold uppercase tracking-widest">Paused</span>
              </div>
            )}
          </div>

          {/* 6. Buttons */}
          <div className="pt-2">
            {!isRunning && (
              <Button 
                onClick={handleStart} 
                className="w-full h-16 text-xl font-bold rounded-xl bg-green-600 hover:bg-green-700 shadow-xl shadow-green-600/20 transition-all active:scale-[0.98]"
                disabled={!selectedClient || !selectedMainTask || createEntry.isPending}
              >
                <Play className="w-6 h-6 mr-3 fill-current" />
                START
              </Button>
            )}

            {isRunning && !isPaused && (
              <div className="flex gap-4">
                <Button 
                  onClick={handlePause} 
                  variant="outline"
                  className="flex-1 h-16 text-lg font-bold rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
                  disabled={updateEntry.isPending}
                >
                  <Pause className="w-6 h-6 mr-3 fill-current" />
                  PAUSE
                </Button>
                <Button 
                  onClick={handleStop} 
                  variant="destructive"
                  className="flex-1 h-16 text-lg font-bold rounded-xl shadow-lg shadow-red-600/20"
                  disabled={updateEntry.isPending}
                >
                  <Square className="w-6 h-6 mr-3 fill-current" />
                  STOP
                </Button>
              </div>
            )}

            {isRunning && isPaused && (
              <div className="flex gap-4">
                <Button 
                  onClick={handleResume} 
                  className="flex-1 h-16 text-lg font-bold rounded-xl bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
                  disabled={updateEntry.isPending}
                >
                  <Play className="w-6 h-6 mr-3 fill-current" />
                  RESUME
                </Button>
                <Button 
                  onClick={handleStop} 
                  variant="destructive"
                  className="flex-1 h-16 text-lg font-bold rounded-xl shadow-lg shadow-red-600/20"
                  disabled={updateEntry.isPending}
                >
                  <Square className="w-6 h-6 mr-3 fill-current" />
                  STOP
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Entries */}
      <div className="space-y-4">
        <h3 className="text-lg font-display font-bold text-primary flex items-center gap-2">
          <History className="w-5 h-5 text-accent" />
          Today's Entries
        </h3>
        
        {loadingEntries ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : todayEntries?.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
            <p className="text-muted-foreground">No entries recorded today.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {todayEntries?.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
                <p className="text-muted-foreground font-cinzel">No entries recorded today.</p>
              </div>
            ) : (
              todayEntries?.map((entry: any) => (
                <div key={entry.id} className={cn(
                  "p-4 rounded-xl border transition-all flex justify-between items-center hover:shadow-md",
                  entry.status === "Completed" ? "bg-white border-slate-100 shadow-sm" : "bg-green-50 border-green-100 shadow-sm"
                )}>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      entry.status === "Completed" ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-600 animate-pulse"
                    )}>
                      {entry.status === "Completed" ? <CheckSquare className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="font-semibold text-primary truncate">{entry.client.name}</h4>
                      <p className="text-sm text-muted-foreground truncate">
                        {entry.mainTask.description}
                        {entry.subTask && ` • ${entry.subTask.description}`}
                        {entry.status !== "Completed" && " (Current)"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-medium text-lg">
                      {entry.status === "Completed" ? formatTime(entry.totalDuration) : formatTime(seconds)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.startTime), "h:mm a")} - {entry.endTime ? format(new Date(entry.endTime), "h:mm a") : 'Running'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
