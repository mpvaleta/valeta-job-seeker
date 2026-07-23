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

export const sourceDocuments = sqliteTable(
  "source_documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: text("source_type").notNull(),
    storageKey: text("storage_key"),
    originalUrl: text("original_url"),
    extractedTextHash: text("extracted_text_hash"),
    processingStatus: text("processing_status").notNull().default("queued"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("source_documents_user_idx").on(table.userId),
    index("source_documents_status_idx").on(table.processingStatus),
  ],
);

export const careerFacts = sqliteTable(
  "career_facts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceDocumentId: text("source_document_id").references(() => sourceDocuments.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull(),
    claim: text("claim").notNull(),
    evidence: text("evidence").notNull(),
    confidence: integer("confidence").notNull().default(80),
    verificationStatus: text("verification_status").notNull().default("needs_review"),
    reusable: integer("reusable", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("career_facts_user_idx").on(table.userId),
    index("career_facts_category_idx").on(table.category),
    index("career_facts_status_idx").on(table.verificationStatus),
  ],
);

export const writingSamples = sqliteTable(
  "writing_samples",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sampleType: text("sample_type").notNull(),
    storageKey: text("storage_key"),
    approvedForStyle: integer("approved_for_style", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("writing_samples_user_idx").on(table.userId)],
);

export const styleProfiles = sqliteTable(
  "style_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    toneJson: text("tone_json").notNull().default("{}"),
    phrasesToPreferJson: text("phrases_to_prefer_json").notNull().default("[]"),
    phrasesToAvoidJson: text("phrases_to_avoid_json").notNull().default("[]"),
    exampleEditsJson: text("example_edits_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("style_profiles_user_idx").on(table.userId)],
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

export const roleRequirements = sqliteTable(
  "role_requirements",
  {
    id: text("id").primaryKey(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => jobOpportunities.id, { onDelete: "cascade" }),
    requirementType: text("requirement_type").notNull(),
    requirementText: text("requirement_text").notNull(),
    evidenceFactIdsJson: text("evidence_fact_ids_json").notNull().default("[]"),
    matchStrength: text("match_strength").notNull().default("unknown"),
  },
  (table) => [index("role_requirements_opportunity_idx").on(table.opportunityId)],
);

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id").references(() => jobOpportunities.id, {
      onDelete: "set null",
    }),
    companyId: text("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    roleTitle: text("role_title").notNull(),
    appliedAt: text("applied_at"),
    status: text("status").notNull().default("drafting"),
    nextStep: text("next_step"),
    applicationUrl: text("application_url"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("applications_user_idx").on(table.userId),
    index("applications_status_idx").on(table.status),
  ],
);

export const generatedDocuments = sqliteTable(
  "generated_documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    documentType: text("document_type").notNull(),
    storageKey: text("storage_key"),
    sourceFactIdsJson: text("source_fact_ids_json").notNull().default("[]"),
    draftText: text("draft_text"),
    reviewStatus: text("review_status").notNull().default("draft"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("generated_documents_user_idx").on(table.userId),
    index("generated_documents_application_idx").on(table.applicationId),
  ],
);

export const applicationAnswers = sqliteTable(
  "application_answers",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fieldLabel: text("field_label").notNull(),
    answerText: text("answer_text").notNull(),
    sourceFactIdsJson: text("source_fact_ids_json").notNull().default("[]"),
    confidence: integer("confidence").notNull().default(75),
    reviewStatus: text("review_status").notNull().default("needs_review"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("application_answers_application_idx").on(table.applicationId)],
);

export const contentSources = sqliteTable(
  "content_sources",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceType: text("source_type").notNull(),
    topic: text("topic").notNull(),
    trustLevel: text("trust_level").notNull().default("primary"),
    lastCheckedAt: text("last_checked_at"),
    refreshCadence: text("refresh_cadence").notNull().default("monthly"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("content_sources_topic_idx").on(table.topic),
    index("content_sources_trust_idx").on(table.trustLevel),
  ],
);

export const monitorRuns = sqliteTable(
  "monitor_runs",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id").references(() => companyMonitors.id, {
      onDelete: "cascade",
    }),
    sourceId: text("source_id").references(() => contentSources.id, {
      onDelete: "set null",
    }),
    runStatus: text("run_status").notNull(),
    foundCount: integer("found_count").notNull().default(0),
    changeSummary: text("change_summary"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("monitor_runs_monitor_idx").on(table.monitorId),
    index("monitor_runs_source_idx").on(table.sourceId),
  ],
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
