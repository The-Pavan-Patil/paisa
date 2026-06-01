export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type InvestmentKind =
  | "mutual_fund"
  | "gold"
  | "fd"
  | "stock"
  | "ppf"
  | "nps"
  | "cash_carry_forward"
  | "other";

export type LedgerSource = "manual" | "import" | "statement_import";

export type ImportBatchStatus =
  | "fetched"
  | "processing"
  | "completed"
  | "failed"
  | "reviewing"
  | "reviewed"
  | "committed";

export type ImportedReviewStatus = "pending" | "imported" | "skipped" | "duplicate" | "ignored";

export type ImportResolutionType =
  | "credit"
  | "expense"
  | "investment"
  | "ignore"
  | "pending"
  | "salary_credit"
  | "additional_credit"
  | "investment_debit"
  | "own_transfer";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          employer_name: string | null;
          default_salary_paise: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          employer_name?: string | null;
          default_salary_paise?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          employer_name?: string | null;
          default_salary_paise?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          is_expense: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          is_expense?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          is_expense?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      monthly_salary: {
        Row: {
          id: string;
          user_id: string;
          month: string;
          amount_paise: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: string;
          amount_paise: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          month?: string;
          amount_paise?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      additional_credit_entries: {
        Row: {
          id: string;
          user_id: string;
          month: string;
          amount_paise: number;
          description: string | null;
          source: LedgerSource;
          imported_transaction_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: string;
          amount_paise: number;
          description?: string | null;
          source?: LedgerSource;
          imported_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          month?: string;
          amount_paise?: number;
          description?: string | null;
          source?: LedgerSource;
          imported_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expense_entries: {
        Row: {
          id: string;
          user_id: string;
          month: string;
          category_id: string | null;
          amount_paise: number;
          merchant_name: string | null;
          source: LedgerSource;
          imported_transaction_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: string;
          category_id?: string | null;
          amount_paise: number;
          merchant_name?: string | null;
          source?: LedgerSource;
          imported_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          month?: string;
          category_id?: string | null;
          amount_paise?: number;
          merchant_name?: string | null;
          source?: LedgerSource;
          imported_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      investment_entries: {
        Row: {
          id: string;
          user_id: string;
          month: string;
          kind: InvestmentKind;
          amount_paise: number;
          current_value_paise: number | null;
          scheme_code: string | null;
          grams: string | null;
          purity: string | null;
          maturity_date: string | null;
          maturity_amount_paise: number | null;
          account_source: string | null;
          notes: string | null;
          source: LedgerSource;
          imported_transaction_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: string;
          kind: InvestmentKind;
          amount_paise: number;
          current_value_paise?: number | null;
          scheme_code?: string | null;
          grams?: string | null;
          purity?: string | null;
          maturity_date?: string | null;
          maturity_amount_paise?: number | null;
          account_source?: string | null;
          notes?: string | null;
          source?: LedgerSource;
          imported_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          month?: string;
          kind?: InvestmentKind;
          amount_paise?: number;
          current_value_paise?: number | null;
          scheme_code?: string | null;
          grams?: string | null;
          purity?: string | null;
          maturity_date?: string | null;
          maturity_amount_paise?: number | null;
          account_source?: string | null;
          notes?: string | null;
          source?: LedgerSource;
          imported_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      carry_forward_entries: {
        Row: {
          id: string;
          user_id: string;
          origin_month: string;
          destination_month: string;
          amount_paise: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          origin_month: string;
          destination_month: string;
          amount_paise: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          origin_month?: string;
          destination_month?: string;
          amount_paise?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      month_locks: {
        Row: {
          id: string;
          user_id: string;
          month: string;
          locked_at: string;
          locked_by: string | null;
          reason: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: string;
          locked_at?: string;
          locked_by?: string | null;
          reason?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          month?: string;
          locked_at?: string;
          locked_by?: string | null;
          reason?: string | null;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          user_id: string;
          entity_type: string;
          entity_id: string | null;
          action: string;
          old_value_json: Json | null;
          new_value_json: Json | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entity_type: string;
          entity_id?: string | null;
          action: string;
          old_value_json?: Json | null;
          new_value_json?: Json | null;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entity_type?: string;
          entity_id?: string | null;
          action?: string;
          old_value_json?: Json | null;
          new_value_json?: Json | null;
          source?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          user_id: string;
          source_provider: string;
          source_account_masked: string | null;
          source_filename: string | null;
          month: string | null;
          statement_from: string | null;
          statement_to: string | null;
          opening_balance_paise: number | null;
          closing_balance_paise: number | null;
          fetched_at: string;
          committed_at: string | null;
          status: ImportBatchStatus;
          raw_count: number;
          imported_count: number;
          skipped_count: number;
          duplicate_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_provider?: string;
          source_account_masked?: string | null;
          source_filename?: string | null;
          month?: string | null;
          statement_from?: string | null;
          statement_to?: string | null;
          opening_balance_paise?: number | null;
          closing_balance_paise?: number | null;
          fetched_at?: string;
          committed_at?: string | null;
          status?: ImportBatchStatus;
          raw_count?: number;
          imported_count?: number;
          skipped_count?: number;
          duplicate_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_provider?: string;
          source_account_masked?: string | null;
          source_filename?: string | null;
          month?: string | null;
          statement_from?: string | null;
          statement_to?: string | null;
          opening_balance_paise?: number | null;
          closing_balance_paise?: number | null;
          fetched_at?: string;
          committed_at?: string | null;
          status?: ImportBatchStatus;
          raw_count?: number;
          imported_count?: number;
          skipped_count?: number;
          duplicate_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      imported_transactions: {
        Row: {
          id: string;
          user_id: string;
          batch_id: string;
          upstream_txn_id: string;
          txn_date: string;
          amount_paise: number;
          direction: "credit" | "debit";
          merchant_raw: string | null;
          description_raw: string | null;
          narration_raw: string | null;
          normalized_merchant: string | null;
          detected_type: string | null;
          confidence_score: string | null;
          suggested_category_id: string | null;
          closing_balance_paise: number | null;
          review_status: ImportedReviewStatus;
          resolution_type: ImportResolutionType;
          resolved_category_name: string | null;
          staging_meta: Json;
          dedup_key: string | null;
          linked_table: string | null;
          linked_row_id: string | null;
          linked_expense_id: string | null;
          linked_credit_id: string | null;
          linked_investment_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          batch_id: string;
          upstream_txn_id: string;
          txn_date: string;
          amount_paise: number;
          direction: "credit" | "debit";
          merchant_raw?: string | null;
          description_raw?: string | null;
          narration_raw?: string | null;
          normalized_merchant?: string | null;
          detected_type?: string | null;
          confidence_score?: string | null;
          suggested_category_id?: string | null;
          closing_balance_paise?: number | null;
          review_status?: ImportedReviewStatus;
          resolution_type?: ImportResolutionType;
          resolved_category_name?: string | null;
          staging_meta?: Json;
          dedup_key?: string | null;
          linked_table?: string | null;
          linked_row_id?: string | null;
          linked_expense_id?: string | null;
          linked_credit_id?: string | null;
          linked_investment_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          batch_id?: string;
          upstream_txn_id?: string;
          txn_date?: string;
          amount_paise?: number;
          direction?: "credit" | "debit";
          merchant_raw?: string | null;
          description_raw?: string | null;
          narration_raw?: string | null;
          normalized_merchant?: string | null;
          detected_type?: string | null;
          confidence_score?: string | null;
          suggested_category_id?: string | null;
          closing_balance_paise?: number | null;
          review_status?: ImportedReviewStatus;
          resolution_type?: ImportResolutionType;
          resolved_category_name?: string | null;
          staging_meta?: Json;
          dedup_key?: string | null;
          linked_table?: string | null;
          linked_row_id?: string | null;
          linked_expense_id?: string | null;
          linked_credit_id?: string | null;
          linked_investment_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      price_snapshots: {
        Row: {
          id: string;
          user_id: string;
          instrument_key: string;
          price_paise: number;
          as_of: string;
          provider: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          instrument_key: string;
          price_paise: number;
          as_of?: string;
          provider: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          instrument_key?: string;
          price_paise?: number;
          as_of?: string;
          provider?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      investment_totals_by_kind: {
        Args: { p_user_id: string };
        Returns: { kind: InvestmentKind; total_paise: number }[];
      };
    };
    Enums: {
      investment_kind: InvestmentKind;
      ledger_source: LedgerSource;
      import_batch_status: ImportBatchStatus;
      imported_review_status: ImportedReviewStatus;
      import_resolution_type: ImportResolutionType;
    };
    CompositeTypes: Record<string, never>;
  };
}
