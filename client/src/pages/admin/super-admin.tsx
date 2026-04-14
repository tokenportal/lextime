import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Mail, Shield, CheckCircle, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

type EmailLog = {
  id: number;
  type: string;
  toEmail: string;
  subject: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

export default function SuperAdminPage() {
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!permissions.canSuperAdmin) return <Redirect to="/admin/dashboard" />;

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  const { data: emailLogs } = useQuery<EmailLog[]>({
    queryKey: ["/api/email-logs"],
    queryFn: async () => {
      const res = await fetch("/api/email-logs", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [form, setForm] = useState({
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    smtp_from_name: "",
    smtp_from_email: "",
    secretary_cc_email: "",
    sharefile_webhook_secret: "",
  });

  // Populate form once settings load
  const [populated, setPopulated] = useState(false);
  if (settings && !populated) {
    setForm({
      smtp_host: settings.smtp_host || "",
      smtp_port: settings.smtp_port || "587",
      smtp_user: settings.smtp_user || "",
      smtp_password: settings.smtp_password || "",
      smtp_from_name: settings.smtp_from_name || "",
      smtp_from_email: settings.smtp_from_email || "",
      secretary_cc_email: settings.secretary_cc_email || "",
      sharefile_webhook_secret: settings.sharefile_webhook_secret || "",
    });
    setPopulated(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setPopulated(false);
      toast({ title: "Settings saved" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/verify-smtp", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
    },
    onSuccess: () => toast({ title: "SMTP connection verified", description: "Connection to Gmail SMTP succeeded." }),
    onError: (err: Error) => toast({ title: "SMTP connection failed", description: err.message, variant: "destructive" }),
  });

  const field = (key: keyof typeof form, label: string, type = "text", placeholder = "") => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary flex items-center gap-3">
          <Shield className="w-8 h-8" /> Super Admin
        </h1>
        <p className="text-muted-foreground">System settings and email configuration</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading settings...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* SMTP Config */}
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Gmail SMTP</CardTitle>
              <CardDescription>Credentials for outgoing email via Google Workspace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {field("smtp_host", "SMTP Host", "text", "smtp.gmail.com")}
              {field("smtp_port", "SMTP Port", "number", "587")}
              {field("smtp_user", "Gmail Username / Email", "email", "you@yourdomain.com")}
              {field("smtp_password", "App Password", "password", "16-character app password")}
              {field("smtp_from_name", "From Name", "text", "Sherlaw Law Firm")}
              {field("smtp_from_email", "From Email", "email", "noreply@yourdomain.com")}
            </CardContent>
          </Card>

          {/* Misc settings */}
          <div className="space-y-6">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> Notifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {field("secretary_cc_email", "Secretary CC Email", "email", "secretary@yourdomain.com")}
                <p className="text-xs text-muted-foreground">This address is CC'd on all outgoing emails (invoice emails, document requests, reminders).</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Sharefile Webhook</CardTitle>
                <CardDescription>Webhook URL: <code className="text-xs bg-muted px-1 rounded">/api/webhooks/sharefile</code></CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {field("sharefile_webhook_secret", "Webhook Secret (optional)", "text", "shared secret key")}
                <p className="text-xs text-muted-foreground">
                  Configure Sharefile to POST to the webhook URL above when a client uploads a document.
                  Include the secret in the <code>X-Sharefile-Secret</code> header. This automatically marks the related document request as Fulfilled.
                </p>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="flex-1">
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
              <Button variant="outline" onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
                {verifyMutation.isPending ? "Testing..." : "Test SMTP"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Email Logs */}
      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle>Email Delivery Log</CardTitle>
          <CardDescription>Last 100 outgoing emails</CardDescription>
        </CardHeader>
        <CardContent>
          {!emailLogs || emailLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No emails sent yet.</p>
          ) : (
            <div className="space-y-2">
              {emailLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                  {log.status === "sent" ? (
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{log.type}</Badge>
                      <p className="text-sm font-medium truncate">{log.subject}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">To: {log.toEmail}</p>
                    {log.errorMessage && <p className="text-xs text-destructive mt-0.5">{log.errorMessage}</p>}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="w-3 h-3" />
                    {format(new Date(log.createdAt), "MMM d, HH:mm")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
