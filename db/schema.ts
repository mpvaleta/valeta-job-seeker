import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    defaultMarket: text("default_market").notNull().default("San Francisco Bay Area"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

export const careerProfiles = sqliteTable(
  "career_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    headline: text("headline").notNull(),
    targetRolesJson: text("target_roles_json").notNull().default("[]"),
    targetMarketsJson: text("target_markets_json").notNull().default("[]"),
    positioning: text("positioning").notNull(),
    constraintsJson: text("constraints_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("career_profiles_user_idx").on(table.userId)],
);

export const companies = sqliteTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    websiteUrl: text("website_url"),
    careersUrl: text("careers_url"),
    companyType: text("company_type").notNull(),
    primaryMarket: text("primary_market"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("companies_name_idx").on(table.name)],
);

export const companyMonitors = sqliteTable(
  "company_monitors",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    cadence: text("cadence").notNull().default("daily"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("company_monitors_user_idx").on(table.userId),
    index("company_monitors_company_idx").on(table.companyId),
  ],
);

export const jobOpportunities = sqliteTable(
  "job_opportunities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    location: text("location"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type").notNull(),
    rawDescriptionStorageKey: text("raw_description_storage_key"),
    fitScore: integer("fit_score"),
    fitSummary: text("fit_summary"),
    status: text("status").notNull().default("lead"),
    discoveredAt: text("discovered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("job_opportunities_user_idx").on(table.userId),
    index("job_opportunities_company_idx").on(table.companyId),
    index("job_opportunities_status_idx").on(table.status),
  ],
);

export const monitorRuns = sqliteTable(
  "monitor_runs",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id").references(() => companyMonitors.id, {
      onDelete: "cascade",
    }),
    runStatus: text("run_status").notNull(),
    foundCount: integer("found_count").notNull().default(0),
    changeSummary: text("change_summary"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("monitor_runs_monitor_idx").on(table.monitorId)],
);

export const workspaceRevisions = sqliteTable(
  "workspace_revisions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    contentHash: text("content_hash").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sourceBuild: text("source_build").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("workspace_revisions_user_idx").on(table.userId),
    index("workspace_revisions_hash_idx").on(table.contentHash),
  ],
);

export const workspaceHeads = sqliteTable(
  "workspace_heads",
  {
    userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    revisionId: text("revision_id").notNull().references(() => workspaceRevisions.id, { onDelete: "restrict" }),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("workspace_heads_revision_idx").on(table.revisionId)],
);

export const aiUsageEvents = sqliteTable(
  "ai_usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    providerRequestId: text("provider_request_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    guardrailStatus: text("guardrail_status").notNull().default("not_run"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("ai_usage_events_user_idx").on(table.userId),
    index("ai_usage_events_created_idx").on(table.createdAt),
  ],
);

export const oauthIdentities = sqliteTable(
  "oauth_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSubjectHash: text("provider_subject_hash").notNull(),
    displayName: text("display_name"),
    email: text("email"),
    pictureUrl: text("picture_url"),
    status: text("status").notNull().default("connected"),
    connectedAt: text("connected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastVerifiedAt: text("last_verified_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("oauth_identities_user_idx").on(table.userId),
    index("oauth_identities_subject_idx").on(table.providerSubjectHash),
  ],
);

export const oauthSessions = sqliteTable(
  "oauth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    identityId: text("identity_id").notNull().references(() => oauthIdentities.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("oauth_sessions_user_idx").on(table.userId),
    index("oauth_sessions_expires_idx").on(table.expiresAt),
  ],
);
