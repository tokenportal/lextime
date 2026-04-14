import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import type { HourlyRate } from "@shared/schema";
import { Loader2, Save, DollarSign } from "lucide-react";

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

  const [level1, setLevel1] = useState("");
  const [level2, setLevel2] = useState("");
  const [level3, setLevel3] = useState("");

  // Update local state when data loads
  useEffect(() => {
    if (rates && rates.length > 0) {
      console.log("Rates loaded from API:", rates);
      const r1 = rates.find(r => Number(r.reviewLevel) === 1);
      const r2 = rates.find(r => Number(r.reviewLevel) === 2);
      const r3 = rates.find(r => Number(r.reviewLevel) === 3);
      
      const val1 = r1 ? parseFloat(r1.rateAmount.toString()).toFixed(2) : "";
      const val2 = r2 ? parseFloat(r2.rateAmount.toString()).toFixed(2) : "";
      const val3 = r3 ? parseFloat(r3.rateAmount.toString()).toFixed(2) : "";

      console.log("Setting form values:", { val1, val2, val3 });
      setLevel1(val1);
      setLevel2(val2);
      setLevel3(val3);
    }
  }, [rates]);

  const saveMutation = useMutation({
    mutationFn: async (data: { level: number, amount: string }) => {
      console.log(`Saving rate for level ${data.level}: ${data.amount}`);
      return apiRequest(api.rates.update.method, api.rates.update.path, {
        reviewLevel: data.level,
        rateAmount: parseFloat(data.amount || "0").toString(),
        effectiveDate: new Date().toISOString()
      });
    },
    onSuccess: () => {
      // Handled in handleSave
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleSave = async () => {
    if (isLoading) return;
    try {
      // Sequential saves to ensure DB consistency
      await saveMutation.mutateAsync({ level: 1, amount: level1 });
      await saveMutation.mutateAsync({ level: 2, amount: level2 });
      await saveMutation.mutateAsync({ level: 3, amount: level3 });
      
      await queryClient.invalidateQueries({ queryKey: [api.rates.list.path] });
      await refetch();
      
      const updatedRates = await refetch();
      console.log("Rates after save and refetch:", updatedRates.data);
      
      toast({
        title: "Success",
        description: "All rates updated successfully",
      });
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary">Hourly Rates</h1>
        <p className="text-muted-foreground">Manage billing rates for each review level.</p>
      </div>

      <Card className="max-w-2xl border-none shadow-lg">
        <CardHeader>
          <CardTitle>Global Rates</CardTitle>
          <CardDescription>Set the standard hourly rate for each experience level.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6">
            <div className="space-y-2">
              <Label htmlFor="level1">Level 1 Rate ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="level1"
                  type="number"
                  className="pl-9"
                  value={level1}
                  onChange={(e) => setLevel1(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level2">Level 2 Rate ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="level2"
                  type="number"
                  className="pl-9"
                  value={level2}
                  onChange={(e) => setLevel2(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level3">Level 3 Rate ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="level3"
                  type="number"
                  className="pl-9"
                  value={level3}
                  onChange={(e) => setLevel3(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <Button 
            className="w-full gap-2 mt-4" 
            onClick={handleSave}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending || isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save All Rates
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
