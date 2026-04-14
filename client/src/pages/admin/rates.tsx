import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import type { HourlyRate, Client } from "@shared/schema";
import { Loader2, Save, DollarSign, Plus, Trash2, X } from "lucide-react";

const BILLING_LEVEL_LABELS: Record<number, string> = {
  1: "Level 1 — Attorney",
  2: "Level 2 — 1st Level",
  3: "Level 3 — 2nd Level",
};

interface ClientHourlyRate {
  id: number;
  clientId: number;
  billingLevel: number;
  rateAmount: string;
}

export default function RatesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);

  if (!permissions.canAccessRates) {
    return <Redirect to={permissions.canAccessTimeTracker ? "/tracker" : "/admin/clients"} />;
  }

  const { data: rates, isLoading, refetch } = useQuery<HourlyRate[]>({
    queryKey: [api.rates.list.path],
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: [api.clients.list.path],
  });

  const [level1, setLevel1] = useState("");
  const [level2, setLevel2] = useState("");
  const [level3, setLevel3] = useState("");

  // Per-client override state
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientRates, setClientRates] = useState<ClientHourlyRate[]>([]);
  const [newOverrideLevel, setNewOverrideLevel] = useState<string>("");
  const [newOverrideAmount, setNewOverrideAmount] = useState<string>("");

  const activeClients = (clients as Client[]).filter(c => c.status === "Active").sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (rates && rates.length > 0) {
      const r1 = rates.find(r => Number(r.reviewLevel) === 1);
      const r2 = rates.find(r => Number(r.reviewLevel) === 2);
      const r3 = rates.find(r => Number(r.reviewLevel) === 3);
      setLevel1(r1 ? parseFloat(r1.rateAmount.toString()).toFixed(2) : "");
      setLevel2(r2 ? parseFloat(r2.rateAmount.toString()).toFixed(2) : "");
      setLevel3(r3 ? parseFloat(r3.rateAmount.toString()).toFixed(2) : "");
    }
  }, [rates]);

  // Fetch client-specific rates when a client is selected
  const { data: fetchedClientRates = [], refetch: refetchClientRates } = useQuery<ClientHourlyRate[]>({
    queryKey: ["/api/clients", selectedClientId, "rates"],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const res = await fetch(`/api/clients/${selectedClientId}/rates`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  useEffect(() => {
    setClientRates(fetchedClientRates);
  }, [fetchedClientRates]);

  const saveMutation = useMutation({
    mutationFn: async (data: { level: number; amount: string }) => {
      return apiRequest(api.rates.update.method, api.rates.update.path, {
        reviewLevel: data.level,
        rateAmount: parseFloat(data.amount || "0").toString(),
        effectiveDate: new Date().toISOString(),
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveGlobal = async () => {
    if (isLoading) return;
    try {
      await saveMutation.mutateAsync({ level: 1, amount: level1 });
      await saveMutation.mutateAsync({ level: 2, amount: level2 });
      await saveMutation.mutateAsync({ level: 3, amount: level3 });
      await queryClient.invalidateQueries({ queryKey: [api.rates.list.path] });
      await refetch();
      toast({ title: "Success", description: "Global rates updated" });
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  const handleAddClientRate = async () => {
    if (!selectedClientId || !newOverrideLevel || !newOverrideAmount) return;
    try {
      const res = await fetch(`/api/clients/${selectedClientId}/rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          billingLevel: parseInt(newOverrideLevel),
          rateAmount: parseFloat(newOverrideAmount).toString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to save rate");
      setNewOverrideLevel("");
      setNewOverrideAmount("");
      await refetchClientRates();
      toast({ title: "Success", description: "Client rate override saved" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to save client rate", variant: "destructive" });
    }
  };

  const handleDeleteClientRate = async (billingLevel: number) => {
    if (!selectedClientId) return;
    try {
      await fetch(`/api/clients/${selectedClientId}/rates/${billingLevel}`, {
        method: "DELETE",
        credentials: "include",
      });
      await refetchClientRates();
      toast({ title: "Removed", description: "Client rate override removed" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to remove override", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const selectedClient = activeClients.find(c => c.id.toString() === selectedClientId);

  // Determine which levels already have overrides for the add-override dropdown
  const overriddenLevels = new Set(clientRates.map(r => r.billingLevel));
  const availableLevels = [1, 2, 3].filter(l => !overriddenLevels.has(l));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary">Billing Rates</h1>
        <p className="text-muted-foreground">Manage global billing rates and per-client overrides.</p>
      </div>

      {/* Global Rates */}
      <Card className="max-w-2xl border-none shadow-lg">
        <CardHeader>
          <CardTitle>Global Rates</CardTitle>
          <CardDescription>Default hourly billing rates for each level. Individual client overrides take precedence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6">
            {[
              { id: "level1", label: "Level 1 — Attorney", value: level1, set: setLevel1 },
              { id: "level2", label: "Level 2 — 1st Level", value: level2, set: setLevel2 },
              { id: "level3", label: "Level 3 — 2nd Level", value: level3, set: setLevel3 },
            ].map(({ id, label, value, set }) => (
              <div key={id} className="space-y-2">
                <Label htmlFor={id}>{label} ($)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id={id}
                    type="number"
                    className="pl-9"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            className="w-full gap-2 mt-4"
            onClick={handleSaveGlobal}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Global Rates
          </Button>
        </CardContent>
      </Card>

      {/* Per-Client Rate Overrides */}
      <Card className="max-w-2xl border-none shadow-lg">
        <CardHeader>
          <CardTitle>Per-Client Rate Overrides</CardTitle>
          <CardDescription>Override billing rates for a specific client. These take precedence over global rates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select Client</Label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a client..." />
              </SelectTrigger>
              <SelectContent>
                {activeClients.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedClientId && (
            <>
              {/* Existing overrides */}
              {clientRates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Current overrides for {selectedClient?.name}</p>
                  {clientRates.map(rate => (
                    <div key={rate.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                      <span className="text-sm font-medium">{BILLING_LEVEL_LABELS[rate.billingLevel] || `Level ${rate.billingLevel}`}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold">${parseFloat(rate.rateAmount).toFixed(2)}/hr</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteClientRate(rate.billingLevel)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new override */}
              {availableLevels.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-sm font-medium">Add override</p>
                  <div className="flex gap-2">
                    <Select value={newOverrideLevel} onValueChange={setNewOverrideLevel}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Billing level" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLevels.map(l => (
                          <SelectItem key={l} value={l.toString()}>{BILLING_LEVEL_LABELS[l]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        className="pl-9"
                        value={newOverrideAmount}
                        onChange={(e) => setNewOverrideAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <Button onClick={handleAddClientRate} disabled={!newOverrideLevel || !newOverrideAmount} className="gap-1">
                      <Plus className="w-4 h-4" /> Add
                    </Button>
                  </div>
                </div>
              )}

              {availableLevels.length === 0 && (
                <p className="text-sm text-muted-foreground pt-2">All billing levels have overrides for this client.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
