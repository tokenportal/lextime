import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Redirect } from "wouter";
import { useUsers, useInvoices } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, FileText, DollarSign } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { roundSecondsToHours } from "@/lib/time-utils";

type Tab = "overview" | "employees";

export default function AdminDashboard() {
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const { data: users } = useUsers();
  const { data: invoices } = useInvoices();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: timeEntries } = useQuery<any[]>({
    queryKey: ["/api/time-entries", "dashboard", format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: format(weekStart, "yyyy-MM-dd"),
        endDate: format(weekEnd, "yyyy-MM-dd"),
      });
      const res = await fetch(`/api/time-entries?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return res.json();
    },
  });

  const { data: rates } = useQuery<any[]>({
    queryKey: ["/api/rates"],
    queryFn: async () => {
      const res = await fetch("/api/rates", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (!permissions.canAccessDashboard) {
    return <Redirect to={permissions.canAccessTimeTracker ? "/tracker" : "/admin/clients"} />;
  }

  const totalHoursThisWeek = (timeEntries || []).reduce(
    (sum, e) => sum + roundSecondsToHours(e.totalDuration || 0), 0
  );

  const estimatedRevenue = (timeEntries || []).reduce((sum, entry) => {
    const hours = roundSecondsToHours(entry.totalDuration || 0);
    const level = entry.billingLevel ?? entry.rateLevel ?? entry.mainTask?.reviewLevel ?? 1;
    const rate = rates?.find((r: any) => r.reviewLevel === level);
    return sum + hours * parseFloat(rate?.rateAmount || "0");
  }, 0);

  // Weekly hours per day chart
  const chartData = weekDays.map(day => {
    const dayStr = format(day, "yyyy-MM-dd");
    const dayEntries = (timeEntries || []).filter(e => format(new Date(e.startTime), "yyyy-MM-dd") === dayStr);
    return {
      name: format(day, "EEE"),
      hours: parseFloat(dayEntries.reduce((s, e) => s + roundSecondsToHours(e.totalDuration || 0), 0).toFixed(2)),
    };
  });

  const stats = [
    {
      title: "Active Users",
      value: users?.filter((u: any) => u.status === "Active").length || 0,
      icon: Users, color: "text-blue-600", bg: "bg-blue-100", trend: "All roles",
    },
    {
      title: "Pending Invoices",
      value: invoices?.filter((i: any) => i.status === "Draft").length || 0,
      icon: FileText, color: "text-orange-600", bg: "bg-orange-100", trend: "Needs review",
    },
    {
      title: "Hours This Week",
      value: totalHoursThisWeek.toFixed(1),
      icon: Clock, color: "text-green-600", bg: "bg-green-100", trend: "Billed & rounded",
    },
    {
      title: "Revenue (Est.)",
      value: `$${Math.round(estimatedRevenue).toLocaleString()}`,
      icon: DollarSign, color: "text-purple-600", bg: "bg-purple-100", trend: "This week",
    },
  ];

  // Per-employee weekly breakdown for Employees tab
  const activeUsers = (users || []).filter((u: any) => u.status === "Active");
  const employeeStats = activeUsers.map((emp: any) => {
    const empEntries = (timeEntries || []).filter(e => e.employeeId === emp.id);
    const totalHours = empEntries.reduce((s: number, e: any) => s + roundSecondsToHours(e.totalDuration || 0), 0);
    const billableHours = empEntries
      .filter((e: any) => (e.billingLevel ?? e.rateLevel) !== null)
      .reduce((s: number, e: any) => s + roundSecondsToHours(e.totalDuration || 0), 0);
    const dailyData = weekDays.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayEntries = empEntries.filter((e: any) => format(new Date(e.startTime), "yyyy-MM-dd") === dayStr);
      return {
        name: format(day, "EEE"),
        billable: parseFloat(dayEntries
          .filter((e: any) => (e.billingLevel ?? e.rateLevel) !== null)
          .reduce((s: number, e: any) => s + roundSecondsToHours(e.totalDuration || 0), 0).toFixed(2)),
        nonBillable: parseFloat(dayEntries
          .filter((e: any) => (e.billingLevel ?? e.rateLevel) === null)
          .reduce((s: number, e: any) => s + roundSecondsToHours(e.totalDuration || 0), 0).toFixed(2)),
      };
    });
    return { emp, totalHours, billableHours, dailyData };
  }).filter(e => e.totalHours > 0 || e.emp.id === user?.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.firstName}.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        {(["overview", "employees"] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === tab
                ? "bg-white shadow text-primary"
                : "text-muted-foreground hover:text-primary"
            }`}
          >
            {tab === "overview" ? "Overview" : "Employees"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <Card key={i} className="border-none shadow-lg hover:shadow-xl transition-all">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">{stat.trend}</span>
                  </div>
                  <h3 className="text-3xl font-bold text-primary mb-1">{stat.value}</h3>
                  <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Chart + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 border-none shadow-lg">
              <CardHeader>
                <CardTitle>Weekly Hours Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af" }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af" }} />
                      <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }} formatter={(v: number) => [`${v} hrs`, "Hours"]} />
                      <Area type="monotone" dataKey="hours" stroke="#8884d8" fillOpacity={1} fill="url(#colorHours)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg bg-primary text-primary-foreground relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
              <CardHeader><CardTitle className="text-white">Quick Actions</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Link href="/admin/invoices">
                  <button className="w-full text-left p-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between group">
                    <div><p className="font-semibold">Generate Invoice</p><p className="text-xs text-white/60">Create new client bill</p></div>
                    <FileText className="w-5 h-5 text-white/60 group-hover:text-white" />
                  </button>
                </Link>
                <Link href="/admin/clients">
                  <button className="w-full text-left p-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between group">
                    <div><p className="font-semibold">Add New Client</p><p className="text-xs text-white/60">Onboard a new case</p></div>
                    <Users className="w-5 h-5 text-white/60 group-hover:text-white" />
                  </button>
                </Link>
                <Link href="/admin/rates">
                  <button className="w-full text-left p-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between group">
                    <div><p className="font-semibold">Review Rates</p><p className="text-xs text-white/60">Update billing rates</p></div>
                    <DollarSign className="w-5 h-5 text-white/60 group-hover:text-white" />
                  </button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {activeTab === "employees" && (
        <div className="space-y-6">
          {employeeStats.length === 0 ? (
            <Card className="border-none shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                No time entries recorded this week.
              </CardContent>
            </Card>
          ) : (
            employeeStats.map(({ emp, totalHours, billableHours, dailyData }) => (
              <Card key={emp.id} className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {emp.firstName?.[0]}{emp.lastName?.[0]}
                      </div>
                      {emp.firstName} {emp.lastName}
                      <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{emp.role}</span>
                    </CardTitle>
                    <div className="flex gap-6 text-sm">
                      <div className="text-right">
                        <p className="font-bold text-primary">{totalHours.toFixed(2)}h</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">{billableHours.toFixed(2)}h</p>
                        <p className="text-xs text-muted-foreground">Billable</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-500">{(totalHours - billableHours).toFixed(2)}h</p>
                        <p className="text-xs text-muted-foreground">Non-Billable</p>
                      </div>
                      {totalHours > 0 && (
                        <div className="text-right">
                          <p className="font-bold">{Math.round((billableHours / totalHours) * 100)}%</p>
                          <p className="text-xs text-muted-foreground">Billable %</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[160px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyData} barSize={20} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,.1)" }} formatter={(v: number) => [`${v}h`]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="billable" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} name="Billable" />
                        <Bar dataKey="nonBillable" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Non-Billable" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
