import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Send, Trash2, FileQuestion, CheckCircle, Clock, Mail } from "lucide-react";
import { format } from "date-fns";
import { useClients } from "@/hooks/use-time-tracking";

type DocRequest = {
  id: number;
  clientId: number;
  title: string;
  clientEmail: string | null;
  status: string;
  reminderDays: number | null;
  nextReminderAt: string | null;
  lastSentAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  items: { id: number; question: string; answer: string | null; displayOrder: number }[];
  client: { id: number; name: string } | null;
};

const STATUS_COLOR: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Sent: "bg-blue-100 text-blue-700",
  Fulfilled: "bg-green-100 text-green-700",
};

export default function DocumentRequestsPage() {
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const { data: clients } = useClients();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!permissions.canAccessClients) return <Redirect to="/tracker" />;

  const { data: requests, isLoading } = useQuery<DocRequest[]>({
    queryKey: ["/api/document-requests"],
    queryFn: async () => {
      const res = await fetch("/api/document-requests", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load document requests");
      return res.json();
    },
  });

  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<DocRequest | null>(null);
  const [newForm, setNewForm] = useState({
    clientId: "",
    title: "",
    clientEmail: "",
    reminderDays: "7",
    questions: [""],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/document-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: Number(newForm.clientId),
          title: newForm.title,
          clientEmail: newForm.clientEmail,
          reminderDays: Number(newForm.reminderDays),
          items: newForm.questions.filter(q => q.trim()),
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/document-requests"] });
      setCreating(false);
      setNewForm({ clientId: "", title: "", clientEmail: "", reminderDays: "7", questions: [""] });
      toast({ title: "Document request created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/document-requests/${id}/send`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/document-requests"] });
      toast({ title: "Document request sent" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addQuestion = () => setNewForm(f => ({ ...f, questions: [...f.questions, ""] }));
  const removeQuestion = (i: number) => setNewForm(f => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));
  const setQuestion = (i: number, val: string) => setNewForm(f => ({
    ...f,
    questions: f.questions.map((q, idx) => idx === i ? val : q),
  }));

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary flex items-center gap-3">
            <FileQuestion className="w-8 h-8" /> Document Requests
          </h1>
          <p className="text-muted-foreground">Send Q&A document request sheets to clients</p>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" /> New Request
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : !requests || requests.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            No document requests yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {requests.map(req => (
            <Card
              key={req.id}
              className="border-none shadow-sm cursor-pointer hover:shadow-md transition-all"
              onClick={() => setViewing(req)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-tight">{req.title}</CardTitle>
                  <Badge className={`text-xs shrink-0 ${STATUS_COLOR[req.status] || "bg-slate-100 text-slate-700"}`}>
                    {req.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{req.client?.name || "Unknown client"}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{req.items.length} question{req.items.length !== 1 ? "s" : ""}</p>
                {req.clientEmail && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" />{req.clientEmail}
                  </p>
                )}
                {req.lastSentAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Send className="w-3 h-3" />Sent {format(new Date(req.lastSentAt), "MMM d, yyyy")}
                  </p>
                )}
                {req.status === "Fulfilled" && req.fulfilledAt && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />Fulfilled {format(new Date(req.fulfilledAt), "MMM d, yyyy")}
                  </p>
                )}
                {req.status === "Sent" && req.nextReminderAt && (
                  <p className="text-xs text-blue-600 flex items-center gap-1">
                    <Clock className="w-3 h-3" />Next reminder {format(new Date(req.nextReminderAt), "MMM d")}
                  </p>
                )}
                <div className="flex gap-2 pt-2" onClick={e => e.stopPropagation()}>
                  {req.status !== "Fulfilled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      disabled={sendMutation.isPending || !req.clientEmail}
                      onClick={() => sendMutation.mutate(req.id)}
                      title={!req.clientEmail ? "No client email set" : undefined}
                    >
                      <Send className="w-3 h-3 mr-1" />
                      {req.status === "Draft" ? "Send" : "Resend"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Document Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={newForm.clientId} onValueChange={v => setNewForm(f => ({ ...f, clientId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a client..." /></SelectTrigger>
                <SelectContent>
                  {(clients || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="e.g. 2024 Tax Document Checklist" value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Client Email</Label>
              <Input type="email" placeholder="client@example.com" value={newForm.clientEmail} onChange={e => setNewForm(f => ({ ...f, clientEmail: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Reminder Interval (days)</Label>
              <Input type="number" min="1" max="90" value={newForm.reminderDays} onChange={e => setNewForm(f => ({ ...f, reminderDays: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Questions / Documents Requested</Label>
              {newForm.questions.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder={`Question ${i + 1}`}
                    value={q}
                    onChange={e => setQuestion(i, e.target.value)}
                  />
                  {newForm.questions.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeQuestion(i)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addQuestion}>
                <Plus className="w-3 h-3 mr-1" /> Add Question
              </Button>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !newForm.clientId || !newForm.title}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewing} onOpenChange={v => !v && setViewing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <Badge className={STATUS_COLOR[viewing.status] || "bg-slate-100 text-slate-700"}>{viewing.status}</Badge>
                  <span className="text-sm text-muted-foreground">{viewing.client?.name}</span>
                </div>
                {viewing.clientEmail && (
                  <p className="text-sm text-muted-foreground">To: {viewing.clientEmail}</p>
                )}
                {viewing.reminderDays && (
                  <p className="text-sm text-muted-foreground">Reminders every {viewing.reminderDays} days</p>
                )}
                <div className="space-y-3 pt-2">
                  {viewing.items.map((item, i) => (
                    <div key={item.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <p className="text-sm font-medium">{i + 1}. {item.question}</p>
                      {item.answer && <p className="text-sm text-muted-foreground mt-1">{item.answer}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
                {viewing.status !== "Fulfilled" && (
                  <Button
                    onClick={() => { sendMutation.mutate(viewing.id); setViewing(null); }}
                    disabled={sendMutation.isPending || !viewing.clientEmail}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {viewing.status === "Draft" ? "Send Now" : "Resend"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
