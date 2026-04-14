import { useState, Fragment, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { api, buildUrl } from "@shared/routes";
import { GripVertical, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Download, Upload, Loader2 } from "lucide-react";
import type { MainTask, SubTask } from "@shared/schema";

function SortableTaskRow({ task, onEdit, onDelete, onToggleExpand, isExpanded, subTasks }: {
  task: MainTask;
  onEdit: (task: MainTask) => void;
  onDelete: (id: number) => void;
  onToggleExpand: (id: number) => void;
  isExpanded: boolean;
  subTasks: SubTask[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} data-testid={`row-task-${task.id}`}>
      <TableCell className="w-10">
        <button {...attributes} {...listeners} className="cursor-grab p-1 hover:bg-muted rounded" data-testid={`drag-task-${task.id}`}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell>
        {task.hasSubTasks && (
          <button onClick={() => onToggleExpand(task.id)} className="mr-2" data-testid={`expand-task-${task.id}`}>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
        <span className="text-sm" data-testid={`text-task-description-${task.id}`}>{task.description}</span>
      </TableCell>
      <TableCell>
        <Badge variant={task.reviewLevel === 1 ? "default" : task.reviewLevel === 2 ? "secondary" : "outline"} data-testid={`badge-task-level-${task.id}`}>
          Level {task.reviewLevel}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={task.status === "Active" ? "default" : "secondary"} data-testid={`badge-task-status-${task.id}`}>
          {task.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" onClick={() => onEdit(task)} data-testid={`button-edit-task-${task.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(task.id)} data-testid={`button-delete-task-${task.id}`}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SortableSubTaskRow({ subTask, onEdit, onDelete }: {
  subTask: SubTask;
  onEdit: (subTask: SubTask) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subTask.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="bg-muted/30" data-testid={`row-subtask-${subTask.id}`}>
      <TableCell className="w-10 pl-8">
        <button {...attributes} {...listeners} className="cursor-grab p-1 hover:bg-muted rounded" data-testid={`drag-subtask-${subTask.id}`}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="pl-12">
        <span className="text-sm text-muted-foreground" data-testid={`text-subtask-description-${subTask.id}`}>{subTask.description}</span>
      </TableCell>
      <TableCell>
        {subTask.requiresTaxYear && (
          <Badge variant="outline" data-testid={`badge-subtask-taxyear-${subTask.id}`}>
            Tax Year
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={subTask.status === "Active" ? "default" : "secondary"} data-testid={`badge-subtask-status-${subTask.id}`}>
          {subTask.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" onClick={() => onEdit(subTask)} data-testid={`button-edit-subtask-${subTask.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(subTask.id)} data-testid={`button-delete-subtask-${subTask.id}`}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function StandardTasksPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  if (!permissions.canAccessTasks) {
    return <Redirect to={permissions.canAccessTimeTracker ? "/tracker" : "/admin/clients"} />;
  }
  
  const [activeLevel, setActiveLevel] = useState<string>("1");
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [editingTask, setEditingTask] = useState<MainTask | null>(null);
  const [editingSubTask, setEditingSubTask] = useState<SubTask | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingSubTask, setIsAddingSubTask] = useState<number | null>(null);
  const [newTask, setNewTask] = useState({ description: "", reviewLevel: 1, hasSubTasks: false });
  const [newSubTask, setNewSubTask] = useState({ description: "", requiresTaxYear: false });
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: mainTasks = [] } = useQuery<MainTask[]>({
    queryKey: [api.tasks.listMain.path],
    queryFn: async () => {
      const res = await fetch(api.tasks.listMain.path, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: allSubTasks = [] } = useQuery<SubTask[]>({
    queryKey: ["/api/tasks/sub/all"],
    queryFn: async () => {
      const res = await fetch("/api/tasks/sub/all", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const getSubTasks = (taskId: number): SubTask[] => {
    return allSubTasks.filter(s => s.mainTaskId === taskId).sort((a, b) => a.displayOrder - b.displayOrder);
  };

  const createTaskMutation = useMutation({
    mutationFn: async (data: { description: string; reviewLevel: number; hasSubTasks: boolean }) => {
      const res = await fetch(api.tasks.createMain.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, displayOrder: mainTasks.length + 1, status: "Active" }),
        credentials: "include",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.listMain.path] });
      toast({ title: "Success", description: "Task created" });
      setIsAddingTask(false);
      setNewTask({ description: "", reviewLevel: 1, hasSubTasks: false });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; description?: string; reviewLevel?: number; hasSubTasks?: boolean; status?: string; requiresTaxYear?: boolean }) => {
      const res = await fetch(buildUrl(api.tasks.updateMain.path, { id }), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to update task");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.listMain.path] });
      toast({ title: "Success", description: "Task updated" });
      setEditingTask(null);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tasks/main/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete task");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.listMain.path] });
      toast({ title: "Success", description: "Task deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const reorderTasksMutation = useMutation({
    mutationFn: async (taskIds: number[]) => {
      await fetch("/api/tasks/main/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds }),
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.listMain.path] });
    },
  });

  const createSubTaskMutation = useMutation({
    mutationFn: async (data: { mainTaskId: number; description: string; requiresTaxYear: boolean }) => {
      const subTasks = getSubTasks(data.mainTaskId);
      const res = await fetch(api.tasks.createSub.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, displayOrder: subTasks.length + 1, status: "Active" }),
        credentials: "include",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/sub/all"] });
      toast({ title: "Success", description: "Sub-task created" });
      setIsAddingSubTask(null);
      setNewSubTask({ description: "", requiresTaxYear: false });
    },
  });

  const updateSubTaskMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; description?: string; status?: string; requiresTaxYear?: boolean }) => {
      const res = await fetch(buildUrl(api.tasks.updateSub.path, { id }), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/sub/all"] });
      toast({ title: "Success", description: "Sub-task updated" });
      setEditingSubTask(null);
    },
  });

  const deleteSubTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tasks/sub/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete sub-task");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/sub/all"] });
      toast({ title: "Success", description: "Sub-task deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const reorderSubTasksMutation = useMutation({
    mutationFn: async ({ mainTaskId, subTaskIds }: { mainTaskId: number; subTaskIds: number[] }) => {
      await fetch("/api/tasks/sub/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainTaskId, subTaskIds }),
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/sub/all"] });
    },
  });

  const handleDragEnd = (level: number) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const levelTasks = mainTasks.filter(t => t.reviewLevel === level);
    const oldIndex = levelTasks.findIndex(t => t.id === active.id);
    const newIndex = levelTasks.findIndex(t => t.id === over.id);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const reorderedLevelTasks = arrayMove(levelTasks, oldIndex, newIndex);
      // Keep tasks from other levels in their original position, update only this level's order
      const otherTasks = mainTasks.filter(t => t.reviewLevel !== level);
      const allReordered = [...otherTasks, ...reorderedLevelTasks];
      reorderTasksMutation.mutate(allReordered.map(t => t.id));
    }
  };
  
  // Filter tasks by level
  const getTasksByLevel = (level: number) => mainTasks.filter(t => t.reviewLevel === level);

  const handleSubTaskDragEnd = (taskId: number) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const subTasks = getSubTasks(taskId);
    const oldIndex = subTasks.findIndex(t => t.id === active.id);
    const newIndex = subTasks.findIndex(t => t.id === over.id);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(subTasks, oldIndex, newIndex);
      reorderSubTasksMutation.mutate({ mainTaskId: taskId, subTaskIds: reordered.map(t => t.id) });
    }
  };

  const toggleExpand = (taskId: number) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/tasks/export', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to export tasks');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tasks-export.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: 'Success', description: 'Tasks exported successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to export tasks', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/tasks/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to import tasks');
      }
      
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: [api.tasks.listMain.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/sub/all'] });
      
      toast({ 
        title: 'Import Complete', 
        description: `Imported ${result.tasksCreated} main tasks and ${result.subTasksCreated} sub-tasks` 
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary">Standard Tasks</h1>
          <p className="text-muted-foreground">Manage the master list of tasks available for time tracking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || mainTasks.length === 0}
            data-testid="button-export-tasks"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            data-testid="button-import-tasks"
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImport}
            className="hidden"
            data-testid="input-import-file"
          />
          <Dialog open={isAddingTask} onOpenChange={setIsAddingTask}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-task">
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Enter task description"
                  data-testid="input-new-task-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">Review Level</Label>
                <Select
                  value={String(newTask.reviewLevel)}
                  onValueChange={(v) => setNewTask({ ...newTask, reviewLevel: parseInt(v) })}
                >
                  <SelectTrigger data-testid="select-new-task-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Level 1 - First-level Review</SelectItem>
                    <SelectItem value="2">Level 2 - Second-level Review</SelectItem>
                    <SelectItem value="3">Level 3 - Attorney Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="hasSubTasks"
                  checked={newTask.hasSubTasks}
                  onCheckedChange={(v) => setNewTask({ ...newTask, hasSubTasks: v })}
                  data-testid="switch-new-task-has-subtasks"
                />
                <Label htmlFor="hasSubTasks">Has Sub-tasks</Label>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={() => createTaskMutation.mutate(newTask)} disabled={!newTask.description} data-testid="button-save-new-task">
                Create Task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task List</CardTitle>
          <CardDescription>Drag tasks to reorder. Click the arrow to expand sub-tasks.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeLevel} onValueChange={(v) => { setActiveLevel(v); setNewTask(prev => ({ ...prev, reviewLevel: parseInt(v) })); }}>
            <TabsList className="mb-4">
              <TabsTrigger value="1" data-testid="tab-level-1">Level 1 - First Review</TabsTrigger>
              <TabsTrigger value="2" data-testid="tab-level-2">Level 2 - Second Review</TabsTrigger>
              <TabsTrigger value="3" data-testid="tab-level-3">Level 3 - Attorney</TabsTrigger>
            </TabsList>
            
            {[1, 2, 3].map((level) => (
              <TabsContent key={level} value={String(level)}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(level)}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <SortableContext items={getTasksByLevel(level).map(t => t.id)} strategy={verticalListSortingStrategy}>
                        {getTasksByLevel(level).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              No Level {level} tasks yet. Click "Add Task" to create one.
                            </TableCell>
                          </TableRow>
                        ) : (
                          getTasksByLevel(level).map((task) => (
                            <Fragment key={task.id}>
                              <SortableTaskRow
                                task={task}
                                onEdit={setEditingTask}
                                onDelete={(id) => deleteTaskMutation.mutate(id)}
                                onToggleExpand={toggleExpand}
                                isExpanded={expandedTasks.has(task.id)}
                                subTasks={getSubTasks(task.id)}
                              />
                              {task.hasSubTasks && expandedTasks.has(task.id) && (
                                <Fragment key={`subtasks-${task.id}`}>
                                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubTaskDragEnd(task.id)}>
                                    <SortableContext items={getSubTasks(task.id).map(s => s.id)} strategy={verticalListSortingStrategy}>
                                      {getSubTasks(task.id).map((subTask) => (
                                        <SortableSubTaskRow
                                          key={subTask.id}
                                          subTask={subTask}
                                          onEdit={setEditingSubTask}
                                          onDelete={(id) => deleteSubTaskMutation.mutate(id)}
                                        />
                                      ))}
                                    </SortableContext>
                                  </DndContext>
                                  <TableRow className="bg-muted/20" key={`add-subtask-${task.id}`}>
                                    <TableCell colSpan={5} className="py-2">
                                      <Button variant="ghost" size="sm" onClick={() => setIsAddingSubTask(task.id)} className="ml-8" data-testid={`button-add-subtask-${task.id}`}>
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add Sub-task
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                </Fragment>
                              )}
                            </Fragment>
                          ))
                        )}
                      </SortableContext>
                    </TableBody>
                  </Table>
                </DndContext>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!editingTask} onOpenChange={(v) => !v && setEditingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={editingTask.description}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  data-testid="input-edit-task-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-level">Review Level</Label>
                <Select
                  value={String(editingTask.reviewLevel)}
                  onValueChange={(v) => setEditingTask({ ...editingTask, reviewLevel: parseInt(v) })}
                >
                  <SelectTrigger data-testid="select-edit-task-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Level 1 - First-level Review</SelectItem>
                    <SelectItem value="2">Level 2 - Second-level Review</SelectItem>
                    <SelectItem value="3">Level 3 - Attorney Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editingTask.status}
                  onValueChange={(v) => setEditingTask({ ...editingTask, status: v })}
                >
                  <SelectTrigger data-testid="select-edit-task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-hasSubTasks"
                  checked={editingTask.hasSubTasks}
                  onCheckedChange={(v) => setEditingTask({ ...editingTask, hasSubTasks: v })}
                  data-testid="switch-edit-task-has-subtasks"
                />
                <Label htmlFor="edit-hasSubTasks">Has Sub-tasks</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-requiresTaxYear"
                  checked={editingTask.requiresTaxYear}
                  onCheckedChange={(v) => setEditingTask({ ...editingTask, requiresTaxYear: v })}
                  data-testid="switch-edit-task-requires-taxyear"
                />
                <Label htmlFor="edit-requiresTaxYear">Requires Tax Year</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={() => editingTask && updateTaskMutation.mutate({
              id: editingTask.id,
              description: editingTask.description,
              reviewLevel: editingTask.reviewLevel,
              status: editingTask.status,
              hasSubTasks: editingTask.hasSubTasks,
              requiresTaxYear: editingTask.requiresTaxYear,
            })} data-testid="button-save-edit-task">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSubTask} onOpenChange={(v) => !v && setEditingSubTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sub-task</DialogTitle>
          </DialogHeader>
          {editingSubTask && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-sub-description">Description</Label>
                <Input
                  id="edit-sub-description"
                  value={editingSubTask.description}
                  onChange={(e) => setEditingSubTask({ ...editingSubTask, description: e.target.value })}
                  data-testid="input-edit-subtask-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sub-status">Status</Label>
                <Select
                  value={editingSubTask.status}
                  onValueChange={(v) => setEditingSubTask({ ...editingSubTask, status: v })}
                >
                  <SelectTrigger data-testid="select-edit-subtask-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-sub-requiresTaxYear"
                  checked={editingSubTask.requiresTaxYear}
                  onCheckedChange={(v) => setEditingSubTask({ ...editingSubTask, requiresTaxYear: v })}
                  data-testid="switch-edit-subtask-requires-taxyear"
                />
                <Label htmlFor="edit-sub-requiresTaxYear">Requires Tax Year</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={() => editingSubTask && updateSubTaskMutation.mutate(editingSubTask)} data-testid="button-save-edit-subtask">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddingSubTask !== null} onOpenChange={(v) => !v && setIsAddingSubTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Sub-task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-sub-description">Description</Label>
              <Input
                id="new-sub-description"
                value={newSubTask.description}
                onChange={(e) => setNewSubTask({ ...newSubTask, description: e.target.value })}
                placeholder="Enter sub-task description"
                data-testid="input-new-subtask-description"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="new-sub-requiresTaxYear"
                checked={newSubTask.requiresTaxYear}
                onCheckedChange={(v) => setNewSubTask({ ...newSubTask, requiresTaxYear: v })}
                data-testid="switch-new-subtask-requires-taxyear"
              />
              <Label htmlFor="new-sub-requiresTaxYear">Requires Tax Year</Label>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => isAddingSubTask && createSubTaskMutation.mutate({ mainTaskId: isAddingSubTask, description: newSubTask.description, requiresTaxYear: newSubTask.requiresTaxYear })}
              disabled={!newSubTask.description}
              data-testid="button-save-new-subtask"
            >
              Create Sub-task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
