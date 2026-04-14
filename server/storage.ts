import {
  users, clients, clientAssignments, mainTasks, subTasks, timeEntries, hourlyRates, invoices,
  invoiceItems, invoiceSettings,
  clientTaskOverrides, clientSubtaskOverrides,
  clientHourlyRates, roles,
  systemSettings, documentRequests, documentRequestItems, emailLogs,
  type User, type UpsertUser,
  type Client, type InsertClient,
  type MainTask, type InsertMainTask,
  type SubTask, type InsertSubTask,
  type TimeEntry, type InsertTimeEntry,
  type HourlyRate, type InsertHourlyRate,
  type Invoice, type InsertInvoice,
  type InvoiceItem, type InsertInvoiceItem,
  type InvoiceSettings, type InsertInvoiceSettings,
  type InsertClientAssignment,
  type ClientTaskOverride, type InsertClientTaskOverride,
  type ClientSubtaskOverride, type InsertClientSubtaskOverride,
  type ClientHourlyRate, type InsertClientHourlyRate,
  type Role, type InsertRole,
  type SystemSetting,
  type DocumentRequest, type InsertDocumentRequest,
  type DocumentRequestItem, type InsertDocumentRequestItem,
  type EmailLog, type InsertEmailLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, inArray, count } from "drizzle-orm";

