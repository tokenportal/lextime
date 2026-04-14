import { z } from 'zod';
import { 
  insertClientSchema, 
  insertClientAssignmentSchema, 
  insertMainTaskSchema, 
  insertSubTaskSchema, 
  insertTimeEntrySchema, 
  insertHourlyRateSchema, 
  insertInvoiceSchema,
  insertInvoiceItemSchema,
  insertInvoiceSettingsSchema,
  clients,
  mainTasks,
  subTasks,
  timeEntries,
  users,
  invoices,
  invoiceItems,
  invoiceSettings,
  hourlyRates
} from './schema';

export {
  insertClientSchema, 
  insertClientAssignmentSchema, 
  insertMainTaskSchema, 
  insertSubTaskSchema, 
  insertTimeEntrySchema, 
  insertHourlyRateSchema, 
  insertInvoiceSchema,
  insertInvoiceItemSchema,
  insertInvoiceSettingsSchema
};

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users',
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/users/:id',
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/users/:id',
      input: z.object({
        role: z.string().optional(), // Now any custom role name
        reviewLevel: z.number().optional(),
        status: z.enum(["Active", "Inactive"]).optional(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    }
  },
  clients: {
    list: {
      method: 'GET' as const,
      path: '/api/clients',
      responses: {
        200: z.array(z.custom<typeof clients.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/clients/:id',
      responses: {
        200: z.custom<typeof clients.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/clients',
      input: insertClientSchema,
      responses: {
        201: z.custom<typeof clients.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/clients/:id',
      input: insertClientSchema.partial(),
      responses: {
        200: z.custom<typeof clients.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    assign: {
      method: 'POST' as const,
      path: '/api/clients/assign',
      input: insertClientAssignmentSchema,
      responses: {
        201: z.object({ message: z.string() }),
      }
    },
    getAssignments: {
      method: 'GET' as const,
      path: '/api/clients/assignments', // ?employeeId=...
      responses: {
        200: z.array(z.number()), // Returns array of client IDs
      }
    }
  },
  tasks: {
    listMain: {
      method: 'GET' as const,
      path: '/api/tasks/main',
      responses: {
        200: z.array(z.custom<typeof mainTasks.$inferSelect>()),
      },
    },
    createMain: {
      method: 'POST' as const,
      path: '/api/tasks/main',
      input: insertMainTaskSchema,
      responses: {
        201: z.custom<typeof mainTasks.$inferSelect>(),
      },
    },
    updateMain: {
      method: 'PUT' as const,
      path: '/api/tasks/main/:id',
      input: insertMainTaskSchema.partial(),
      responses: {
        200: z.custom<typeof mainTasks.$inferSelect>(),
      },
    },
    listSub: {
      method: 'GET' as const,
      path: '/api/tasks/main/:id/sub',
      responses: {
        200: z.array(z.custom<typeof subTasks.$inferSelect>()),
      },
    },
    createSub: {
      method: 'POST' as const,
      path: '/api/tasks/sub',
      input: insertSubTaskSchema,
      responses: {
        201: z.custom<typeof subTasks.$inferSelect>(),
      },
    },
    updateSub: {
      method: 'PUT' as const,
      path: '/api/tasks/sub/:id',
      input: insertSubTaskSchema.partial(),
      responses: {
        200: z.custom<typeof subTasks.$inferSelect>(),
      },
    }
  },
  timeEntries: {
    list: {
      method: 'GET' as const,
      path: '/api/time-entries',
      input: z.object({
        employeeId: z.string().optional(),
        clientId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof timeEntries.$inferSelect & { 
          client: typeof clients.$inferSelect,
          mainTask: typeof mainTasks.$inferSelect,
          subTask: typeof subTasks.$inferSelect | null,
          employee: typeof users.$inferSelect
        }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/time-entries',
      input: insertTimeEntrySchema,
      responses: {
        201: z.custom<typeof timeEntries.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/time-entries/:id',
      input: insertTimeEntrySchema.partial().extend({
        status: z.enum(["In Progress", "Paused", "Completed"]).optional(),
        pausedDuration: z.number().optional(),
        totalDuration: z.number().optional(),
        endTime: z.string().nullable().optional(),
        rateLevel: z.number().nullable().optional(),
        billingLevel: z.number().nullable().optional(),
      }),
      responses: {
        200: z.custom<typeof timeEntries.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/time-entries/:id',
      responses: {
        204: z.void(),
      },
    }
  },
  invoices: {
    list: {
      method: 'GET' as const,
      path: '/api/invoices',
      responses: {
        200: z.array(z.custom<typeof invoices.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/invoices/:id',
      responses: {
        200: z.custom<typeof invoices.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/invoices',
      input: insertInvoiceSchema,
      responses: {
        201: z.custom<typeof invoices.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/invoices/:id',
      input: insertInvoiceSchema.partial(),
      responses: {
        200: z.custom<typeof invoices.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/invoices/:id',
      responses: {
        204: z.void(),
      },
    },
    // Invoice items
    listItems: {
      method: 'GET' as const,
      path: '/api/invoices/:id/items',
      responses: {
        200: z.array(z.custom<typeof invoiceItems.$inferSelect>()),
      },
    },
    createItems: {
      method: 'POST' as const,
      path: '/api/invoices/:id/items',
      input: z.array(insertInvoiceItemSchema.omit({ invoiceId: true })),
      responses: {
        201: z.array(z.custom<typeof invoiceItems.$inferSelect>()),
      },
    },
    updateItem: {
      method: 'PUT' as const,
      path: '/api/invoices/:invoiceId/items/:itemId',
      input: insertInvoiceItemSchema.partial(),
      responses: {
        200: z.custom<typeof invoiceItems.$inferSelect>(),
      },
    },
    deleteItem: {
      method: 'DELETE' as const,
      path: '/api/invoices/:invoiceId/items/:itemId',
      responses: {
        204: z.void(),
      },
    },
    reorderItems: {
      method: 'POST' as const,
      path: '/api/invoices/:id/items/reorder',
      input: z.object({ itemIds: z.array(z.number()) }),
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
  invoiceSettings: {
    get: {
      method: 'GET' as const,
      path: '/api/invoice-settings',
      responses: {
        200: z.custom<typeof invoiceSettings.$inferSelect>().nullable(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/invoice-settings',
      input: insertInvoiceSettingsSchema.partial(),
      responses: {
        200: z.custom<typeof invoiceSettings.$inferSelect>(),
      },
    },
  },
  rates: {
    list: {
      method: 'GET' as const,
      path: '/api/rates',
      responses: {
        200: z.array(z.custom<typeof hourlyRates.$inferSelect>()),
      },
    },
    update: {
      method: 'POST' as const,
      path: '/api/rates',
      input: insertHourlyRateSchema,
      responses: {
        201: z.custom<typeof hourlyRates.$inferSelect>(),
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
