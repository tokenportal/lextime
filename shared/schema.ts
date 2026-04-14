import { pgTable, text, serial, integer, boolean, timestamp, numeric, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactInfo: text("contact_info"),
  billingAddress: text("billing_address"),
  status: text("status").default("Active").notNull(), // Active, Inactive
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clientAssignments = pgTable("client_assignments", {
  id: serial("id").primaryKey(),
  employeeId: varchar("employee_id").references(() => users.id).notNull(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  taskLevel: integer("task_level"), // Per-client task level override (1, 2, 3), null = use employee's global level
  assignedBy: varchar("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

export const mainTasks = pgTable("main_tasks", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  reviewLevel: integer("review_level").notNull(), // 1, 2, 3
  hasSubTasks: boolean("has_sub_tasks").default(false).notNull(),
  requiresTaxYear: boolean("requires_tax_year").default(false).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  status: text("status").default("Active").notNull(), // Active, Inactive
  createdAt: timestamp("created_at").defaultNow(),
});

export const subTasks = pgTable("sub_tasks", {
  id: serial("id").primaryKey(),
  mainTaskId: integer("main_task_id").references(() => mainTasks.id).notNull(),
  description: text("description").notNull(),
  requiresTaxYear: boolean("requires_tax_year").default(false).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  status: text("status").default("Active").notNull(), // Active, Inactive
  createdAt: timestamp("created_at").defaultNow(),
});

export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  employeeId: varchar("employee_id").references(() => users.id).notNull(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  mainTaskId: integer("main_task_id").references(() => mainTasks.id).notNull(),
  subTaskId: integer("sub_task_id").references(() => subTasks.id),
  taxYear: integer("tax_year"), // Tax year for the work (e.g. 2024, 2025)
  description: text("description"), // Manual notes
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"), // Null if currently running
  pausedDuration: integer("paused_duration").default(0).notNull(), // In seconds
  totalDuration: integer("total_duration").default(0).notNull(), // In seconds, calculated on stop
  status: text("status").default("In Progress").notNull(), // In Progress, Paused, Completed
  rateLevel: integer("rate_level").default(1), // 1, 2, or 3 - which hourly rate to apply
  createdAt: timestamp("created_at").defaultNow(),
});

export const hourlyRates = pgTable("hourly_rates", {
  id: serial("id").primaryKey(),
  reviewLevel: integer("review_level").notNull(), // 1, 2, 3
  rateAmount: numeric("rate_amount").notNull(),
  effectiveDate: timestamp("effective_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  generatedBy: varchar("generated_by").references(() => users.id),
  generatedAt: timestamp("generated_at").defaultNow(),
  status: text("status").default("Draft").notNull(), // Draft, Finalized
  pdfUrl: text("pdf_url"),
  // Invoice customization
  headerText: text("header_text"), // Firm name, address, etc.
  headerLogoUrl: text("header_logo_url"),
  footerText: text("footer_text"),
  summaryNotes: text("summary_notes"), // Additional notes/memo
  discountAmount: numeric("discount_amount").default("0"),
  discountDescription: text("discount_description"),
  subtotal: numeric("subtotal").default("0"),
  total: numeric("total").default("0"),
});

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  timeEntryId: integer("time_entry_id").references(() => timeEntries.id), // Original time entry reference
  // Snapshot data (can be adjusted by attorney)
  employeeName: text("employee_name").notNull(),
  taskDescription: text("task_description").notNull(),
  subTaskDescription: text("sub_task_description"),
  workDate: timestamp("work_date").notNull(),
  taxYear: integer("tax_year"),
  notes: text("notes"),
  // Adjustable fields
  hours: numeric("hours").notNull(), // Decimal hours (e.g., 1.5, 0.25)
  rateLevel: integer("rate_level").notNull(), // 1, 2, or 3
  rateAmount: numeric("rate_amount").notNull(), // Rate at time of invoice
  lineTotal: numeric("line_total").notNull(), // hours * rateAmount
  // Display and inclusion
  displayOrder: integer("display_order").default(0).notNull(),
  included: boolean("included").default(true).notNull(), // Whether to include in invoice
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoiceSettings = pgTable("invoice_settings", {
  id: serial("id").primaryKey(),
  // Default header/footer for new invoices
  defaultHeaderText: text("default_header_text"),
  defaultHeaderLogoUrl: text("default_header_logo_url"),
  defaultFooterText: text("default_footer_text"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const clientTaskOverrides = pgTable("client_task_overrides", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  mainTaskId: integer("main_task_id").references(() => mainTasks.id).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const clientSubtaskOverrides = pgTable("client_subtask_overrides", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  subTaskId: integer("sub_task_id").references(() => subTasks.id).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === RELATIONS ===

export const usersRelations = relations(users, ({ many }) => ({
  clientAssignments: many(clientAssignments),
  timeEntries: many(timeEntries),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  assignments: many(clientAssignments),
}));

export const mainTasksRelations = relations(mainTasks, ({ many }) => ({
  subTasks: many(subTasks),
}));

export const subTasksRelations = relations(subTasks, ({ one }) => ({
  mainTask: one(mainTasks, {
    fields: [subTasks.mainTaskId],
    references: [mainTasks.id],
  }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  employee: one(users, {
    fields: [timeEntries.employeeId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [timeEntries.clientId],
    references: [clients.id],
  }),
  mainTask: one(mainTasks, {
    fields: [timeEntries.mainTaskId],
    references: [mainTasks.id],
  }),
  subTask: one(subTasks, {
    fields: [timeEntries.subTaskId],
    references: [subTasks.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
  timeEntry: one(timeEntries, {
    fields: [invoiceItems.timeEntryId],
    references: [timeEntries.id],
  }),
}));

// === ZOD SCHEMAS ===

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export const insertClientAssignmentSchema = createInsertSchema(clientAssignments).omit({ id: true, assignedAt: true });
export const insertMainTaskSchema = createInsertSchema(mainTasks).omit({ id: true, createdAt: true });
export const insertSubTaskSchema = createInsertSchema(subTasks).omit({ id: true, createdAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true, createdAt: true, totalDuration: true });
export const insertHourlyRateSchema = createInsertSchema(hourlyRates, {
  effectiveDate: z.coerce.date(),
}).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, generatedAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true, createdAt: true });
export const insertInvoiceSettingsSchema = createInsertSchema(invoiceSettings).omit({ id: true, updatedAt: true });
export const insertClientTaskOverrideSchema = createInsertSchema(clientTaskOverrides).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClientSubtaskOverrideSchema = createInsertSchema(clientSubtaskOverrides).omit({ id: true, createdAt: true, updatedAt: true });

// === TYPES ===
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type ClientAssignment = typeof clientAssignments.$inferSelect;
export type InsertClientAssignment = z.infer<typeof insertClientAssignmentSchema>;

export type MainTask = typeof mainTasks.$inferSelect;
export type InsertMainTask = z.infer<typeof insertMainTaskSchema>;

export type SubTask = typeof subTasks.$inferSelect;
export type InsertSubTask = z.infer<typeof insertSubTaskSchema>;

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

export type HourlyRate = typeof hourlyRates.$inferSelect;
export type InsertHourlyRate = z.infer<typeof insertHourlyRateSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;

export type InvoiceSettings = typeof invoiceSettings.$inferSelect;
export type InsertInvoiceSettings = z.infer<typeof insertInvoiceSettingsSchema>;

export type ClientTaskOverride = typeof clientTaskOverrides.$inferSelect;
export type InsertClientTaskOverride = z.infer<typeof insertClientTaskOverrideSchema>;

export type ClientSubtaskOverride = typeof clientSubtaskOverrides.$inferSelect;
export type InsertClientSubtaskOverride = z.infer<typeof insertClientSubtaskOverrideSchema>;
