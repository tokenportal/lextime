import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { useUsers, useClients } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UserCog, Users, Briefcase, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, Client } from "@shared/schema";

export default function ClientAssignmentPage() {
  const { data: users } = useUsers();
  const { data: clients } = useClients();
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  
  if (!permissions.canAccessClientAssignment) {
    return <Redirect to={permissions.canAccessTimeTracker ? "/tracker" : "/admin/clients"} />;
  }
  
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  
  const { data: allAssignments } = useQuery<{ id: number; employeeId: string; clientId: number; taskLevel: number | null }[]>({
    queryKey: ['/api/client-assignments/all'],
  });
  
  const updateTaskLevel = useMutation({
    mutationFn: async ({ employeeId, clientId, taskLevel }: { employeeId: string; clientId: number; taskLevel: number | null }) => {
      return apiRequest('PUT', '/api/client-assignments/task-level', { employeeId, clientId, taskLevel });
    },
  });
  
  const employees = users?.filter((u: User) => u.status === "Active") || [];
  const activeClients = clients?.filter((c: Client) => c.status === "Active") || [];
  
  useEffect(() => {
    if (selectedEmployee && selectedClient !== "all" && allAssignments) {
      const existing = allAssignments.find(
        a => a.employeeId === selectedEmployee && a.clientId === Number(selectedClient)
      );
      if (existing) {
        setSelectedLevel(existing.taskLevel === 0 ? "none" : String(existing.taskLevel));
      } else {
        setSelectedLevel("");
      }
    } else {
      setSelectedLevel("");
    }
  }, [selectedEmployee, selectedClient, allAssignments]);
  
  const handleSave = async () => {
    if (!selectedEmployee) {
      toast({ title: "Select Employee", description: "Please select an employee.", variant: "destructive" });
      return;
    }
    if (!selectedLevel) {
      toast({ title: "Select Level", description: "Please select a level.", variant: "destructive" });
      return;
    }
    
    const taskLevel = selectedLevel === "none" ? 0 : parseInt(selectedLevel);
    const clientsToUpdate = selectedClient === "all" 
      ? activeClients.map((c: Client) => c.id)
      : [Number(selectedClient)];
    
    try {
      for (const clientId of clientsToUpdate) {
        await updateTaskLevel.mutateAsync({ 
          employeeId: selectedEmployee, 
          clientId, 
          taskLevel 
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/client-assignments/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client-assignments', selectedEmployee] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      const levelLabel = selectedLevel === "none" ? "None" : `Level ${selectedLevel}`;
      const clientLabel = selectedClient === "all" ? "all clients" : activeClients.find(c => c.id === Number(selectedClient))?.name;
      const employeeName = employees.find(e => e.id === selectedEmployee);
      
      toast({ 
        title: "Saved", 
        description: `Assigned ${levelLabel} to ${employeeName?.firstName || "employee"} for ${clientLabel}.` 
      });
    } catch {
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    }
  };
  
  const canSave = selectedEmployee && selectedLevel;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary">Client Assignment</h1>
          <p className="text-muted-foreground">Assign access levels to employees for each client they work with.</p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={!canSave || updateTaskLevel.isPending}
          className="gap-2"
          data-testid="button-save-changes"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </Button>
      </div>

      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Client-Specific Levels
          </CardTitle>
          <CardDescription>
            Select an employee, choose a client, and assign an access level. The level will auto-populate if an assignment exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Employee
              </Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger data-testid="select-employee">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp: User) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName || emp.email} {emp.lastName || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Client
              </Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {activeClients.map((client: Client) => (
                    <SelectItem key={client.id} value={String(client.id)}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Level
              </Label>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger data-testid="select-level">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (No Access)</SelectItem>
                  <SelectItem value="1">Level 1 - First-level review</SelectItem>
                  <SelectItem value="2">Level 2 - Second-level review</SelectItem>
                  <SelectItem value="3">Level 3 - Attorney-level review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
