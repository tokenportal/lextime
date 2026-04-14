import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { useUsers, useInvoices } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, FileText, DollarSign } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfWeek, endOfWeek } from "date-fns";

export default function AdminDashboard() {
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const { data: users } = useUsers();
  const { data: invoices } = useInvoices();
  
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  
  const { data: timeEntries } = useQuery<any[]>({
    queryKey: ['/api/time-entries', { startDate: format(weekStart, 'yyyy-MM-dd'), endDate: format(weekEnd, 'yyyy-MM-dd') }],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: format(weekStart, 'yyyy-MM-dd'),
        endDate: format(weekEnd, 'yyyy-MM-dd'),
      });
      const res = await fetch(`/api/time-entries?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch time entries');
      return res.json();
    },
  });
  
  const { data: rates } = useQuery<any[]>({
    queryKey: ['/api/rates'],
    queryFn: async () => {
      const res = await fetch('/api/rates', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch rates');
      return res.json();
    },
  });
  
  if (!permissions.canAccessDashboard) {
    return <Redirect to={permissions.canAccessTimeTracker ? "/tracker" : "/admin/clients"} />;
  }
  
  const roundSecondsToMinutes = (seconds: number) => {
    return Math.ceil(seconds / 60);
  };
  
  const roundToHalfHour = (hours: number) => {
    return Math.round(hours * 2) / 2;
  };
  
  const totalMinutesThisWeek = timeEntries?.reduce((sum, entry) => {
    return sum + roundSecondsToMinutes(entry.totalDuration || 0);
  }, 0) || 0;
  const totalHoursThisWeek = roundToHalfHour(totalMinutesThisWeek / 60);
  
  const calculateRevenue = () => {
    if (!timeEntries || !rates || rates.length === 0) return 0;
    
    let totalRevenue = 0;
    
    for (const entry of timeEntries) {
      const entryMinutes = roundSecondsToMinutes(entry.totalDuration || 0);
      const entryHours = entryMinutes / 60;
      const rateLevel = entry.rateLevel || entry.mainTask?.reviewLevel || 1;
      
      const rate = rates.find(r => r.reviewLevel === rateLevel);
      const rateAmount = rate ? parseFloat(rate.rateAmount) : 0;
      
      totalRevenue += entryHours * rateAmount;
    }
    
    return Math.round(totalRevenue);
  };
  
  const estimatedRevenue = calculateRevenue();
  
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const day = subDays(new Date(), 6 - i);
    const dayStr = format(day, 'yyyy-MM-dd');
    
    const dayEntries = timeEntries?.filter(entry => {
      const entryDate = format(new Date(entry.startTime), 'yyyy-MM-dd');
      return entryDate === dayStr;
    }) || [];
    
    const dayMinutes = dayEntries.reduce((sum, entry) => sum + roundSecondsToMinutes(entry.totalDuration || 0), 0);
    const dayHours = roundToHalfHour(dayMinutes / 60);
    
    return {
      name: format(day, 'EEE'),
      hours: dayHours,
    };
  });

  const stats = [
    {
      title: "Active Users",
      value: users?.filter((u: any) => u.status === "Active").length || 0,
      icon: Users,
      trend: "+2 this month",
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      title: "Pending Invoices",
      value: invoices?.filter((i: any) => i.status === "Draft").length || 0,
      icon: FileText,
      trend: "Needs review",
      color: "text-orange-600",
      bg: "bg-orange-100",
    },
    {
      title: "Hours This Week",
      value: totalHoursThisWeek.toFixed(1),
      icon: Clock,
      trend: "Rounded to half-hour",
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      title: "Revenue (Est)",
      value: `$${estimatedRevenue.toLocaleString()}`,
      icon: DollarSign,
      trend: "Based on hourly rates",
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-primary">Dashboard Overview</h1>
        <p className="text-muted-foreground">Welcome back, here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="border-none shadow-lg hover:shadow-xl transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600`}>
                  {stat.trend}
                </span>
              </div>
              <h3 className="text-3xl font-bold text-primary mb-1">{stat.value}</h3>
              <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Weekly Hours Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`${value} hrs`, 'Hours']}
                  />
                  <Area type="monotone" dataKey="hours" stroke="#8884d8" fillOpacity={1} fill="url(#colorHours)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-primary text-primary-foreground relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <button className="w-full text-left p-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between group">
              <div>
                <p className="font-semibold">Generate Invoice</p>
                <p className="text-xs text-white/60">Create new client bill</p>
              </div>
              <FileText className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
            </button>
            <button className="w-full text-left p-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between group">
              <div>
                <p className="font-semibold">Add New Client</p>
                <p className="text-xs text-white/60">Onboard a new case</p>
              </div>
              <Users className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
            </button>
            <button className="w-full text-left p-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between group">
              <div>
                <p className="font-semibold">Review Rates</p>
                <p className="text-xs text-white/60">Update hourly billing</p>
              </div>
              <DollarSign className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
