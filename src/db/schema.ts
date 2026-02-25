import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    decimal,
    integer,
    index,
    uniqueIndex,
    date,
    boolean,
    jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================
// ORGANIZATIONS
// ============================================================
export const organizations = pgTable("organizations", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    businessType: varchar("business_type", { length: 100 }),
    taxId: varchar("tax_id", { length: 100 }),
    address: text("address"),
    domain: varchar("domain", { length: 255 }),
    timezone: varchar("timezone", { length: 100 }).default("Asia/Manila"),
    logoUrl: varchar("logo_url", { length: 500 }),
    status: varchar("status", { length: 50 }).notNull().default("active"), // active, suspended

    // Billing & Subscription Fields
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    planId: varchar("plan_id", { length: 50 }).default("free"), // free, promo, standard
    subscriptionStatus: varchar("subscription_status", { length: 50 }).default("trialing"), // trialing, active, past_due, canceled
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    promoEndsAt: timestamp("promo_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),

    // Add-ons
    addonGuards: integer("addon_guards").notNull().default(0),
    addonAdmins: integer("addon_admins").notNull().default(0),
    addonStorage: integer("addon_storage").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
    users: many(users),
    billing: many(billing),
    paymentMethods: many(paymentMethods),
    auditLogs: many(auditLogs),
    apiKeys: many(apiKeys),
    webhooks: many(webhooks),
    integrations: many(integrations),
    adminSettings: many(adminSettings),
    sites: many(sites),
}));

// ============================================================
// USERS
// ============================================================
export const users = pgTable(
    "users",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        name: varchar("name", { length: 255 }).notNull(),
        email: varchar("email", { length: 255 }).notNull(),
        passwordHash: varchar("password_hash", { length: 255 }).notNull(),
        role: varchar("role", { length: 50 }).notNull().default("guard"),
        status: varchar("status", { length: 50 }).notNull().default("active"),
        badgeId: varchar("badge_id", { length: 100 }),
        phone: varchar("phone", { length: 50 }),
        organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("users_email_idx").on(table.email),
        uniqueIndex("users_badge_id_idx").on(table.badgeId),
    ]
);

export const usersRelations = relations(users, ({ one, many }) => ({
    organization: one(organizations, { fields: [users.organizationId], references: [organizations.id] }),
    shifts: many(shifts),
    refreshTokens: many(refreshTokens),
    schedules: many(schedules),
    leaveRequests: many(leaveRequests),
    sentMessages: many(messages),
}));

// ============================================================
// SITES (From/To address-based boundary)
// ============================================================
export const sites = pgTable("sites", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    addressFrom: text("address_from").notNull(),
    addressTo: text("address_to").notNull(),
    latFrom: decimal("lat_from", { precision: 10, scale: 7 }).notNull(),
    lngFrom: decimal("lng_from", { precision: 10, scale: 7 }).notNull(),
    latTo: decimal("lat_to", { precision: 10, scale: 7 }).notNull(),
    lngTo: decimal("lng_to", { precision: 10, scale: 7 }).notNull(),
    bufferMeters: integer("buffer_meters").notNull().default(100),
    boundaryGeojson: text("boundary_geojson"),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const sitesRelations = relations(sites, ({ one, many }) => ({
    organization: one(organizations, { fields: [sites.organizationId], references: [organizations.id] }),
    shifts: many(shifts),
    schedules: many(schedules),
    chatRooms: many(chatRooms),
}));

// ============================================================
// SHIFTS
// ============================================================
export const shifts = pgTable(
    "shifts",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        guardId: uuid("guard_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        siteId: uuid("site_id")
            .references(() => sites.id, { onDelete: "set null" }),
        startTime: timestamp("start_time", { withTimezone: true }).notNull().defaultNow(),
        endTime: timestamp("end_time", { withTimezone: true }),
        status: varchar("status", { length: 50 }).notNull().default("active"),
        timeInConfirmed: timestamp("time_in_confirmed", { withTimezone: true }),
    },
    (table) => [
        index("shifts_guard_id_idx").on(table.guardId),
        index("shifts_status_idx").on(table.status),
    ]
);

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
    guard: one(users, { fields: [shifts.guardId], references: [users.id] }),
    site: one(sites, { fields: [shifts.siteId], references: [sites.id] }),
    incidents: many(incidents),
    guardLocations: many(guardLocations),
    alerts: many(alerts),
}));

