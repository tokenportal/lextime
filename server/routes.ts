import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";
import PDFDocument from "pdfkit";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import * as XLSX from "xlsx";
import { getPermissions, type RolePermissions } from "@shared/permissions";

type PermissionKey = keyof RolePermissions;

function requirePermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const permissions = getPermissions(user.role);
    if (!permissions[permission]) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
}

// Configure multer for logo uploads
const uploadsDir = path.join(process.cwd(), "uploads", "logos");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `invoice-logo-${Date.now()}${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG and JPEG images are allowed'));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Serve static uploads
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Auth Setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // === Users ===
  app.get(api.users.list.path, isAuthenticated, requirePermission("canAccessUsers"), async (req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });

  app.get(api.users.get.path, isAuthenticated, requirePermission("canAccessUsers"), async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.patch(api.users.update.path, isAuthenticated, requirePermission("canAccessUsers"), async (req, res) => {
    const updated = await storage.updateUser(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(updated);
  });

  // === Clients ===
  app.get(api.clients.list.path, isAuthenticated, requirePermission("canAccessClients"), async (req, res) => {
    const clients = await storage.getClients();
    res.json(clients);
  });

  app.get(api.clients.get.path, isAuthenticated, requirePermission("canViewClientDetails"), async (req, res) => {
    const client = await storage.getClient(Number(req.params.id));
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    res.json(client);
  });

  app.post(api.clients.create.path, isAuthenticated, requirePermission("canEditClients"), async (req, res) => {
    try {
      const input = api.clients.create.input.parse(req.body);
      const client = await storage.createClient({ ...input, createdBy: (req.user as any).id });
      res.status(201).json(client);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.clients.update.path, isAuthenticated, requirePermission("canEditClients"), async (req, res) => {
    const updated = await storage.updateClient(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ message: "Client not found" });
    res.json(updated);
  });

  app.post(api.clients.assign.path, isAuthenticated, requirePermission("canAccessClientAssignment"), async (req, res) => {
    const input = api.clients.assign.input.parse(req.body);
    await storage.assignClient({ ...input, assignedBy: (req.user as any).id });
    res.status(201).json({ message: "Assigned" });
  });

  app.get(api.clients.getAssignments.path, isAuthenticated, requirePermission("canAccessClientAssignment"), async (req, res) => {
    const employeeId = req.query.employeeId as string;
    // If no employeeId provided, assume current user
    const targetId = employeeId || (req.user as any).id;
    const assignments = await storage.getClientAssignments(targetId);
    res.json(assignments);
  });

  // === Tasks ===
  app.get(api.tasks.listMain.path, isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    const tasks = await storage.getMainTasks();
    res.json(tasks);
  });

  app.post(api.tasks.createMain.path, isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    const input = api.tasks.createMain.input.parse(req.body);
    const task = await storage.createMainTask(input);
    res.status(201).json(task);
  });

  app.put(api.tasks.updateMain.path, isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    const updated = await storage.updateMainTask(Number(req.params.id), req.body);
    res.json(updated);
  });

  app.get(api.tasks.listSub.path, isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    const tasks = await storage.getSubTasks(Number(req.params.id));
    res.json(tasks);
  });

  app.get('/api/tasks/sub/all', isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    const tasks = await storage.getAllSubTasks();
    res.json(tasks);
  });

  app.post(api.tasks.createSub.path, isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    const input = api.tasks.createSub.input.parse(req.body);
    const task = await storage.createSubTask(input);
    res.status(201).json(task);
  });

  app.put(api.tasks.updateSub.path, isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    const updated = await storage.updateSubTask(Number(req.params.id), req.body);
    res.json(updated);
  });

  app.delete('/api/tasks/main/:id', isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    try {
      await storage.deleteMainTask(Number(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      if (error.code === '23503') {
        res.status(400).json({ message: 'Cannot delete task: it has linked time entries. Please archive the task instead.' });
      } else {
        throw error;
      }
    }
  });

  app.delete('/api/tasks/sub/:id', isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    try {
      await storage.deleteSubTask(Number(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      if (error.code === '23503') {
        res.status(400).json({ message: 'Cannot delete sub-task: it has linked time entries. Please archive it instead.' });
      } else {
        throw error;
      }
    }
  });

  app.post('/api/tasks/main/reorder', isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    const { taskIds } = req.body;
    await storage.reorderMainTasks(taskIds);
    res.json({ success: true });
  });

  app.post('/api/tasks/sub/reorder', isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    const { mainTaskId, subTaskIds } = req.body;
    await storage.reorderSubTasks(mainTaskId, subTaskIds);
    res.json({ success: true });
  });

  // === Task Import/Export ===
  app.get('/api/tasks/export', isAuthenticated, requirePermission("canAccessTasks"), async (req, res) => {
    try {
      const mainTasks = await storage.getMainTasks();
      const allSubTasks = await storage.getAllSubTasks();

      const exportData: any[] = [];
      
      for (const task of mainTasks) {
        const subTasks = allSubTasks.filter(st => st.mainTaskId === task.id);
        
        if (subTasks.length === 0) {
          exportData.push({
            'Main Task': task.description,
            'Review Level': task.reviewLevel,
            'Has Sub-Tasks': task.hasSubTasks ? 'Yes' : 'No',
            'Requires Tax Year': task.requiresTaxYear ? 'Yes' : 'No',
            'Status': task.status,
            'Sub-Task': '',
            'Sub-Task Requires Tax Year': '',
            'Sub-Task Status': '',
          });
        } else {
          for (let i = 0; i < subTasks.length; i++) {
            const st = subTasks[i];
            exportData.push({
              'Main Task': i === 0 ? task.description : '',
              'Review Level': i === 0 ? task.reviewLevel : '',
              'Has Sub-Tasks': i === 0 ? 'Yes' : '',
              'Requires Tax Year': i === 0 ? (task.requiresTaxYear ? 'Yes' : 'No') : '',
              'Status': i === 0 ? task.status : '',
              'Sub-Task': st.description,
              'Sub-Task Requires Tax Year': st.requiresTaxYear ? 'Yes' : 'No',
              'Sub-Task Status': st.status,
            });
          }
        }
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      ws['!cols'] = [
        { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 10 },
        { wch: 40 }, { wch: 24 }, { wch: 14 }
      ];
      
      XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="tasks-export.xlsx"');
      res.send(buffer);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ message: 'Failed to export tasks' });
    }
  });

  // Configure multer for task import
  const taskImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ];
      if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
        cb(null, true);
      } else {
        cb(new Error('Only Excel files are allowed'));
      }
    },
  });

  app.post('/api/tasks/import', isAuthenticated, requirePermission("canAccessTasks"), taskImportUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      // Cache existing tasks upfront to avoid repeated queries
      let existingMainTasks = await storage.getMainTasks();
      const subTasksCache: Map<number, any[]> = new Map();
      
      let currentMainTask: any = null;
      let currentMainTaskMeta = { reviewLevel: 1, hasSubTasks: false, requiresTaxYear: false, status: 'Active' };
      let tasksCreated = 0;
      let subTasksCreated = 0;

      for (const row of data) {
        const mainTaskDesc = row['Main Task']?.toString().trim();
        const subTaskDesc = row['Sub-Task']?.toString().trim();

        if (mainTaskDesc) {
          // Parse metadata from the row (first occurrence of a main task)
          const reviewLevel = parseInt(row['Review Level']) || 1;
          const hasSubTasks = row['Has Sub-Tasks']?.toString().toLowerCase() === 'yes';
          const requiresTaxYear = row['Requires Tax Year']?.toString().toLowerCase() === 'yes';
          const status = row['Status']?.toString() || 'Active';
          
          // Store metadata for use in continuation rows
          currentMainTaskMeta = { reviewLevel, hasSubTasks, requiresTaxYear, status };

          // Check cache for existing task
          const existing = existingMainTasks.find(t => 
            t.description.toLowerCase() === mainTaskDesc.toLowerCase() && 
            t.reviewLevel === reviewLevel
          );

          if (existing) {
            currentMainTask = existing;
          } else {
            currentMainTask = await storage.createMainTask({
              description: mainTaskDesc,
              reviewLevel,
              hasSubTasks,
              requiresTaxYear,
              displayOrder: existingMainTasks.length,
              status,
            });
            // Add to cache
            existingMainTasks = [...existingMainTasks, currentMainTask];
            tasksCreated++;
          }
        }

        if (subTaskDesc && currentMainTask) {
          const stRequiresTaxYear = row['Sub-Task Requires Tax Year']?.toString().toLowerCase() === 'yes';
          const stStatus = row['Sub-Task Status']?.toString() || 'Active';

          // Get sub-tasks from cache or fetch once
          let existingSubTasks = subTasksCache.get(currentMainTask.id);
          if (!existingSubTasks) {
            existingSubTasks = await storage.getSubTasks(currentMainTask.id);
            subTasksCache.set(currentMainTask.id, existingSubTasks);
          }

          const existingSub = existingSubTasks.find(st => 
            st.description.toLowerCase() === subTaskDesc.toLowerCase()
          );

          if (!existingSub) {
            const newSubTask = await storage.createSubTask({
              mainTaskId: currentMainTask.id,
              description: subTaskDesc,
              requiresTaxYear: stRequiresTaxYear,
              displayOrder: existingSubTasks.length,
              status: stStatus,
            });
            // Add to cache
            existingSubTasks.push(newSubTask);
            subTasksCache.set(currentMainTask.id, existingSubTasks);
            subTasksCreated++;
          }
        }
      }

      res.json({ 
        success: true, 
        message: `Imported ${tasksCreated} main tasks and ${subTasksCreated} sub-tasks`,
        tasksCreated,
        subTasksCreated,
      });
    } catch (error) {
      console.error('Import error:', error);
      res.status(500).json({ message: 'Failed to import tasks' });
    }
  });

  // === Client Task Overrides ===
  app.get('/api/clients/:id/task-overrides', isAuthenticated, requirePermission("canViewClientDetails"), async (req, res) => {
    const overrides = await storage.getClientTaskOverrides(Number(req.params.id));
    res.json(overrides);
  });

  app.post('/api/clients/:id/task-overrides', isAuthenticated, requirePermission("canEditClients"), async (req, res) => {
    const override = await storage.upsertClientTaskOverride({
      clientId: Number(req.params.id),
      mainTaskId: req.body.mainTaskId,
      description: req.body.description,
    });
    res.status(201).json(override);
  });

  app.get('/api/clients/:id/subtask-overrides', isAuthenticated, requirePermission("canViewClientDetails"), async (req, res) => {
    const overrides = await storage.getClientSubtaskOverrides(Number(req.params.id));
    res.json(overrides);
  });

  app.post('/api/clients/:id/subtask-overrides', isAuthenticated, requirePermission("canEditClients"), async (req, res) => {
    const override = await storage.upsertClientSubtaskOverride({
      clientId: Number(req.params.id),
      subTaskId: req.body.subTaskId,
      description: req.body.description,
    });
    res.status(201).json(override);
  });

  // === Client Task Level Assignments ===
  app.get('/api/client-assignments/all', isAuthenticated, requirePermission("canAccessClientAssignment"), async (req, res) => {
    const assignments = await storage.getAllClientAssignmentsWithLevels();
    res.json(assignments);
  });
  
  app.get('/api/client-assignments/:employeeId', isAuthenticated, requirePermission("canAccessTimeEntries"), async (req, res) => {
    const user = req.user as any;
    const permissions = getPermissions(user.role);

    // Non-admin users can only fetch their own assignments
    const targetEmployeeId = permissions.canAccessDashboard ? req.params.employeeId : user.id;
    const assignments = await storage.getEmployeeClientAssignments(targetEmployeeId);
    res.json(assignments);
  });
  
  app.put('/api/client-assignments/task-level', isAuthenticated, requirePermission("canAccessClientAssignment"), async (req, res) => {
    const { employeeId, clientId, taskLevel } = req.body;
    await storage.updateClientTaskLevel(employeeId, clientId, taskLevel);
    res.json({ success: true });
  });

  // === Time Entries ===
  app.get(api.timeEntries.list.path, isAuthenticated, requirePermission("canAccessTimeEntries"), async (req, res) => {
    const user = req.user as any;
    const permissions = getPermissions(user.role);
    
    // Parse and validate query params
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    if (req.query.startDate) {
      const parsed = new Date(req.query.startDate as string);
      if (!isNaN(parsed.getTime())) {
        startDate = parsed;
      }
    }
    if (req.query.endDate) {
      const parsed = new Date(req.query.endDate as string);
      if (!isNaN(parsed.getTime())) {
        endDate = parsed;
      }
    }
    
    const filters: {
      employeeId?: string;
      clientId?: number;
      startDate?: Date;
      endDate?: Date;
    } = {
      startDate,
      endDate,
    };
    
    // Non-admin users can only see their own time entries
    if (!permissions.canAccessDashboard) {
      filters.employeeId = user.id;
    } else {
      // Admins can filter by employeeId or clientId
      filters.employeeId = req.query.employeeId as string | undefined;
      filters.clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
      // If no filters, default to all entries for admins
      if (!filters.clientId && !filters.employeeId) {
        filters.employeeId = undefined; // Return all for admin
      }
    }

    const entries = await storage.getTimeEntries(filters);
    res.json(entries);
  });

  app.post(api.timeEntries.create.path, isAuthenticated, requirePermission("canAccessTimeEntries"), async (req, res) => {
    try {
      const user = req.user as any;
      const permissions = getPermissions(user.role);

      const bodySchema = api.timeEntries.create.input.extend({
        startTime: z.coerce.date(),
        endTime: z.coerce.date().nullable().optional(),
      });
      const input = bodySchema.parse(req.body);

      // Non-admin users can only create time entries for themselves
      if (!permissions.canAccessDashboard) {
        input.employeeId = user.id;
      }
      
      const entry = await storage.createTimeEntry(input);
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.timeEntries.update.path, isAuthenticated, requirePermission("canAccessTimeEntries"), async (req, res) => {
    try {
      const user = req.user as any;
      const permissions = getPermissions(user.role);

      // Non-admin users can only update their own time entries
      if (!permissions.canAccessDashboard) {
        const existingEntry = await storage.getTimeEntry(Number(req.params.id));
        if (!existingEntry || existingEntry.employeeId !== user.id) {
          return res.status(403).json({ message: "You can only update your own time entries" });
        }
      }
      
      const bodySchema = api.timeEntries.update.input.extend({
        startTime: z.coerce.date().optional(),
        endTime: z.coerce.date().nullable().optional(),
      });
      const input = bodySchema.parse(req.body);
      
      // Non-admin users cannot change employeeId - strip it from updates
      if (!permissions.canAccessDashboard) {
        delete (input as any).employeeId;
      }
      
      const updated = await storage.updateTimeEntry(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.timeEntries.delete.path, isAuthenticated, requirePermission("canAccessTimeEntries"), async (req, res) => {
    const user = req.user as any;
    const permissions = getPermissions(user.role);

    // Non-admin users can only delete their own time entries
    if (!permissions.canAccessDashboard) {
      const existingEntry = await storage.getTimeEntry(Number(req.params.id));
      if (!existingEntry || existingEntry.employeeId !== user.id) {
        return res.status(403).json({ message: "You can only delete your own time entries" });
      }
    }
    
    await storage.deleteTimeEntry(Number(req.params.id));
    res.status(204).send();
  });

  // === Invoices ===
  app.get(api.invoices.list.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    const invoices = await storage.getInvoices();
    res.json(invoices);
  });

  app.get(api.invoices.get.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    const invoice = await storage.getInvoice(Number(req.params.id));
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json(invoice);
  });

  app.post(api.invoices.create.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    try {
      const bodySchema = api.invoices.create.input.extend({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      });
      const input = bodySchema.parse(req.body);
      const invoice = await storage.createInvoice({ ...input, generatedBy: (req.user as any).id });
      res.status(201).json(invoice);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.invoices.update.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    try {
      const bodySchema = api.invoices.update.input.extend({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      });
      const input = bodySchema.parse(req.body);
      const updated = await storage.updateInvoice(Number(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Invoice not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.invoices.delete.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    await storage.deleteInvoice(Number(req.params.id));
    res.status(204).send();
  });

  // Invoice Items
  app.get(api.invoices.listItems.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    const items = await storage.getInvoiceItems(Number(req.params.id));
    res.json(items);
  });

  app.post(api.invoices.createItems.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    try {
      const invoiceId = Number(req.params.id);
      // Pre-process items to convert workDate strings to Date objects
      const rawItems = Array.isArray(req.body) ? req.body : [];
      const processedItems = rawItems.map((item: any) => ({
        ...item,
        workDate: item.workDate ? new Date(item.workDate) : new Date(),
      }));
      const items = api.invoices.createItems.input.parse(processedItems);
      console.log('[API] Creating invoice items, count:', items.length);
      const itemsWithInvoiceId = items.map((item: any, index: number) => {
        let workDate: Date = new Date();
        if (item.workDate) {
          const parsed = new Date(item.workDate);
          if (!isNaN(parsed.getTime())) {
            workDate = parsed;
          }
        }
        console.log('[API] Item workDate:', item.workDate, '-> parsed:', workDate.toISOString());
        return {
          invoiceId,
          timeEntryId: item.timeEntryId,
          employeeName: item.employeeName || "Unknown",
          taskDescription: item.taskDescription || "Unknown Task",
          subTaskDescription: item.subTaskDescription || null,
          workDate,
          taxYear: item.taxYear || null,
          notes: item.notes || null,
          hours: item.hours?.toString() || "0",
          rateLevel: item.rateLevel || 1,
          rateAmount: item.rateAmount?.toString() || "0",
          lineTotal: item.lineTotal?.toString() || "0",
          displayOrder: item.displayOrder ?? index,
          included: item.included !== false,
        };
      });
      const created = await storage.createInvoiceItems(itemsWithInvoiceId);
      res.status(201).json(created);
    } catch (err) {
      console.error('[API] Error creating invoice items:', err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.invoices.updateItem.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    try {
      const updated = await storage.updateInvoiceItem(Number(req.params.itemId), req.body);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.invoices.deleteItem.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    await storage.deleteInvoiceItem(Number(req.params.itemId));
    res.status(204).send();
  });

  app.post(api.invoices.reorderItems.path, isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    const { itemIds } = api.invoices.reorderItems.input.parse(req.body);
    await storage.reorderInvoiceItems(Number(req.params.id), itemIds);
    res.json({ success: true });
  });

  // Invoice Settings
  app.get(api.invoiceSettings.get.path, isAuthenticated, requirePermission("canAccessInvoiceSettings"), async (req, res) => {
    const settings = await storage.getInvoiceSettings();
    res.json(settings || null);
  });

  app.put(api.invoiceSettings.update.path, isAuthenticated, requirePermission("canAccessInvoiceSettings"), async (req, res) => {
    const settings = await storage.updateInvoiceSettings(req.body);
    res.json(settings);
  });

  // Logo upload for invoice settings
  app.post('/api/invoice-settings/logo', isAuthenticated, requirePermission("canAccessInvoiceSettings"), logoUpload.single('logo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // Get current settings to delete old logo if exists
      const currentSettings = await storage.getInvoiceSettings();
      if (currentSettings?.defaultHeaderLogoUrl) {
        const oldPath = path.join(process.cwd(), currentSettings.defaultHeaderLogoUrl);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      
      const logoUrl = `/uploads/logos/${req.file.filename}`;
      const settings = await storage.updateInvoiceSettings({ defaultHeaderLogoUrl: logoUrl });
      res.json({ logoUrl, settings });
    } catch (error) {
      console.error('Logo upload error:', error);
      res.status(500).json({ message: 'Failed to upload logo' });
    }
  });

  // Remove logo from invoice settings
  app.delete('/api/invoice-settings/logo', isAuthenticated, requirePermission("canAccessInvoiceSettings"), async (req, res) => {
    try {
      const currentSettings = await storage.getInvoiceSettings();
      if (currentSettings?.defaultHeaderLogoUrl) {
        const logoPath = path.join(process.cwd(), currentSettings.defaultHeaderLogoUrl);
        if (fs.existsSync(logoPath)) {
          fs.unlinkSync(logoPath);
        }
      }
      
      const settings = await storage.updateInvoiceSettings({ defaultHeaderLogoUrl: null });
      res.json({ settings });
    } catch (error) {
      console.error('Logo delete error:', error);
      res.status(500).json({ message: 'Failed to delete logo' });
    }
  });

  // PDF Generation
  app.get('/api/invoices/:id/pdf', isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    try {
      const invoiceId = Number(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const client = await storage.getClient(invoice.clientId);
      const items = await storage.getInvoiceItems(invoiceId);
      const includedItems = items.filter(item => item.included);
      
      // Get global invoice settings for header/footer
      const settings = await storage.getInvoiceSettings();

      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
      doc.pipe(res);

      // Logo (top left)
      if (settings?.defaultHeaderLogoUrl) {
        const logoPath = path.join(process.cwd(), settings.defaultHeaderLogoUrl);
        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, 50, 50, { width: 100 });
            doc.moveDown(4);
          } catch (logoErr) {
            console.error('Failed to add logo to PDF:', logoErr);
          }
        }
      }

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
      doc.moveDown();
      
      if (settings?.defaultHeaderText) {
        doc.fontSize(10).font('Helvetica').text(settings.defaultHeaderText, { align: 'center' });
        doc.moveDown();
      }

      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      // Invoice details
      doc.fontSize(12).font('Helvetica-Bold').text(`Invoice #: ${invoice.invoiceNumber}`);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Client: ${client?.name || 'Unknown'}`);
      doc.text(`Period: ${new Date(invoice.startDate).toLocaleDateString()} - ${new Date(invoice.endDate).toLocaleDateString()}`);
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.moveDown();

      // Items table header
      const tableTop = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Date', 50, tableTop);
      doc.text('Task', 100, tableTop);
      doc.text('Hours', 380, tableTop, { width: 50, align: 'right' });
      doc.text('Rate', 430, tableTop, { width: 50, align: 'right' });
      doc.text('Total', 490, tableTop, { width: 50, align: 'right' });

      doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
      doc.moveDown(0.5);

      // Items
      doc.font('Helvetica').fontSize(8);
      includedItems.forEach(item => {
        const y = doc.y;
        const date = new Date(item.workDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const taskText = item.subTaskDescription 
          ? `${item.taskDescription} - ${item.subTaskDescription}`.substring(0, 50)
          : item.taskDescription.substring(0, 50);

        doc.text(date, 50, y);
        doc.text(taskText, 100, y);
        doc.text(parseFloat(item.hours?.toString() || "0").toFixed(2), 380, y, { width: 50, align: 'right' });
        doc.text(`$${parseFloat(item.rateAmount?.toString() || "0").toFixed(0)}`, 430, y, { width: 50, align: 'right' });
        doc.text(`$${parseFloat(item.lineTotal?.toString() || "0").toFixed(2)}`, 490, y, { width: 50, align: 'right' });
        doc.moveDown(0.5);
      });

      doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
      doc.moveDown();

      // Totals
      doc.font('Helvetica').fontSize(10);
      const subtotal = parseFloat(invoice.subtotal?.toString() || "0");
      const discount = parseFloat(invoice.discountAmount?.toString() || "0");
      const total = parseFloat(invoice.total?.toString() || "0");

      doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 400, doc.y, { align: 'right' });
      if (discount > 0) {
        doc.text(`Discount: -$${discount.toFixed(2)}${invoice.discountDescription ? ` (${invoice.discountDescription})` : ''}`, 400, doc.y, { align: 'right' });
      }
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`Total: $${total.toFixed(2)}`, 400, doc.y, { align: 'right' });

      // Notes
      if (invoice.summaryNotes) {
        doc.moveDown(2);
        doc.font('Helvetica-Bold').fontSize(10).text('Notes:');
        doc.font('Helvetica').fontSize(9).text(invoice.summaryNotes);
      }

      // Footer
      if (settings?.defaultFooterText) {
        doc.moveDown(2);
        doc.fontSize(8).text(settings.defaultFooterText, { align: 'center' });
      }

      doc.end();
    } catch (error) {
      console.error('PDF generation error:', error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Finalize invoice
  app.post('/api/invoices/:id/finalize', isAuthenticated, requirePermission("canAccessInvoices"), async (req, res) => {
    try {
      const invoiceId = Number(req.params.id);
      const updated = await storage.updateInvoice(invoiceId, { status: "Finalized" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to finalize invoice" });
    }
  });

  // === Rates ===
  app.get(api.rates.list.path, isAuthenticated, requirePermission("canAccessRates"), async (req, res) => {
    try {
      const rates = await storage.getHourlyRates();
      console.log(`[API] GET ${api.rates.list.path} returning ${rates.length} rates`);
      res.json(rates);
    } catch (error) {
      console.error(`[API] GET ${api.rates.list.path} error:`, error);
      res.status(500).json({ message: "Failed to fetch rates" });
    }
  });

  app.post(api.rates.update.path, isAuthenticated, requirePermission("canAccessRates"), async (req, res) => {
    try {
      console.log(`[API] POST ${api.rates.update.path} body:`, req.body);
      const input = api.rates.update.input.parse(req.body);
      const rate = await storage.createHourlyRate(input);
      res.status(201).json(rate);
    } catch (error) {
      console.error(`[API] POST ${api.rates.update.path} error:`, error);
      res.status(400).json({ message: "Invalid rate data" });
    }
  });

  // Seed Data
  seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const tasks = await storage.getMainTasks();
  if (tasks.length === 0) {
    console.log("Seeding database...");
    
    // Create Main Tasks
    const t1 = await storage.createMainTask({ description: "Document Review", reviewLevel: 1, hasSubTasks: true, displayOrder: 1, status: "Active" });
    const t2 = await storage.createMainTask({ description: "Legal Research", reviewLevel: 2, hasSubTasks: false, displayOrder: 2, status: "Active" });
    const t3 = await storage.createMainTask({ description: "Client Consultation", reviewLevel: 3, hasSubTasks: false, displayOrder: 3, status: "Active" });

    // Create Sub Tasks
    await storage.createSubTask({ mainTaskId: t1.id, description: "First Pass Review", displayOrder: 1, status: "Active" });
    await storage.createSubTask({ mainTaskId: t1.id, description: "Redaction Log", displayOrder: 2, status: "Active" });

    // Create Clients
    await storage.createClient({ name: "Acme Corp", contactInfo: "contact@acme.com", billingAddress: "123 Main St", status: "Active", createdBy: null });
    await storage.createClient({ name: "Globex Inc", contactInfo: "legal@globex.com", billingAddress: "456 Elm St", status: "Active", createdBy: null });

    // Create Rates
    await storage.createHourlyRate({ reviewLevel: 1, rateAmount: "150.00", effectiveDate: new Date() });
    await storage.createHourlyRate({ reviewLevel: 2, rateAmount: "250.00", effectiveDate: new Date() });
    await storage.createHourlyRate({ reviewLevel: 3, rateAmount: "400.00", effectiveDate: new Date() });

    console.log("Database seeded!");
  }
}
