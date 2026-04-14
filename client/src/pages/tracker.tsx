import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTimeEntries, useCreateTimeEntry, useUpdateTimeEntry, useClients, useMainTasks, useSubTasks, useEmployeeClientAssignments } from "@/hooks/use-time-tracking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Play, Pause, Square, History, CheckSquare, WifiOff, Pencil, Check, X } from "lucide-react";
import { format, differenceInSeconds, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { roundSecondsToHours, formatTimer } from "@/lib/time-utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

const INACTIVITY_MINUTES = 30;
const WRITE_IN_ID = "__write_in__";
const TRAINING_ID = "__training__";

export default function Tracker() {
  const { user } = useAuth();

  // Form state
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedMainTask, setSelectedMainTask] = useState<string>("");
  const [selectedSubTask, setSelectedSubTask] = useState<string>("");
  const [selectedTaxYear, setSelectedTaxYear] = useState<string>("");
  const [description, setDescription] = useState("");
  const [writeInText, setWriteInText] = useState(""); // for write-in tasks

  // Timer state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [activeEntry, setActiveEntry] = useState<any>(null);

  // Offline state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const offlineSecondsRef = useRef(0); // accumulate while offline

  // 30-min popup
  const [showInactivityDialog, setShowInactivityDialog] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());

  // Editable notes on completed entries
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  // Queries
  const { data: allClients, isLoading: loadingClients } = useClients();
  const { data: clientAssignments } = useEmployeeClientAssignments(user?.id);
  const { data: mainTasks, isLoading: loadingMainTasks } = useMainTasks();
  const { data: subTasks, isLoading: loadingSubTasks } = useSubTasks(selectedMainTask && selectedMainTask !== WRITE_IN_ID && selectedMainTask !== TRAINING_ID ? parseInt(selectedMainTask) : null);

  const today = new Date();
  const { data: todayEntries, isLoading: loadingEntries } = useTimeEntries({
    employeeId: user?.id,
    startDate: startOfDay(today).toISOString(),
    endDate: endOfDay(today).toISOString(),
  }, {
    refetchInterval: isRunning && !isPaused ? 5000 : false,
  });

  // Filter clients — exclude taskLevel=0 and sort alphabetically
  const clients = allClients
    ?.filter((client: any) => {
      const assignment = clientAssignments?.find(a => a.clientId === client.id);
      return !(assignment && assignment.taskLevel === 0);
    })
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  // Mutations
  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();

  // ── Sync active entry from DB on load ──────────────────────────────────────
  useEffect(() => {
    if (todayEntries) {
      const active = todayEntries.find((e: any) => e.status === "In Progress" || e.status === "Paused");
      if (active) {
        setActiveEntry(active);
        setIsRunning(true);
        setIsPaused(active.status === "Paused");
        if (active.status === "In Progress") {
          const diff = differenceInSeconds(new Date(), new Date(active.startTime));
          setSeconds(Math.max(0, diff - (active.pausedDuration || 0)));
        } else {
          setSeconds(active.totalDuration || 0);
        }
        setSelectedClient(active.clientId.toString());
        setSelectedMainTask(active.mainTaskId.toString());
        setSelectedSubTask(active.subTaskId?.toString() || "");
        setSelectedTaxYear(active.taxYear?.toString() || "");
        setDescription(active.description || "");
      } else if (!isRunning) {
        setActiveEntry(null);
        setIsRunning(false);
        setIsPaused(false);
        setSeconds(0);
      }
    }
  }, [todayEntries]);

  // ── Real-time ticker ───────────────────────────────────────────────────────
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && !isPaused) {
      interval = setInterval(() => {
        setSeconds(prev => prev + 1);
        // Track inactivity for 30-min popup
        const elapsed = (Date.now() - lastActivityRef.current) / 1000 / 60;
        if (elapsed >= INACTIVITY_MINUTES && !showInactivityDialog) {
          setShowInactivityDialog(true);
        }
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isRunning, isPaused, showInactivityDialog]);

  // ── Offline detection ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleOffline = () => setIsOnline(false);
    const handleOnline = async () => {
      setIsOnline(true);
      // Sync accumulated offline seconds to server
      if (activeEntry && offlineSecondsRef.current > 0) {
        const newTotal = seconds;
        try {
          await updateEntry.mutateAsync({ id: activeEntry.id, totalDuration: newTotal });
        } catch (e) {
          console.warn("Failed to sync offline time:", e);
        }
        offlineSecondsRef.current = 0;
      }
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [activeEntry, seconds]);

  // Track offline time locally
  useEffect(() => {
    if (!isOnline && isRunning && !isPaused) {
      offlineSecondsRef.current += 1;
    }
  }, [seconds]);

  // ── Timer actions ──────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!selectedClient || !selectedMainTask) return;
    lastActivityRef.current = Date.now();
    const isWriteIn = selectedMainTask === WRITE_IN_ID;
    const isTraining = selectedMainTask === TRAINING_ID;

    try {
      let mainTaskId: number;
      let finalDescription = description;

      if (isWriteIn) {
        // Use a special write-in task marker — for now store it as a description only
        // If no write-in task exists in DB, use first task as placeholder
        // The write-in text goes into description
        const firstTask = mainTasks?.[0];
        if (!firstTask) return;
        mainTaskId = firstTask.id;
        finalDescription = writeInText ? `[Write-in] ${writeInText}${description ? ` — ${description}` : ""}` : description;
      } else if (isTraining) {
        const trainingTask = mainTasks?.find((t: any) => t.description.toLowerCase().includes("training"));
        const firstTask = mainTasks?.[0];
        mainTaskId = (trainingTask?.id || firstTask?.id) as number;
        finalDescription = `[Training]${description ? ` — ${description}` : ""}`;
      } else {
        mainTaskId = parseInt(selectedMainTask);
      }

      const entry = await createEntry.mutateAsync({
        employeeId: user!.id,
        clientId: parseInt(selectedClient),
        mainTaskId,
        subTaskId: selectedSubTask ? parseInt(selectedSubTask) : undefined,
        taxYear: selectedTaxYear ? parseInt(selectedTaxYear) : undefined,
        description: finalDescription,
        startTime: new Date(),
        status: "In Progress",
        isWriteIn,
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
    if (!activeEntry) return;
    try {
      await updateEntry.mutateAsync({ id: activeEntry.id, status: "Paused", totalDuration: seconds });
      setIsPaused(true);
    } catch (err) {
      console.error("Failed to pause:", err);
    }
  };

  const handleResume = async () => {
    if (!activeEntry) return;
    lastActivityRef.current = Date.now();
    try {
      await updateEntry.mutateAsync({ id: activeEntry.id, status: "In Progress" });
      setIsPaused(false);
    } catch (err) {
      console.error("Failed to resume:", err);
    }
  };

  const handleStop = async () => {
    if (!activeEntry) return;
    // Apply rounding
    const roundedHours = roundSecondsToHours(seconds);
    const roundedSeconds = Math.round(roundedHours * 3600);
    try {
      await updateEntry.mutateAsync({
        id: activeEntry.id,
        status: "Completed",
        endTime: new Date().toISOString(),
        totalDuration: roundedSeconds,
      });
      setIsRunning(false);
      setIsPaused(false);
      setSeconds(0);
      setActiveEntry(null);
      setSelectedClient("");
      setSelectedMainTask("");
      setSelectedSubTask("");
      setSelectedTaxYear("");
      setDescription("");
      setWriteInText("");
    } catch (err) {
      console.error("Failed to stop:", err);
    }
  };

  // 30-min popup handlers
  const handleInactivityContinue = () => {
    lastActivityRef.current = Date.now();
    setShowInactivityDialog(false);
  };

  const handleInactivityStop = async () => {
    setShowInactivityDialog(false);
    await handleStop();
  };

  // Editable notes handlers
  const startEditNote = (entry: any) => {
    setEditingNoteId(entry.id);
    setEditingNoteText(entry.description || "");
  };

  const saveNote = async (entryId: number) => {
    try {
      await apiRequest("PUT", `/api/time-entries/${entryId}`, { description: editingNoteText });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setEditingNoteId(null);
    } catch (e) {
      console.error("Failed to save note:", e);
    }
  };

  const cancelEditNote = () => setEditingNoteId(null);

  // Task lists — alphabetized
  const selectedClientAssignment = clientAssignments?.find(a => a.clientId === parseInt(selectedClient));
  const clientTaskLevel = selectedClientAssignment?.taskLevel ?? user?.reviewLevel ?? 1;

  const filteredMainTasks = mainTasks
    ?.filter((t: any) => t.status === "Active" && (t.reviewLevel ?? 1) === clientTaskLevel)
    .sort((a: any, b: any) => a.description.localeCompare(b.description));

  const sortedSubTasks = subTasks
    ?.filter((t: any) => t.status === "Active")
    .sort((a: any, b: any) => a.description.localeCompare(b.description));

  return (
    <div className="max-w-xl mx-auto py-12 px-6">
      {/* Offline banner */}
      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-2 rounded-lg text-sm font-medium">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          You're offline. Timer is still running locally and will sync when connection is restored.
        </div>
      )}

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

          {/* Client */}
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

          {/* Main Task */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Task</label>
            <Select value={selectedMainTask} onValueChange={(val) => { setSelectedMainTask(val); setSelectedSubTask(""); setWriteInText(""); }} disabled={isRunning}>
              <SelectTrigger className="h-12 bg-slate-50 border-slate-200">
                <SelectValue placeholder="Select Task" />
              </SelectTrigger>
              <SelectContent>
                {loadingMainTasks ? <div className="p-2 text-sm">Loading...</div> :
                  <>
                    {filteredMainTasks?.map((t: any) => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.description}</SelectItem>
                    ))}
                    <SelectItem value={TRAINING_ID}>Training</SelectItem>
                    <SelectItem value={WRITE_IN_ID}>Write-in (Custom Task)</SelectItem>
                  </>
                }
              </SelectContent>
            </Select>
          </div>

          {/* Write-in text field */}
          {selectedMainTask === WRITE_IN_ID && !isRunning && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Task Description</label>
              <Input
                className="h-12 bg-slate-50 border-slate-200"
                placeholder="Describe the custom task..."
                value={writeInText}
                onChange={(e) => setWriteInText(e.target.value)}
              />
            </div>
          )}

          {/* Sub-task */}
          {selectedMainTask && selectedMainTask !== WRITE_IN_ID && selectedMainTask !== TRAINING_ID && sortedSubTasks && sortedSubTasks.length > 0 && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sub Task</label>
              <Select value={selectedSubTask} onValueChange={(val) => { setSelectedSubTask(val); setSelectedTaxYear(""); }} disabled={isRunning}>
                <SelectTrigger className="h-12 bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Select Sub Task" />
                </SelectTrigger>
                <SelectContent>
                  {sortedSubTasks.map((t: any) => (
                    <SelectItem key={t.id} value={t.id.toString()}>{t.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tax Year */}
          {(() => {
            const selectedMainTaskObj = mainTasks?.find((t: any) => t.id.toString() === selectedMainTask);
            const selectedSubTaskObj = subTasks?.find((t: any) => t.id.toString() === selectedSubTask);
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

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
            <Textarea
              className="bg-slate-50 border-slate-200 min-h-[80px] transition-all focus:min-h-[100px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes about this work..."
            />
          </div>

          {/* Timer display */}
          <div className="py-8 flex flex-col items-center justify-center space-y-2">
            <div className={cn(
              "text-6xl font-mono font-medium tracking-tight tabular-nums transition-colors duration-500",
              (isRunning && !isPaused) ? "text-green-600" :
              isPaused ? "text-amber-600" : "text-primary"
            )}>
              {formatTimer(seconds)}
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
            {isRunning && (
              <div className="text-xs text-muted-foreground mt-1">
                ≈ {roundSecondsToHours(seconds).toFixed(2)} billable hours (rounded)
              </div>
            )}
          </div>

          {/* Buttons */}
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
            {todayEntries?.map((entry: any) => (
              <div key={entry.id} className={cn(
                "p-4 rounded-xl border transition-all hover:shadow-md",
                entry.status === "Completed" ? "bg-white border-slate-100 shadow-sm" : "bg-green-50 border-green-100 shadow-sm"
              )}>
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                      entry.status === "Completed" ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-600 animate-pulse"
                    )}>
                      {entry.status === "Completed" ? <CheckSquare className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-primary truncate">{entry.client?.name}</h4>
                      <p className="text-sm text-muted-foreground truncate">
                        {entry.mainTask?.description}
                        {entry.subTask && ` • ${entry.subTask.description}`}
                        {entry.status !== "Completed" && " (Current)"}
                      </p>

                      {/* Editable notes */}
                      {entry.status === "Completed" && (
                        <div className="mt-2">
                          {editingNoteId === entry.id ? (
                            <div className="flex gap-2 items-start">
                              <Textarea
                                className="text-sm min-h-[60px] flex-1"
                                value={editingNoteText}
                                onChange={e => setEditingNoteText(e.target.value)}
                                autoFocus
                              />
                              <div className="flex flex-col gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => saveNote(entry.id)}>
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={cancelEditNote}>
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group">
                              <p className="text-xs text-muted-foreground italic">
                                {entry.description || "No notes"}
                              </p>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => startEditNote(entry)}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="font-mono font-medium text-lg">
                      {entry.status === "Completed"
                        ? `${roundSecondsToHours(entry.totalDuration).toFixed(2)}h`
                        : formatTimer(seconds)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.startTime), "h:mm a")} – {entry.endTime ? format(new Date(entry.endTime), "h:mm a") : "Running"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 30-minute inactivity dialog */}
      <AlertDialog open={showInactivityDialog} onOpenChange={setShowInactivityDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Still working?</AlertDialogTitle>
            <AlertDialogDescription>
              Your timer has been running for {INACTIVITY_MINUTES} minutes. Are you still working on this task?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleInactivityStop}>Stop Timer</AlertDialogCancel>
            <AlertDialogAction onClick={handleInactivityContinue}>Continue Working</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