// ============================================================
// INCIDENTS
// ============================================================
export const incidents = pgTable(
    "incidents",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        shiftId: uuid("shift_id")
            .notNull()
            .references(() => shifts.id, { onDelete: "cascade" }),
        description: text("description").notNull(),
        photoPath: varchar("photo_path", { length: 500 }),
        videoPath: varchar("video_path", { length: 500 }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("incidents_shift_id_idx").on(table.shiftId),
    ]
);

export const incidentsRelations = relations(incidents, ({ one }) => ({
    shift: one(shifts, { fields: [incidents.shiftId], references: [shifts.id] }),
}));

// ============================================================
// REFRESH TOKENS
// ============================================================
export const refreshTokens = pgTable(
    "refresh_tokens",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tokenHash: varchar("token_hash", { length: 255 }).notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("refresh_tokens_user_id_idx").on(table.userId),
    ]
);

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
    user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

// ============================================================
// GUARD LOCATIONS (GPS Tracking)
// ============================================================
export const guardLocations = pgTable(
    "guard_locations",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        guardId: uuid("guard_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        shiftId: uuid("shift_id")
            .notNull()
            .references(() => shifts.id, { onDelete: "cascade" }),
        latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
        longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
        accuracy: decimal("accuracy", { precision: 6, scale: 2 }),
        speed: decimal("speed", { precision: 6, scale: 2 }),
        heading: decimal("heading", { precision: 6, scale: 2 }),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("guard_locations_shift_recorded_idx").on(table.shiftId, table.recordedAt),
        index("guard_locations_guard_id_idx").on(table.guardId),
    ]
);

export const guardLocationsRelations = relations(guardLocations, ({ one }) => ({
    guard: one(users, { fields: [guardLocations.guardId], references: [users.id] }),
    shift: one(shifts, { fields: [guardLocations.shiftId], references: [shifts.id] }),
}));

