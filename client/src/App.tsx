import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import Login from "@/pages/login";
import Tracker from "@/pages/tracker";
import AdminDashboard from "@/pages/admin/dashboard";
import ClientsPage from "@/pages/admin/clients";
import ClientDetailPage from "@/pages/admin/client-detail";
import RatesPage from "@/pages/admin/rates";
import StandardTasksPage from "@/pages/admin/standard-tasks";
import ClientAssignmentPage from "@/pages/admin/task-access";
import InvoicesPage from "@/pages/admin/invoices";
import InvoiceReviewPage from "@/pages/admin/invoice-review";
import InvoiceSettingsPage from "@/pages/admin/invoice-settings";
import UsersPage from "@/pages/admin/users";
import TimeEntriesPage from "@/pages/admin/time-entries";
import RolesPage from "@/pages/admin/roles";
import SuperAdminPage from "@/pages/admin/super-admin";
import DocumentRequestsPage from "@/pages/admin/document-requests";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/api/login" component={Login} /> {/* Handle redirect loops gently */}
      
      {/* Protected Pages Wrapped in Layout */}
      <Route path="/tracker">
        <Layout>
          <Tracker />
        </Layout>
      </Route>
      
      <Route path="/admin/dashboard">
        <Layout>
          <AdminDashboard />
        </Layout>
      </Route>

      <Route path="/admin/clients">
        <Layout>
          <ClientsPage />
        </Layout>
      </Route>

      <Route path="/admin/clients/:id">
        <Layout>
          <ClientDetailPage />
        </Layout>
      </Route>

      <Route path="/admin/users">
        <Layout><UsersPage /></Layout>
      </Route>
      <Route path="/admin/tasks">
        <Layout>
          <StandardTasksPage />
        </Layout>
      </Route>
      <Route path="/admin/client-assignment">
        <Layout>
          <ClientAssignmentPage />
        </Layout>
      </Route>
      <Route path="/admin/time-entries">
        <Layout><TimeEntriesPage /></Layout>
      </Route>
      <Route path="/admin/invoices">
        <Layout><InvoicesPage /></Layout>
      </Route>
      <Route path="/admin/invoices/:id">
        <Layout><InvoiceReviewPage /></Layout>
      </Route>
      <Route path="/admin/invoice-settings">
        <Layout><InvoiceSettingsPage /></Layout>
      </Route>
      <Route path="/admin/rates">
        <Layout>
          <RatesPage />
        </Layout>
      </Route>

      <Route path="/admin/roles">
        <Layout>
          <RolesPage />
        </Layout>
      </Route>

      <Route path="/admin/super-admin">
        <Layout><SuperAdminPage /></Layout>
      </Route>

      <Route path="/admin/document-requests">
        <Layout><DocumentRequestsPage /></Layout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
