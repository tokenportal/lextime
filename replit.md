# Lex Time - Legal Time Tracking Application

## Overview

Lex Time is a premium time tracking application designed for legal professionals. It enables law firm employees to track billable hours against clients and tasks, while administrators manage users, clients, tasks, hourly rates, and invoices. The application features role-based access control with three user levels: Employee, Admin Assistant, and Administrator.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens (navy, gold, cream law firm palette)
- **Fonts**: Cinzel (display/headings) and Inter (body text)

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **Build Tool**: esbuild for server bundling, Vite for client bundling
- **API Pattern**: RESTful endpoints defined in shared route contracts with Zod validation

### Authentication System
- **Provider**: Replit OpenID Connect (OIDC) authentication
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple
- **Session Management**: express-session with Passport.js integration
- **User Roles**: Admin, Assistant, Accountant with comprehensive RBAC protection

### Role-Based Access Control (RBAC)
The application implements a comprehensive permission system defined in `shared/permissions.ts`:

**Roles and Capabilities:**
- **Admin**: Full access to all features (Dashboard, Time Tracker, all Admin pages)
- **Assistant**: Clients page only (can edit but not view client details), no Dashboard or Time Tracker access
- **Accountant**: Time Tracker only (self-scoped access to own time entries), no admin access

**First User Admin Bootstrap:**
- The first user to log in automatically becomes an Admin
- Subsequent users default to "Employee" (Accountant) role
- Admins can change user roles via the Users page

**Backend Protection:**
- All API routes protected with `requirePermission` middleware
- Role resolved from `user.profile?.role` in session
- Time entry CRUD enforces user-scoping for non-admin roles
- Non-admins cannot access other users' time entries or reassign ownership

**Frontend Protection:**
- Page-level guards with Redirect components for unauthorized access
- Navigation items hidden based on role permissions via Layout.tsx

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Validation**: drizzle-zod for automatic Zod schema generation from database tables
- **Migration Strategy**: Push-based migrations via `drizzle-kit push`

### Data Models
- **Users**: Managed by Replit Auth with extended fields (role, reviewLevel, status)
- **Clients**: Company/individual client records with assignment relationships
- **Tasks**: Hierarchical main tasks and sub-tasks with review levels
- **Time Entries**: Employee time logs with start/end times, pause tracking, and status
- **Hourly Rates**: Client-specific billing rates by task and review level
- **Invoices**: Generated billing documents linking time entries to clients

### Shared Code Pattern
The `shared/` directory contains code used by both client and server:
- `schema.ts`: Drizzle table definitions and Zod schemas
- `routes.ts`: API contract definitions with input/output validation
- `models/auth.ts`: User and session table definitions

## External Dependencies

### Database
- **PostgreSQL**: Primary data store accessed via DATABASE_URL environment variable
- **Drizzle ORM**: Type-safe database queries and migrations

### Authentication
- **Replit OIDC**: External identity provider (ISSUER_URL defaults to https://replit.com/oidc)
- **Required Secrets**: SESSION_SECRET, REPL_ID (provided by Replit environment)

### UI Libraries
- **Radix UI**: Headless component primitives for accessibility
- **Lucide React**: Icon library
- **date-fns**: Date formatting and manipulation
- **recharts**: Dashboard charts and visualizations
- **embla-carousel-react**: Carousel components

### Development Tools
- **Vite**: Development server with HMR and production builds
- **Replit Plugins**: cartographer, dev-banner, runtime-error-modal for enhanced development experience