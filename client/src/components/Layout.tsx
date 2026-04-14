import { ReactNode, useEffect } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { getPermissions } from "@shared/permissions";
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  CheckSquare, 
  Clock, 
  FileText, 
  DollarSign, 
  LogOut,
  User,
  Shield,
  UserCog,
  Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  
  const permissions = getPermissions(user?.role);
  
  const adminLinks = [
    { href: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard", show: permissions.canAccessDashboard },
    { href: "/admin/users", icon: Users, label: "Users", show: permissions.canAccessUsers },
    { href: "/admin/clients", icon: Briefcase, label: "Clients", show: permissions.canAccessClients },
    { href: "/admin/tasks", icon: CheckSquare, label: "Tasks", show: permissions.canAccessTasks },
    { href: "/admin/client-assignment", icon: UserCog, label: "Client Assignment", show: permissions.canAccessClientAssignment },
    { href: "/admin/time-entries", icon: Clock, label: "Time Entries", show: permissions.canAccessTimeEntries },
    { href: "/admin/invoices", icon: FileText, label: "Invoices", show: permissions.canAccessInvoices },
    { href: "/admin/invoice-settings", icon: Settings, label: "Invoice Settings", show: permissions.canAccessInvoiceSettings },
    { href: "/admin/rates", icon: DollarSign, label: "Rates", show: permissions.canAccessRates },
  ].filter(link => link.show);

  useEffect(() => {
    if (!user) return;
    
    if (location === "/" || location === "/tracker") {
      if (!permissions.canAccessTimeTracker) {
        if (permissions.canAccessClients) {
          setLocation("/admin/clients");
        }
      }
    } else if (location.startsWith("/admin")) {
      if (!permissions.canAccessAdminPortal && !permissions.canAccessClients) {
        if (permissions.canAccessTimeTracker) {
          setLocation("/tracker");
        }
      }
    }
  }, [location, user, permissions]);

  if (location === "/" || location === "/tracker") {
    if (!permissions.canAccessTimeTracker && user) {
      if (permissions.canAccessClients) {
        return <Redirect to="/admin/clients" />;
      }
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {user && (
          <header className="border-b bg-white px-6 py-3 flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-display font-bold text-lg">
                L
              </div>
              <span className="font-display font-semibold text-lg text-primary tracking-tight">LEX TIME</span>
            </div>
            
            <div className="flex items-center gap-4">
              {permissions.canAccessAdminPortal && (
                <Link href="/admin/dashboard">
                  <Button variant="outline" size="sm" className="gap-2 bg-accent/10 border-accent/20 text-accent hover:bg-accent/20" data-testid="button-admin-portal">
                    <Shield className="w-4 h-4" />
                    Admin Portal
                  </Button>
                </Link>
              )}
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                <User className="w-4 h-4" />
                <span>{user.firstName} {user.lastName}</span>
              </div>
              
              <Button variant="ghost" size="icon" onClick={() => logout()} data-testid="button-logout">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </header>
        )}
        <main className="flex-1 overflow-auto bg-slate-50">
          {children}
        </main>
      </div>
    );
  }

  if (!permissions.canAccessAdminPortal && !permissions.canAccessClients && user) {
    return <Redirect to="/tracker" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-primary text-primary-foreground flex flex-col fixed inset-y-0 left-0 z-20 shadow-xl">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent text-accent-foreground rounded-lg flex items-center justify-center font-display font-bold text-xl shadow-lg shadow-accent/20">
              L
            </div>
            <div>
              <h1 className="font-display font-bold text-lg tracking-wide">LEX TIME</h1>
              <p className="text-xs text-white/50 uppercase tracking-widest font-medium">Legal Suite</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {adminLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group cursor-pointer",
                  location === link.href 
                    ? "bg-white/10 text-white shadow-inner" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
                data-testid={`nav-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <link.icon className={cn(
                  "w-5 h-5 transition-colors",
                  location === link.href ? "text-accent" : "text-white/60 group-hover:text-white"
                )} />
                {link.label}
              </div>
            </Link>
          ))}
          
          {permissions.canAccessTimeTracker && (
            <div className="pt-4 mt-4 border-t border-white/10">
              <Link href="/tracker">
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 cursor-pointer transition-all" data-testid="nav-time-tracker">
                  <Clock className="w-5 h-5" />
                  Time Tracker View
                </div>
              </Link>
            </div>
          )}
        </nav>

        <div className="p-4 bg-black/20">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold text-xs">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-white/50 truncate">{user?.role}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10 gap-2"
            onClick={() => logout()}
            data-testid="button-signout"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-8 max-w-7xl mx-auto animate-enter">
          {children}
        </div>
      </main>
    </div>
  );
}
