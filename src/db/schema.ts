import type { ColumnType, Generated } from "kysely";

/** Timestamps are read back as Date; on insert they may be omitted when the database has a default. */
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

export interface OperatorsTable {
  id: Generated<string>;
  name: string;
  /** First characters of the key, safe to show in logs and UIs. */
  key_prefix: string;
  /** SHA-256 of the full key. The key itself is never stored. */
  key_hash: string;
  created_at: Timestamp;
  disabled_at: NullableTimestamp;
}

export type AuditActorType = "operator" | "system" | "claimer";

export interface AuditEventsTable {
  id: Generated<string>;
  occurred_at: Timestamp;
  actor_type: AuditActorType;
  actor_id: string | null;
  action: string;
  subject_type: string | null;
  subject_id: string | null;
  details: ColumnType<Record<string, unknown>, string | undefined, never>;
}

export interface PeopleTable {
  id: Generated<string>;
  created_at: Timestamp;
  blocked_at: NullableTimestamp;
}

export type IdentityProvider = "github";

export interface IdentitiesTable {
  id: Generated<string>;
  person_id: string;
  provider: IdentityProvider;
  provider_user_id: string;
  login: string;
  account_created_at: Timestamp;
  public_repos: number;
  followers: number;
  contributions_last_year: number | null;
  signals_checked_at: Timestamp;
  created_at: Timestamp;
}

export interface OauthStatesTable {
  state_hash: string;
  provider: IdentityProvider;
  code_verifier: string;
  drop_slug: string | null;
  created_at: Timestamp;
  expires_at: Timestamp;
  used_at: NullableTimestamp;
}

export interface ClaimerSessionsTable {
  id: Generated<string>;
  person_id: string;
  identity_id: string;
  token_hash: string;
  created_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: NullableTimestamp;
}

export type DropStatus = "draft" | "active" | "paused" | "ended";

/** Money columns are bigint micro-dollars (1 USD = 1,000,000). */
type Micro = ColumnType<bigint, bigint | string, bigint | string>;

export interface DropsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  status: ColumnType<DropStatus, DropStatus | undefined, DropStatus>;
  cap_micro: Micro;
  max_claims: number;
  claims_count: ColumnType<number, number | undefined, number>;
  models: string[];
  starts_at: Timestamp;
  ends_at: Timestamp;
  min_account_age_days: number;
  min_public_repos: number;
  min_contributions: number;
  terms_version: string;
  created_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type ClaimStatus = "pending" | "active" | "exhausted" | "expired" | "revoked" | "failed";
export type ClaimEndedBy = "operator" | "claimer" | "system";

export interface ClaimsTable {
  id: Generated<string>;
  drop_id: string;
  person_id: string;
  identity_id: string;
  status: ColumnType<ClaimStatus, ClaimStatus | undefined, ClaimStatus>;
  cap_micro: Micro;
  terms_version: string;
  attested_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  ended_at: NullableTimestamp;
  end_reason: string | null;
  ended_by: ClaimEndedBy | null;
}

export interface FundingsTable {
  id: Generated<string>;
  drop_id: string;
  amount_micro: Micro;
  method: "usdc_base";
  reference: string;
  note: string | null;
  confirmed_by: string;
  confirmed_at: Timestamp;
  created_at: Timestamp;
}

export interface FundReturnsTable {
  id: Generated<string>;
  drop_id: string;
  amount_micro: Micro;
  reference: string;
  recorded_by: string;
  created_at: Timestamp;
}

export type LedgerAccountKind =
  | "funding_source"
  | "drop_unallocated"
  | "drop_returned"
  | "claim_allocated"
  | "claim_spent";

export interface LedgerAccountsTable {
  id: Generated<string>;
  kind: LedgerAccountKind;
  drop_id: string | null;
  claim_id: string | null;
  /** Maintained by a database trigger from the entries. Never written by the application. */
  balance_micro: ColumnType<bigint, never, never>;
  created_at: Timestamp;
}

export type LedgerTransactionKind =
  | "funding"
  | "claim_allocation"
  | "claim_release"
  | "spend"
  | "return";

export interface LedgerTransactionsTable {
  id: Generated<string>;
  kind: LedgerTransactionKind;
  drop_id: string;
  claim_id: string | null;
  idempotency_key: string;
  memo: string | null;
  actor_type: AuditActorType;
  actor_id: string | null;
  created_at: Timestamp;
}

export interface LedgerEntriesTable {
  id: Generated<string>;
  transaction_id: string;
  account_id: string;
  amount_micro: Micro;
  created_at: Timestamp;
}

export interface Database {
  operators: OperatorsTable;
  audit_events: AuditEventsTable;
  people: PeopleTable;
  identities: IdentitiesTable;
  oauth_states: OauthStatesTable;
  claimer_sessions: ClaimerSessionsTable;
  drops: DropsTable;
  claims: ClaimsTable;
  fundings: FundingsTable;
  fund_returns: FundReturnsTable;
  ledger_accounts: LedgerAccountsTable;
  ledger_transactions: LedgerTransactionsTable;
  ledger_entries: LedgerEntriesTable;
}
