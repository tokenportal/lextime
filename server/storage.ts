import { 
  users, clients, clientAssignments, mainTasks, subTasks, timeEntries, hourlyRates, invoices,
  invoiceItems, invoiceSettings,
  clientTaskOverrides, clientSubtaskOverrides,
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
  type ClientSubtaskOverride, type InsertClientSubtaskOverride
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