// ============================================================
// CHECKPOINTS
// ============================================================
export const checkpoints = pgTable("checkpoints", {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
    qrCode: varchar("qr_code", { length: 255 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const checkpointLogs = pgTable("checkpoint_logs", {
    id: uuid("id").defaultRandom().primaryKey(),
    checkpointId: uuid("checkpoint_id").references(() => checkpoints.id, { onDelete: "set null" }),
    shiftId: uuid("shift_id").notNull().references(() => shifts.id, { onDelete: "cascade" }),
    guardId: uuid("guard_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
    scanMethod: varchar("scan_method", { length: 20 }).notNull().default("gps"), // gps, qr
});

// ============================================================
// ALERTS
// ============================================================
export const alerts = pgTable(
    "alerts",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        shiftId: uuid("shift_id")
            .notNull()
            .references(() => shifts.id, { onDelete: "cascade" }),
        type: varchar("type", { length: 50 }).notNull(),
        message: text("message").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    },
    (table) => [
        index("alerts_shift_id_idx").on(table.shiftId),
        index("alerts_type_idx").on(table.type),
    ]
);

export const alertsRelations = relations(alerts, ({ one }) => ({
    shift: one(shifts, { fields: [alerts.shiftId], references: [shifts.id] }),
}));

// ============================================================
// SCHEDULES (Admin assigns guard → site → day → time)
// ============================================================
export const schedules = pgTable(
    "schedules",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        guardId: uuid("guard_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        siteId: uuid("site_id")
            .references(() => sites.id, { onDelete: "set null" }),
        dayOfWeek: integer("day_of_week").notNull(), // 0=Sun, 1=Mon ... 6=Sat
        startTime: varchar("start_time", { length: 5 }).notNull(), // "18:00"
        endTime: varchar("end_time", { length: 5 }).notNull(),     // "06:00"
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("schedules_guard_id_idx").on(table.guardId),
        index("schedules_site_id_idx").on(table.siteId),
    ]
);

export const schedulesRelations = relations(schedules, ({ one }) => ({
    guard: one(users, { fields: [schedules.guardId], references: [users.id] }),
    site: one(sites, { fields: [schedules.siteId], references: [sites.id] }),
}));

// ============================================================
// LEAVE REQUESTS
// ============================================================
export const leaveRequests = pgTable(
    "leave_requests",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        guardId: uuid("guard_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        requestDate: date("request_date").notNull(), // the date they want off
        reason: varchar("reason", { length: 50 }).notNull(), // "emergency", "sick", "personal"
        notes: text("notes"),
        status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, approved, denied
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    },
    (table) => [
        index("leave_requests_guard_id_idx").on(table.guardId),
        index("leave_requests_date_idx").on(table.requestDate),
    ]
);

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
    guard: one(users, { fields: [leaveRequests.guardId], references: [users.id] }),
}));

// ============================================================
// CHAT ROOMS (1-on-1 + Site groups)
// ============================================================
export const chatRooms = pgTable("chat_rooms", {
    id: uuid("id").defaultRandom().primaryKey(),
    type: varchar("type", { length: 20 }).notNull(), // "direct" | "site_group"
    name: varchar("name", { length: 255 }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatRoomsRelations = relations(chatRooms, ({ one, many }) => ({
    site: one(sites, { fields: [chatRooms.siteId], references: [sites.id] }),
    members: many(chatRoomMembers),
    messages: many(messages),
}));

// ============================================================
// CHAT ROOM MEMBERS
// ============================================================
export const chatRoomMembers = pgTable(
    "chat_room_members",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        roomId: uuid("room_id")
            .notNull()
            .references(() => chatRooms.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("chat_room_members_room_idx").on(table.roomId),
        index("chat_room_members_user_idx").on(table.userId),
    ]
);

export const chatRoomMembersRelations = relations(chatRoomMembers, ({ one }) => ({
    room: one(chatRooms, { fields: [chatRoomMembers.roomId], references: [chatRooms.id] }),
    user: one(users, { fields: [chatRoomMembers.userId], references: [users.id] }),
}));

// ============================================================
// MESSAGES
// ============================================================
export const messages = pgTable(
    "messages",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        roomId: uuid("room_id")
            .notNull()
            .references(() => chatRooms.id, { onDelete: "cascade" }),
        senderId: uuid("sender_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        content: text("content").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("messages_room_id_idx").on(table.roomId),
        index("messages_created_at_idx").on(table.createdAt),
    ]
);

export const messagesRelations = relations(messages, ({ one }) => ({
    room: one(chatRooms, { fields: [messages.roomId], references: [chatRooms.id] }),
    sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

// ============================================================
// BILLING
// ============================================================
export const billing = pgTable(
    "billing",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        planName: varchar("plan_name", { length: 100 }).notNull().default("free"),
        guardLimit: integer("guard_limit").notNull().default(5),
        billingCycle: varchar("billing_cycle", { length: 20 }).notNull().default("monthly"),
        price: decimal("price", { precision: 10, scale: 2 }).notNull().default("0.00"),
        nextBillingDate: timestamp("next_billing_date", { withTimezone: true }),
        status: varchar("status", { length: 50 }).notNull().default("active"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("billing_org_id_idx").on(table.organizationId),
    ]
);

export const billingRelations = relations(billing, ({ one }) => ({
    organization: one(organizations, { fields: [billing.organizationId], references: [organizations.id] }),
}));

// ============================================================
// PAYMENT METHODS
// ============================================================
export const paymentMethods = pgTable(
    "payment_methods",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        provider: varchar("provider", { length: 100 }).notNull(),
        last4: varchar("last4", { length: 4 }).notNull(),
        brand: varchar("brand", { length: 50 }).notNull(),
        expiry: varchar("expiry", { length: 7 }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("payment_methods_org_id_idx").on(table.organizationId),
    ]
);

export const paymentMethodsRelations = relations(paymentMethods, ({ one }) => ({
    organization: one(organizations, { fields: [paymentMethods.organizationId], references: [organizations.id] }),
}));

// ============================================================
// AUDIT LOGS
// ============================================================
export const auditLogs = pgTable(
    "audit_logs",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
        userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
        action: varchar("action", { length: 255 }).notNull(),
        entityType: varchar("entity_type", { length: 100 }),
        entityId: varchar("entity_id", { length: 255 }),
        ipAddress: varchar("ip_address", { length: 45 }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("audit_logs_org_created_idx").on(table.organizationId, table.createdAt),
        index("audit_logs_action_idx").on(table.action),
    ]
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    organization: one(organizations, { fields: [auditLogs.organizationId], references: [organizations.id] }),
    user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

// ============================================================
// API KEYS
// ============================================================
export const apiKeys = pgTable(
    "api_keys",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        keyHash: varchar("key_hash", { length: 255 }).notNull(),
        name: varchar("name", { length: 255 }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        revokedAt: timestamp("revoked_at", { withTimezone: true }),
    },
    (table) => [
        index("api_keys_org_id_idx").on(table.organizationId),
        index("api_keys_key_hash_idx").on(table.keyHash),
    ]
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
    organization: one(organizations, { fields: [apiKeys.organizationId], references: [organizations.id] }),
}));

// ============================================================
// WEBHOOKS
// ============================================================
export const webhooks = pgTable(
    "webhooks",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        url: varchar("url", { length: 500 }).notNull(),
        eventType: varchar("event_type", { length: 100 }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("webhooks_org_id_idx").on(table.organizationId),
    ]
);

export const webhooksRelations = relations(webhooks, ({ one }) => ({
    organization: one(organizations, { fields: [webhooks.organizationId], references: [organizations.id] }),
}));

// ============================================================
// INTEGRATIONS
// ============================================================
export const integrations = pgTable(
    "integrations",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 255 }).notNull(),
        status: varchar("status", { length: 50 }).notNull().default("disconnected"),
        configJson: jsonb("config_json"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("integrations_org_id_idx").on(table.organizationId),
    ]
);

export const integrationsRelations = relations(integrations, ({ one }) => ({
    organization: one(organizations, { fields: [integrations.organizationId], references: [organizations.id] }),
}));

// ============================================================
// ADMIN SETTINGS
// ============================================================
export const adminSettings = pgTable(
    "admin_settings",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        requireGps: boolean("require_gps").notNull().default(true),
        requirePhotoIncident: boolean("require_photo_incident").notNull().default(false),
        allowOfflineCheckin: boolean("allow_offline_checkin").notNull().default(false),
        sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(30),
        darkModeEnabled: boolean("dark_mode_enabled").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("admin_settings_org_id_idx").on(table.organizationId),
    ]
);

export const adminSettingsRelations = relations(adminSettings, ({ one }) => ({
    organization: one(organizations, { fields: [adminSettings.organizationId], references: [organizations.id] }),
}));

// ============================================================
// TRAZER HQ (PLATFORM ADMIN)
// ============================================================
export const platformAdmins = pgTable(
    "platform_admins",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        email: varchar("email", { length: 255 }).notNull().unique(),
        passwordHash: varchar("password_hash", { length: 255 }).notNull(),
        role: varchar("role", { length: 50 }).notNull().default("SUPPORT"), // SUPER_ADMIN, FINANCE, SUPPORT, TECH
        isActive: boolean("is_active").notNull().default(true),
        twoFactorSecret: varchar("two_factor_secret", { length: 255 }),
        failedAttempts: integer("failed_attempts").notNull().default(0),
        lockedUntil: timestamp("locked_until", { withTimezone: true }),
        lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    }
);

export const platformAdminsRelations = relations(platformAdmins, ({ many }) => ({
    activityLogs: many(adminActivityLogs),
}));

export const adminActivityLogs = pgTable(
    "admin_activity_logs",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        adminId: uuid("admin_id").references(() => platformAdmins.id, { onDelete: "set null" }),
        actionType: varchar("action_type", { length: 255 }).notNull(),
        entityType: varchar("entity_type", { length: 100 }),
        entityId: varchar("entity_id", { length: 255 }),
        metadata: jsonb("metadata"),
        ipAddress: varchar("ip_address", { length: 45 }),
        userAgent: text("user_agent"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("admin_activity_logs_action_idx").on(table.actionType),
        index("admin_activity_logs_admin_idx").on(table.adminId),
    ]
);

export const adminActivityLogsRelations = relations(adminActivityLogs, ({ one }) => ({
    admin: one(platformAdmins, { fields: [adminActivityLogs.adminId], references: [platformAdmins.id] }),
}));

export const clientReports = pgTable(
    "client_reports",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        companyId: uuid("company_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
        reportedByUserId: uuid("reported_by_user_id").references(() => users.id, { onDelete: "set null" }),
        category: varchar("category", { length: 50 }).notNull(), // BUG, FEATURE, BILLING, OTHER
        severity: varchar("severity", { length: 50 }).notNull(), // LOW, MEDIUM, HIGH, CRITICAL
        title: varchar("title", { length: 255 }).notNull(),
        description: text("description").notNull(),
        status: varchar("status", { length: 50 }).notNull().default("OPEN"), // OPEN, IN_PROGRESS, RESOLVED, CLOSED
        adminNotes: text("admin_notes"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    }
);

export const clientReportsRelations = relations(clientReports, ({ one }) => ({
    company: one(organizations, { fields: [clientReports.companyId], references: [organizations.id] }),
    reportedByUser: one(users, { fields: [clientReports.reportedByUserId], references: [users.id] }),
}));

export const usageMetrics = pgTable(
    "usage_metrics",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        date: date("date").notNull().unique(), // daily aggregation
        totalCompanies: integer("total_companies").notNull().default(0),
        totalMrr: decimal("total_mrr", { precision: 10, scale: 2 }).notNull().default("0.00"),
        storageUsedGb: decimal("storage_used_gb", { precision: 10, scale: 2 }).notNull().default("0.00"),
        apiRequests: integer("api_requests").notNull().default(0),
        activeGuards: integer("active_guards").notNull().default(0),
        incidentsCount: integer("incidents_count").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    }
);

// ============================================================
// STORAGE USAGE
// ============================================================
export const storageUsage = pgTable(
    "storage_usage",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        usedMb: decimal("used_mb", { precision: 10, scale: 2 }).notNull().default("0.00"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("storage_usage_org_id_idx").on(table.organizationId),
    ]
);

export const storageUsageRelations = relations(storageUsage, ({ one }) => ({
    organization: one(organizations, { fields: [storageUsage.organizationId], references: [organizations.id] }),
}));

// ============================================================
// TRIAL APPLICATIONS
// ============================================================
export const trialApplications = pgTable("trial_applications", {
    id: uuid("id").defaultRandom().primaryKey(),
    companyName: varchar("company_name", { length: 255 }).notNull(),
    companyEmail: varchar("company_email", { length: 255 }).notNull().unique(),
    industry: varchar("industry", { length: 100 }).notNull(),
    companySize: varchar("company_size", { length: 50 }).notNull(),
    country: varchar("country", { length: 100 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    jobTitle: varchar("job_title", { length: 100 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
    monthlyUsers: integer("monthly_users").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, verified, converted, rejected
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
