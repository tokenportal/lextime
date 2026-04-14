import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getPermissions } from "@shared/permissions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Save, Loader2, Settings, FileText, Upload, Trash2, Image } from "lucide-react";
import type { InvoiceSettings } from "@shared/schema";

export default function InvoiceSettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getPermissions(user?.role);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  if (!permissions.canAccessInvoiceSettings) {
    return <Redirect to={permissions.canAccessTimeTracker ? "/tracker" : "/admin/clients"} />;
  }
  
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  
  const { data: settings, isLoading } = useQuery<InvoiceSettings | null>({
    queryKey: ["/api/invoice-settings"],
    queryFn: async () => {
      const res = await fetch("/api/invoice-settings", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
  
  useEffect(() => {
    if (settings) {
      setHeaderText(settings.defaultHeaderText || "");
      setFooterText(settings.defaultFooterText || "");
    }
  }, [settings]);
  
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/invoice-settings", {
        defaultHeaderText: headerText,
        defaultFooterText: footerText,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-settings"] });
      toast({
        title: "Settings Saved",
        description: "Invoice settings have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      
      const res = await fetch("/api/invoice-settings/logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to upload logo");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-settings"] });
      toast({
        title: "Logo Uploaded",
        description: "Your invoice logo has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/invoice-settings/logo", {
        method: "DELETE",
        credentials: "include",
      });
      
      if (!res.ok) {
        throw new Error("Failed to delete logo");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-settings"] });
      toast({
        title: "Logo Removed",
        description: "Your invoice logo has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image under 1MB.",
          variant: "destructive",
        });
        return;
      }
      uploadLogoMutation.mutate(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  const hasChanges = 
    headerText !== (settings?.defaultHeaderText || "") ||
    footerText !== (settings?.defaultFooterText || "");

  const isUploading = uploadLogoMutation.isPending || deleteLogoMutation.isPending;
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-3">
            <Settings className="w-6 h-6" />
            Invoice Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure default header, footer, and logo for all invoices
          </p>
        </div>
        
        {hasChanges && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-2"
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Settings
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            Invoice Logo
          </CardTitle>
          <CardDescription>
            Upload a logo to appear on all invoices (PNG or JPEG, max 1MB)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings?.defaultHeaderLogoUrl ? (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-muted/50">
                <img
                  src={settings.defaultHeaderLogoUrl}
                  alt="Invoice Logo"
                  className="max-h-24 max-w-xs object-contain"
                  data-testid="img-invoice-logo-preview"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="gap-2"
                  data-testid="button-replace-logo"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Replace Logo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => deleteLogoMutation.mutate()}
                  disabled={isUploading}
                  className="gap-2 text-destructive hover:text-destructive"
                  data-testid="button-remove-logo"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover-elevate transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-logo"
            >
              {isUploading ? (
                <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">
                Click to upload a logo
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG or JPEG, max 1MB
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="input-logo-file"
          />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Default Invoice Content
          </CardTitle>
          <CardDescription>
            These settings will be applied to all generated invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="headerText">Invoice Header</Label>
            <Textarea
              id="headerText"
              placeholder="Enter default header text (e.g., firm name, address, contact info)..."
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              rows={4}
              data-testid="input-header-text"
            />
            <p className="text-sm text-muted-foreground">
              This text appears at the top of each invoice below the logo.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="footerText">Invoice Footer</Label>
            <Textarea
              id="footerText"
              placeholder="Enter default footer text (e.g., payment terms, thank you message)..."
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              rows={4}
              data-testid="input-footer-text"
            />
            <p className="text-sm text-muted-foreground">
              This text appears at the bottom of each invoice.
            </p>
          </div>
          
          {hasChanges && (
            <div className="flex justify-end pt-4 border-t">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="gap-2"
                data-testid="button-save-settings-bottom"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Settings
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