export interface IStorage {
  // Users (Admin)
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Clients
  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, updates: Partial<InsertClient>): Promise<Client>;
  
  // Assignments
  assignClient(assignment: InsertClientAssignment): Promise<void>;
  getClientAssignments(employeeId: string): Promise<number[]>; // returns client IDs
  getClientsByEmployee(employeeId: string): Promise<Client[]>; // returns full client objects
  
  // Tasks
  getMainTasks(): Promise<MainTask[]>;
  createMainTask(task: InsertMainTask): Promise<MainTask>;
  updateMainTask(id: number, updates: Partial<InsertMainTask>): Promise<MainTask>;
  
  getSubTasks(mainTaskId: number): Promise<SubTask[]>;
  getAllSubTasks(): Promise<SubTask[]>;
  createSubTask(task: InsertSubTask): Promise<SubTask>;
  updateSubTask(id: number, updates: Partial<InsertSubTask>): Promise<SubTask>;
  
  // Time Entries
  getTimeEntries(filters?: { 
    employeeId?: string, 
    clientId?: number, 
    startDate?: Date, 
    endDate?: Date 
  }): Promise<TimeEntry[]>;
  getTimeEntry(id: number): Promise<TimeEntry | undefined>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: number, updates: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(id: number): Promise<void>;
  
  // Invoices
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<Invoice>;
  deleteInvoice(id: number): Promise<void>;
  
  // Invoice Items
  getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]>;
  createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem>;
  createInvoiceItems(items: InsertInvoiceItem[]): Promise<InvoiceItem[]>;
  updateInvoiceItem(id: number, updates: Partial<InsertInvoiceItem>): Promise<InvoiceItem>;
  deleteInvoiceItem(id: number): Promise<void>;
  reorderInvoiceItems(invoiceId: number, itemIds: number[]): Promise<void>;
  
  // Invoice Settings
  getInvoiceSettings(): Promise<InvoiceSettings | undefined>;
  updateInvoiceSettings(settings: Partial<InsertInvoiceSettings>): Promise<InvoiceSettings>;
  
  // Rates
  getHourlyRates(): Promise<HourlyRate[]>;
  createHourlyRate(rate: InsertHourlyRate): Promise<HourlyRate>;
  
  // Task management (admin)
  deleteMainTask(id: number): Promise<void>;
  deleteSubTask(id: number): Promise<void>;
  reorderMainTasks(taskIds: number[]): Promise<void>;
  reorderSubTasks(mainTaskId: number, subTaskIds: number[]): Promise<void>;
  
  // Client task overrides
  getClientTaskOverrides(clientId: number): Promise<ClientTaskOverride[]>;
  upsertClientTaskOverride(override: InsertClientTaskOverride): Promise<ClientTaskOverride>;
  getClientSubtaskOverrides(clientId: number): Promise<ClientSubtaskOverride[]>;
  upsertClientSubtaskOverride(override: InsertClientSubtaskOverride): Promise<ClientSubtaskOverride>;
  
  // Client-specific task level assignments
  getEmployeeClientAssignments(employeeId: string): Promise<{ clientId: number; taskLevel: number | null }[]>;
  getAllClientAssignmentsWithLevels(): Promise<{ id: number; employeeId: string; clientId: number; taskLevel: number | null }[]>;
  updateClientTaskLevel(employeeId: string, clientId: number, taskLevel: number | null): Promise<void>;

  // Client-specific hourly rate overrides
  getClientHourlyRates(clientId: number): Promise<ClientHourlyRate[]>;
  upsertClientHourlyRate(rate: InsertClientHourlyRate): Promise<ClientHourlyRate>;
  deleteClientHourlyRate(clientId: number, billingLevel: number): Promise<void>;

  // Delete client
  deleteClient(id: number): Promise<void>;

  // Roles
  getRoles(): Promise<Role[]>;
  getRole(id: number): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: number, updates: Partial<InsertRole>): Promise<Role>;
  deleteRole(id: number): Promise<void>;

  // Invoice sequence number
  getNextInvoiceSequenceNumber(clientId: number): Promise<number>;

  // System settings
  getSetting(key: string): Promise<string | null>;
  getSettings(keys: string[]): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;
  setSettings(settings: Record<string, string>): Promise<void>;

  // Document requests
  getDocumentRequests(clientId?: number): Promise<(DocumentRequest & { items: DocumentRequestItem[]; client: Client | null })[]>;
  getDocumentRequest(id: number): Promise<(DocumentRequest & { items: DocumentRequestItem[] }) | undefined>;
  createDocumentRequest(req: InsertDocumentRequest, items: InsertDocumentRequestItem[]): Promise<DocumentRequest>;
  updateDocumentRequest(id: number, updates: Partial<DocumentRequest>): Promise<DocumentRequest>;
  upsertDocumentRequestItems(requestId: number, items: InsertDocumentRequestItem[]): Promise<void>;
  getDueReminders(): Promise<(DocumentRequest & { client: Client | null })[]>;

  // Email logs
  createEmailLog(log: InsertEmailLog): Promise<EmailLog>;
  getEmailLogs(limit?: number): Promise<EmailLog[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  // Clients
  async getClients(): Promise<Client[]> {
    return await db.select().from(clients).orderBy(clients.name);
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [newClient] = await db.insert(clients).values(client).returning();
    return newClient;
  }

  async updateClient(id: number, updates: Partial<InsertClient>): Promise<Client> {
    const [updated] = await db.update(clients).set(updates).where(eq(clients.id, id)).returning();
    return updated;
  }

  // Assignments
  async assignClient(assignment: InsertClientAssignment): Promise<void> {
    // Check if exists
    const [existing] = await db.select().from(clientAssignments).where(
      and(
        eq(clientAssignments.employeeId, assignment.employeeId),
        eq(clientAssignments.clientId, assignment.clientId)
      )
    );
    
    if (!existing) {
      await db.insert(clientAssignments).values(assignment);
    }
  }

  async getClientAssignments(employeeId: string): Promise<number[]> {
    const assignments = await db.select().from(clientAssignments).where(eq(clientAssignments.employeeId, employeeId));
    return assignments.map(a => a.clientId);
  }

  async getClientsByEmployee(employeeId: string): Promise<Client[]> {
    const clientIds = await this.getClientAssignments(employeeId);
    if (clientIds.length === 0) return [];
    return await db.select().from(clients).where(inArray(clients.id, clientIds));
  }

  // Tasks
  async getMainTasks(): Promise<MainTask[]> {
    return await db.select().from(mainTasks).orderBy(mainTasks.displayOrder);
  }

  async createMainTask(task: InsertMainTask): Promise<MainTask> {
    const [newTask] = await db.insert(mainTasks).values(task).returning();
    return newTask;
  }

  async updateMainTask(id: number, updates: Partial<InsertMainTask>): Promise<MainTask> {
    const [updated] = await db.update(mainTasks).set(updates).where(eq(mainTasks.id, id)).returning();
    return updated;
  }

  async getSubTasks(mainTaskId: number): Promise<SubTask[]> {
    return await db.select().from(subTasks).where(eq(subTasks.mainTaskId, mainTaskId)).orderBy(subTasks.displayOrder);
  }

  async getAllSubTasks(): Promise<SubTask[]> {
    return await db.select().from(subTasks).orderBy(subTasks.mainTaskId, subTasks.displayOrder);
  }

  async createSubTask(task: InsertSubTask): Promise<SubTask> {
    const [newTask] = await db.insert(subTasks).values(task).returning();
    return newTask;
  }

  async updateSubTask(id: number, updates: Partial<InsertSubTask>): Promise<SubTask> {
    const [updated] = await db.update(subTasks).set(updates).where(eq(subTasks.id, id)).returning();
    return updated;
  }

  // Time Entries
  async getTimeEntries(filters?: { 
    employeeId?: string, 
    clientId?: number, 
    startDate?: Date, 
    endDate?: Date 
  }): Promise<TimeEntry[]> {
    let conditions = [];
    if (filters?.employeeId) conditions.push(eq(timeEntries.employeeId, filters.employeeId));
    if (filters?.clientId) conditions.push(eq(timeEntries.clientId, filters.clientId));
    
    if (filters?.startDate && filters.startDate instanceof Date && !isNaN(filters.startDate.getTime())) {
      conditions.push(gte(timeEntries.startTime, filters.startDate));
    }
    if (filters?.endDate && filters.endDate instanceof Date && !isNaN(filters.endDate.getTime())) {
      conditions.push(lte(timeEntries.startTime, filters.endDate));
    }

    return await db.query.timeEntries.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        client: true,
        mainTask: true,
        subTask: true,
        employee: true
      },
      orderBy: [desc(timeEntries.startTime)]
    });
  }
  
  async getTimeEntry(id: number): Promise<TimeEntry | undefined> {
    return await db.query.timeEntries.findFirst({
      where: eq(timeEntries.id, id)
    });
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const [newEntry] = await db.insert(timeEntries).values(entry).returning();
    return newEntry;
  }

  async updateTimeEntry(id: number, updates: Partial<InsertTimeEntry>): Promise<TimeEntry> {
    const [updated] = await db.update(timeEntries).set(updates).where(eq(timeEntries.id, id)).returning();
    return updated;
  }

  async deleteTimeEntry(id: number): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  }

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    return await db.select().from(invoices).orderBy(desc(invoices.generatedAt));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [newInvoice] = await db.insert(invoices).values(invoice).returning();
    return newInvoice;
  }

  async updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<Invoice> {
    const [updated] = await db.update(invoices).set(updates).where(eq(invoices.id, id)).returning();
    return updated;
  }

  async deleteInvoice(id: number): Promise<void> {
    // Delete items first
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  // Invoice Items
  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    return await db.select().from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId))
      .orderBy(invoiceItems.displayOrder);
  }

  async createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem> {
    const [newItem] = await db.insert(invoiceItems).values(item).returning();
    return newItem;
  }

  async createInvoiceItems(items: InsertInvoiceItem[]): Promise<InvoiceItem[]> {
    if (items.length === 0) return [];
    const newItems = await db.insert(invoiceItems).values(items).returning();
    return newItems;
  }

  async updateInvoiceItem(id: number, updates: Partial<InsertInvoiceItem>): Promise<InvoiceItem> {
    const [updated] = await db.update(invoiceItems).set(updates).where(eq(invoiceItems.id, id)).returning();
    return updated;
  }

  async deleteInvoiceItem(id: number): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.id, id));
  }

  async reorderInvoiceItems(invoiceId: number, itemIds: number[]): Promise<void> {
    for (let i = 0; i < itemIds.length; i++) {
      await db.update(invoiceItems)
        .set({ displayOrder: i })
        .where(and(eq(invoiceItems.id, itemIds[i]), eq(invoiceItems.invoiceId, invoiceId)));
    }
  }

  // Invoice Settings
  async getInvoiceSettings(): Promise<InvoiceSettings | undefined> {
    const [settings] = await db.select().from(invoiceSettings).limit(1);
    return settings;
  }

  async updateInvoiceSettings(settings: Partial<InsertInvoiceSettings>): Promise<InvoiceSettings> {
    const existing = await this.getInvoiceSettings();
    if (existing) {
      const [updated] = await db.update(invoiceSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(invoiceSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(invoiceSettings).values(settings).returning();
    return created;
  }

  // Rates
  async getHourlyRates(): Promise<HourlyRate[]> {
    return await db.select().from(hourlyRates).orderBy(hourlyRates.reviewLevel);
  }

  async createHourlyRate(rate: InsertHourlyRate): Promise<HourlyRate> {
    console.log(`[STORAGE] createHourlyRate called with:`, rate);
    const level = Number(rate.reviewLevel);
    
    // Check if a rate for this level already exists and update it, or create new
    const [existing] = await db.select().from(hourlyRates)
      .where(eq(hourlyRates.reviewLevel, level))
      .limit(1);

    if (existing) {
      console.log(`[STORAGE] Updating existing rate ID ${existing.id} for level ${level}: ${rate.rateAmount}`);
      const [updated] = await db.update(hourlyRates)
        .set({ 
          rateAmount: rate.rateAmount.toString(),
          effectiveDate: new Date()
        })
        .where(eq(hourlyRates.id, existing.id))
        .returning();
      console.log(`[STORAGE] Update successful:`, updated);
      return updated;
    }

    console.log(`[STORAGE] Creating new rate for level ${level}: ${rate.rateAmount}`);
    const [newRate] = await db.insert(hourlyRates).values({
      reviewLevel: level,
      rateAmount: rate.rateAmount.toString(),
      effectiveDate: new Date()
    }).returning();
    console.log(`[STORAGE] Creation successful:`, newRate);
    return newRate;
  }

  // Task management (admin)
  async deleteMainTask(id: number): Promise<void> {
    await db.delete(subTasks).where(eq(subTasks.mainTaskId, id));
    await db.delete(mainTasks).where(eq(mainTasks.id, id));
  }

  async deleteSubTask(id: number): Promise<void> {
    await db.delete(subTasks).where(eq(subTasks.id, id));
  }

  async reorderMainTasks(taskIds: number[]): Promise<void> {
    for (let i = 0; i < taskIds.length; i++) {
      await db.update(mainTasks).set({ displayOrder: i + 1 }).where(eq(mainTasks.id, taskIds[i]));
    }
  }

  async reorderSubTasks(mainTaskId: number, subTaskIds: number[]): Promise<void> {
    for (let i = 0; i < subTaskIds.length; i++) {
      await db.update(subTasks).set({ displayOrder: i + 1 }).where(eq(subTasks.id, subTaskIds[i]));
    }
  }

  // Client task overrides
  async getClientTaskOverrides(clientId: number): Promise<ClientTaskOverride[]> {
    return await db.select().from(clientTaskOverrides).where(eq(clientTaskOverrides.clientId, clientId));
  }

  async upsertClientTaskOverride(override: InsertClientTaskOverride): Promise<ClientTaskOverride> {
    const [existing] = await db.select().from(clientTaskOverrides).where(
      and(
        eq(clientTaskOverrides.clientId, override.clientId),
        eq(clientTaskOverrides.mainTaskId, override.mainTaskId)
      )
    );
    
    if (existing) {
      const [updated] = await db.update(clientTaskOverrides)
        .set({ description: override.description, updatedAt: new Date() })
        .where(eq(clientTaskOverrides.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(clientTaskOverrides).values(override).returning();
    return created;
  }

  async getClientSubtaskOverrides(clientId: number): Promise<ClientSubtaskOverride[]> {
    return await db.select().from(clientSubtaskOverrides).where(eq(clientSubtaskOverrides.clientId, clientId));
  }

  async upsertClientSubtaskOverride(override: InsertClientSubtaskOverride): Promise<ClientSubtaskOverride> {
    const [existing] = await db.select().from(clientSubtaskOverrides).where(
      and(
        eq(clientSubtaskOverrides.clientId, override.clientId),
        eq(clientSubtaskOverrides.subTaskId, override.subTaskId)
      )
    );
    
    if (existing) {
      const [updated] = await db.update(clientSubtaskOverrides)
        .set({ description: override.description, updatedAt: new Date() })
        .where(eq(clientSubtaskOverrides.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(clientSubtaskOverrides).values(override).returning();
    return created;
  }
  
  // Client-specific task level assignments
  async getEmployeeClientAssignments(employeeId: string): Promise<{ clientId: number; taskLevel: number | null }[]> {
    const assignments = await db.select({
      clientId: clientAssignments.clientId,
      taskLevel: clientAssignments.taskLevel
    }).from(clientAssignments).where(eq(clientAssignments.employeeId, employeeId));
    return assignments;
  }
  
  async getAllClientAssignmentsWithLevels(): Promise<{ id: number; employeeId: string; clientId: number; taskLevel: number | null }[]> {
    return await db.select({
      id: clientAssignments.id,
      employeeId: clientAssignments.employeeId,
      clientId: clientAssignments.clientId,
      taskLevel: clientAssignments.taskLevel
    }).from(clientAssignments);
  }
  
  async updateClientTaskLevel(employeeId: string, clientId: number, taskLevel: number | null): Promise<void> {
    const existing = await db.select()
      .from(clientAssignments)
      .where(
        and(
          eq(clientAssignments.employeeId, employeeId),
          eq(clientAssignments.clientId, clientId)
        )
      );

    if (existing.length > 0) {
      await db.update(clientAssignments)
        .set({ taskLevel })
        .where(
          and(
            eq(clientAssignments.employeeId, employeeId),
            eq(clientAssignments.clientId, clientId)
          )
        );
    } else {
      await db.insert(clientAssignments).values({
        employeeId,
        clientId,
        taskLevel,
        assignedBy: employeeId,
        assignedAt: new Date(),
      });
    }
  }

  // Client-specific hourly rate overrides
  async getClientHourlyRates(clientId: number): Promise<ClientHourlyRate[]> {
    return await db.select().from(clientHourlyRates)
      .where(eq(clientHourlyRates.clientId, clientId))
      .orderBy(clientHourlyRates.billingLevel);
  }

  async upsertClientHourlyRate(rate: InsertClientHourlyRate): Promise<ClientHourlyRate> {
    const [existing] = await db.select().from(clientHourlyRates).where(
      and(
        eq(clientHourlyRates.clientId, rate.clientId),
        eq(clientHourlyRates.billingLevel, rate.billingLevel)
      )
    );
    if (existing) {
      const [updated] = await db.update(clientHourlyRates)
        .set({ rateAmount: rate.rateAmount.toString(), updatedAt: new Date() })
        .where(eq(clientHourlyRates.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(clientHourlyRates).values({
      ...rate,
      rateAmount: rate.rateAmount.toString(),
    }).returning();
    return created;
  }

  async deleteClientHourlyRate(clientId: number, billingLevel: number): Promise<void> {
    await db.delete(clientHourlyRates).where(
      and(
        eq(clientHourlyRates.clientId, clientId),
        eq(clientHourlyRates.billingLevel, billingLevel)
      )
    );
  }

  // Delete client (admin-only)
  async deleteClient(id: number): Promise<void> {
    await db.delete(clientAssignments).where(eq(clientAssignments.clientId, id));
    await db.delete(clientTaskOverrides).where(eq(clientTaskOverrides.clientId, id));
    await db.delete(clientSubtaskOverrides).where(eq(clientSubtaskOverrides.clientId, id));
    await db.delete(clientHourlyRates).where(eq(clientHourlyRates.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
  }

  // Roles
  async getRoles(): Promise<Role[]> {
    return await db.select().from(roles).orderBy(roles.name);
  }

  async getRole(id: number): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role;
  }

  async createRole(role: InsertRole): Promise<Role> {
    const [created] = await db.insert(roles).values({
      ...role,
      permissions: role.permissions as Record<string, boolean>,
    }).returning();
    return created;
  }

  async updateRole(id: number, updates: Partial<InsertRole>): Promise<Role> {
    const [updated] = await db.update(roles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    return updated;
  }

  async deleteRole(id: number): Promise<void> {
    await db.delete(roles).where(and(eq(roles.id, id), eq(roles.isDefault, false)));
  }

  // Invoice sequence number
  async getNextInvoiceSequenceNumber(clientId: number): Promise<number> {
    const [result] = await db.select({ total: count() })
      .from(invoices)
      .where(eq(invoices.clientId, clientId));
    return (result?.total ?? 0) + 1;
  }

  // System settings
  async getSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return row?.value ?? null;
  }

  async getSettings(keys: string[]): Promise<Record<string, string>> {
    const rows = await db.select().from(systemSettings).where(inArray(systemSettings.key, keys));
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (row.value !== null && row.value !== undefined) result[row.key] = row.value;
    }
    return result;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    if (existing.length > 0) {
      await db.update(systemSettings).set({ value, updatedAt: new Date() }).where(eq(systemSettings.key, key));
    } else {
      await db.insert(systemSettings).values({ key, value });
    }
  }

  async setSettings(settings: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.setSetting(key, value);
    }
  }

  // Document requests
  async getDocumentRequests(clientId?: number): Promise<(DocumentRequest & { items: DocumentRequestItem[]; client: Client | null })[]> {
    const reqs = clientId
      ? await db.select().from(documentRequests).where(eq(documentRequests.clientId, clientId)).orderBy(desc(documentRequests.createdAt))
      : await db.select().from(documentRequests).orderBy(desc(documentRequests.createdAt));
    const results = [];
    for (const req of reqs) {
      const items = await db.select().from(documentRequestItems)
        .where(eq(documentRequestItems.requestId, req.id))
        .orderBy(documentRequestItems.displayOrder);
      const [client] = await db.select().from(clients).where(eq(clients.id, req.clientId));
      results.push({ ...req, items, client: client ?? null });
    }
    return results;
  }

  async getDocumentRequest(id: number): Promise<(DocumentRequest & { items: DocumentRequestItem[] }) | undefined> {
    const [req] = await db.select().from(documentRequests).where(eq(documentRequests.id, id));
    if (!req) return undefined;
    const items = await db.select().from(documentRequestItems)
      .where(eq(documentRequestItems.requestId, id))
      .orderBy(documentRequestItems.displayOrder);
    return { ...req, items };
  }

  async createDocumentRequest(req: InsertDocumentRequest, items: InsertDocumentRequestItem[]): Promise<DocumentRequest> {
    const [created] = await db.insert(documentRequests).values(req).returning();
    if (items.length > 0) {
      await db.insert(documentRequestItems).values(items.map((item, i) => ({ ...item, requestId: created.id, displayOrder: i })));
    }
    return created;
  }

  async updateDocumentRequest(id: number, updates: Partial<DocumentRequest>): Promise<DocumentRequest> {
    const [updated] = await db.update(documentRequests).set({ ...updates, updatedAt: new Date() }).where(eq(documentRequests.id, id)).returning();
    return updated;
  }

  async upsertDocumentRequestItems(requestId: number, items: InsertDocumentRequestItem[]): Promise<void> {
    await db.delete(documentRequestItems).where(eq(documentRequestItems.requestId, requestId));
    if (items.length > 0) {
      await db.insert(documentRequestItems).values(items.map((item, i) => ({ ...item, requestId, displayOrder: i })));
    }
  }

  async getDueReminders(): Promise<(DocumentRequest & { client: Client | null })[]> {
    const now = new Date();
    const reqs = await db.select().from(documentRequests).where(
      and(
        eq(documentRequests.status, "Sent"),
      )
    );
    const due = reqs.filter(r => r.nextReminderAt && r.nextReminderAt <= now);
    const results = [];
    for (const req of due) {
      const [client] = await db.select().from(clients).where(eq(clients.id, req.clientId));
      results.push({ ...req, client: client ?? null });
    }
    return results;
  }

  // Email logs
  async createEmailLog(log: InsertEmailLog): Promise<EmailLog> {
    const [created] = await db.insert(emailLogs).values(log).returning();
    return created;
  }

  async getEmailLogs(limit = 50): Promise<EmailLog[]> {
    return await db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(limit);
  }
}

export const storage = new DatabaseStorage();
