export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auth_grants: {
        Row: {
          authorized_by: string
          authorized_by_name: string | null
          created_at: string
          expires_at: string
          id: string
          scope: string
          token: string
          used: boolean
          user_id: string
        }
        Insert: {
          authorized_by: string
          authorized_by_name?: string | null
          created_at?: string
          expires_at: string
          id?: string
          scope: string
          token: string
          used?: boolean
          user_id: string
        }
        Update: {
          authorized_by?: string
          authorized_by_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          scope?: string
          token?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      bar_expense_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_default: boolean
          kind: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          kind: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bar_expenses: {
        Row: {
          amount: number
          auto_consumacao_recipient: string | null
          auto_consumacao_target: string | null
          category_id: string | null
          category_name: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          expense_date: string
          id: string
          installment_group_id: string | null
          installment_index: number | null
          installment_total: number | null
          interest_amount: number
          investment_name: string | null
          is_investment: boolean
          kind: string
          notes: string | null
          paid: boolean
          paid_amount: number | null
          paid_at: string | null
          payment_method: string | null
          recurrence: string
          recurrence_parent_id: string | null
          reference_month: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          auto_consumacao_recipient?: string | null
          auto_consumacao_target?: string | null
          category_id?: string | null
          category_name: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_date?: string
          id?: string
          installment_group_id?: string | null
          installment_index?: number | null
          installment_total?: number | null
          interest_amount?: number
          investment_name?: string | null
          is_investment?: boolean
          kind: string
          notes?: string | null
          paid?: boolean
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          recurrence?: string
          recurrence_parent_id?: string | null
          reference_month?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          auto_consumacao_recipient?: string | null
          auto_consumacao_target?: string | null
          category_id?: string | null
          category_name?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_date?: string
          id?: string
          installment_group_id?: string | null
          installment_index?: number | null
          installment_total?: number | null
          interest_amount?: number
          investment_name?: string | null
          is_investment?: boolean
          kind?: string
          notes?: string | null
          paid?: boolean
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          recurrence?: string
          recurrence_parent_id?: string | null
          reference_month?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bar_settings: {
        Row: {
          accent_color: string | null
          bar_name: string | null
          bg_color: string | null
          button_color: string | null
          created_at: string
          font_family: string | null
          id: string
          instagram_handle: string | null
          logo_url: string | null
          owner_pin_hash: string | null
          text_color: string | null
          theme_mode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          bar_name?: string | null
          bg_color?: string | null
          button_color?: string | null
          created_at?: string
          font_family?: string | null
          id?: string
          instagram_handle?: string | null
          logo_url?: string | null
          owner_pin_hash?: string | null
          text_color?: string | null
          theme_mode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          bar_name?: string | null
          bg_color?: string | null
          button_color?: string | null
          created_at?: string
          font_family?: string | null
          id?: string
          instagram_handle?: string | null
          logo_url?: string | null
          owner_pin_hash?: string | null
          text_color?: string | null
          theme_mode?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_closings: {
        Row: {
          authorized_by: string | null
          authorized_by_name: string | null
          closed_by: string
          closed_by_name: string | null
          created_at: string
          declared_credito: number
          declared_debito: number
          declared_dinheiro: number
          declared_pix: number
          expected_credito: number
          expected_debito: number
          expected_dinheiro: number
          expected_pix: number
          id: string
          notes: string | null
          opening_amount: number
          sales_count: number
          session_id: string | null
          user_id: string
          withdrawals_total: number
        }
        Insert: {
          authorized_by?: string | null
          authorized_by_name?: string | null
          closed_by: string
          closed_by_name?: string | null
          created_at?: string
          declared_credito?: number
          declared_debito?: number
          declared_dinheiro?: number
          declared_pix?: number
          expected_credito?: number
          expected_debito?: number
          expected_dinheiro?: number
          expected_pix?: number
          id?: string
          notes?: string | null
          opening_amount?: number
          sales_count?: number
          session_id?: string | null
          user_id: string
          withdrawals_total?: number
        }
        Update: {
          authorized_by?: string | null
          authorized_by_name?: string | null
          closed_by?: string
          closed_by_name?: string | null
          created_at?: string
          declared_credito?: number
          declared_debito?: number
          declared_dinheiro?: number
          declared_pix?: number
          expected_credito?: number
          expected_debito?: number
          expected_dinheiro?: number
          expected_pix?: number
          id?: string
          notes?: string | null
          opening_amount?: number
          sales_count?: number
          session_id?: string | null
          user_id?: string
          withdrawals_total?: number
        }
        Relationships: []
      }
      cash_register_sectors: {
        Row: {
          authorized_at: string | null
          authorized_by: string | null
          authorized_by_name: string | null
          close_declared: Json | null
          created_at: string
          id: string
          notes: string | null
          opening_amount: number
          requested_at: string | null
          requested_by: string | null
          requested_by_name: string | null
          sector: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_name?: string | null
          close_declared?: Json | null
          created_at?: string
          id?: string
          notes?: string | null
          opening_amount?: number
          requested_at?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          sector: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_name?: string | null
          close_declared?: Json | null
          created_at?: string
          id?: string
          notes?: string | null
          opening_amount?: number
          requested_at?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          sector?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closing_id: string | null
          created_at: string
          event_id: string | null
          id: string
          opened_at: string
          opened_by: string
          opened_by_name: string | null
          opening_amount: number
          opening_notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          closing_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          opened_at?: string
          opened_by: string
          opened_by_name?: string | null
          opening_amount?: number
          opening_notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          closing_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          opened_at?: string
          opened_by?: string
          opened_by_name?: string | null
          opening_amount?: number
          opening_notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_withdrawals: {
        Row: {
          amount: number
          authorized_by: string
          authorized_by_name: string | null
          created_at: string
          created_by: string
          created_by_name: string | null
          id: string
          reason: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          amount: number
          authorized_by: string
          authorized_by_name?: string | null
          created_at?: string
          created_by: string
          created_by_name?: string | null
          id?: string
          reason?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          amount?: number
          authorized_by?: string
          authorized_by_name?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          id?: string
          reason?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_withdrawals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_items: {
        Row: {
          combo_product_id: string
          component_product_id: string
          created_at: string
          id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          combo_product_id: string
          component_product_id: string
          created_at?: string
          id?: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          combo_product_id?: string
          component_product_id?: string
          created_at?: string
          id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_items_combo_product_id_fkey"
            columns: ["combo_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_order_counter: {
        Row: {
          daily_date: string
          last_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_date: string
          last_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_date?: string
          last_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_closing_terminals: {
        Row: {
          closing_id: string
          created_at: string
          diff: number
          id: string
          reported_total: number
          system_total: number
          terminal_id: string
          terminal_label: string | null
          user_id: string
        }
        Insert: {
          closing_id: string
          created_at?: string
          diff?: number
          id?: string
          reported_total?: number
          system_total?: number
          terminal_id: string
          terminal_label?: string | null
          user_id: string
        }
        Update: {
          closing_id?: string
          created_at?: string
          diff?: number
          id?: string
          reported_total?: number
          system_total?: number
          terminal_id?: string
          terminal_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_closing_terminals_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "event_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_closing_terminals_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      event_closings: {
        Row: {
          cash_counted: number
          cash_diff: number
          cash_expected: number
          closed_at: string
          closed_by: string | null
          closed_by_name: string | null
          created_at: string
          event_id: string
          id: string
          notes: string | null
          pix_chave_confirmed_total: number
          pix_chave_refunded_sale_ids: Json
          pix_chave_refunded_total: number
          pix_qr_total: number
          reopened_at: string | null
          reopened_by: string | null
          staff_name: string | null
          staff_user_id: string
          total_reported: number
          total_system: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_counted?: number
          cash_diff?: number
          cash_expected?: number
          closed_at?: string
          closed_by?: string | null
          closed_by_name?: string | null
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          pix_chave_confirmed_total?: number
          pix_chave_refunded_sale_ids?: Json
          pix_chave_refunded_total?: number
          pix_qr_total?: number
          reopened_at?: string | null
          reopened_by?: string | null
          staff_name?: string | null
          staff_user_id: string
          total_reported?: number
          total_system?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_counted?: number
          cash_diff?: number
          cash_expected?: number
          closed_at?: string
          closed_by?: string | null
          closed_by_name?: string | null
          created_at?: string
          event_id?: string
          id?: string
          notes?: string | null
          pix_chave_confirmed_total?: number
          pix_chave_refunded_sale_ids?: Json
          pix_chave_refunded_total?: number
          pix_qr_total?: number
          reopened_at?: string | null
          reopened_by?: string | null
          staff_name?: string | null
          staff_user_id?: string
          total_reported?: number
          total_system?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_closings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_costs: {
        Row: {
          amount: number
          category_id: string | null
          category_name: string
          created_at: string
          description: string | null
          event_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          category_name: string
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          category_name?: string
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_costs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_costs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_drink_consumption: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          event_id: string
          id: string
          product_id: string
          product_name_snapshot: string
          quantity: number
          stock_location_id: string | null
          total_cost: number
          unit_cost_snapshot: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          event_id: string
          id?: string
          product_id: string
          product_name_snapshot: string
          quantity?: number
          stock_location_id?: string | null
          total_cost?: number
          unit_cost_snapshot?: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          event_id?: string
          id?: string
          product_id?: string
          product_name_snapshot?: string
          quantity?: number
          stock_location_id?: string | null
          total_cost?: number
          unit_cost_snapshot?: number
          user_id?: string
        }
        Relationships: []
      }
      event_entries: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          created_by_name: string | null
          event_id: string
          gender: string | null
          id: string
          notes: string | null
          payment_method: string | null
          sale_id: string | null
          session_id: string | null
          ticket_type_id: string | null
          user_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          event_id: string
          gender?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          sale_id?: string | null
          session_id?: string | null
          ticket_type_id?: string | null
          user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          event_id?: string
          gender?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          sale_id?: string | null
          session_id?: string | null
          ticket_type_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      event_financials: {
        Row: {
          bar_cmv: number
          created_at: string
          event_id: string
          expenses: number
          hookah_share_percent: number
          id: string
          notes: string | null
          revenue_door: number
          revenue_drinks: number
          revenue_hookah_total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bar_cmv?: number
          created_at?: string
          event_id: string
          expenses?: number
          hookah_share_percent?: number
          id?: string
          notes?: string | null
          revenue_door?: number
          revenue_drinks?: number
          revenue_hookah_total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bar_cmv?: number
          created_at?: string
          event_id?: string
          expenses?: number
          hookah_share_percent?: number
          id?: string
          notes?: string | null
          revenue_door?: number
          revenue_drinks?: number
          revenue_hookah_total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_financials_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_promoter_commissions: {
        Row: {
          comm_man_free_type: string
          comm_man_free_value: number
          comm_man_paid_type: string
          comm_man_paid_value: number
          comm_woman_free_type: string
          comm_woman_free_value: number
          comm_woman_paid_type: string
          comm_woman_paid_value: number
          created_at: string
          event_id: string
          id: string
          promoter_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comm_man_free_type?: string
          comm_man_free_value?: number
          comm_man_paid_type?: string
          comm_man_paid_value?: number
          comm_woman_free_type?: string
          comm_woman_free_value?: number
          comm_woman_paid_type?: string
          comm_woman_paid_value?: number
          created_at?: string
          event_id: string
          id?: string
          promoter_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comm_man_free_type?: string
          comm_man_free_value?: number
          comm_man_paid_type?: string
          comm_man_paid_value?: number
          comm_woman_free_type?: string
          comm_woman_free_value?: number
          comm_woman_paid_type?: string
          comm_woman_paid_value?: number
          created_at?: string
          event_id?: string
          id?: string
          promoter_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_promoters: {
        Row: {
          created_at: string
          event_id: string
          id: string
          promoter_id: string
          slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          promoter_id: string
          slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          promoter_id?: string
          slug?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          auto_close_hours_after: number
          auto_open_minutes_before: number
          created_at: string
          date: string
          description: string | null
          display_boost: number
          end_date: string | null
          flyer_url: string | null
          id: string
          landing_published: boolean
          location: string | null
          name: string
          public_slug: string | null
          show_real_count_when_big: boolean
          status: string
          updated_at: string
          user_id: string
          whatsapp_group_url: string | null
        }
        Insert: {
          auto_close_hours_after?: number
          auto_open_minutes_before?: number
          created_at?: string
          date: string
          description?: string | null
          display_boost?: number
          end_date?: string | null
          flyer_url?: string | null
          id?: string
          landing_published?: boolean
          location?: string | null
          name: string
          public_slug?: string | null
          show_real_count_when_big?: boolean
          status?: string
          updated_at?: string
          user_id: string
          whatsapp_group_url?: string | null
        }
        Update: {
          auto_close_hours_after?: number
          auto_open_minutes_before?: number
          created_at?: string
          date?: string
          description?: string | null
          display_boost?: number
          end_date?: string | null
          flyer_url?: string | null
          id?: string
          landing_published?: boolean
          location?: string | null
          name?: string
          public_slug?: string | null
          show_real_count_when_big?: boolean
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp_group_url?: string | null
        }
        Relationships: []
      }
      expense_offsets: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          expense_id: string
          id: string
          reference_month: string | null
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_id: string
          id?: string
          reference_month?: string | null
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_id?: string
          id?: string
          reference_month?: string | null
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_offsets_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "bar_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_list_entries: {
        Row: {
          checked_in: boolean
          checked_in_at: string | null
          created_at: string
          event_id: string
          event_promoter_id: string
          gender: string | null
          id: string
          name: string
          phone: string | null
          promoter_id: string
          user_id: string
        }
        Insert: {
          checked_in?: boolean
          checked_in_at?: string | null
          created_at?: string
          event_id: string
          event_promoter_id: string
          gender?: string | null
          id?: string
          name: string
          phone?: string | null
          promoter_id: string
          user_id: string
        }
        Update: {
          checked_in?: boolean
          checked_in_at?: string | null
          created_at?: string
          event_id?: string
          event_promoter_id?: string
          gender?: string | null
          id?: string
          name?: string
          phone?: string | null
          promoter_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_list_entries_event_promoter_id_fkey"
            columns: ["event_promoter_id"]
            isOneToOne: false
            referencedRelation: "event_promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      lojinha_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          product_name_snapshot: string
          quantity: number
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          product_name_snapshot: string
          quantity: number
          unit_price: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          product_name_snapshot?: string
          quantity?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lojinha_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lojinha_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lojinha_order_units: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivered_by: string | null
          delivered_by_name: string | null
          id: string
          order_id: string
          order_item_id: string
          printed_at: string | null
          product_id: string
          product_name_snapshot: string
          qr_token: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivered_by_name?: string | null
          id?: string
          order_id: string
          order_item_id: string
          printed_at?: string | null
          product_id: string
          product_name_snapshot: string
          qr_token: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivered_by_name?: string | null
          id?: string
          order_id?: string
          order_item_id?: string
          printed_at?: string | null
          product_id?: string
          product_name_snapshot?: string
          qr_token?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lojinha_order_units_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lojinha_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lojinha_order_units_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "lojinha_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      lojinha_orders: {
        Row: {
          cancelled_at: string | null
          channel: string
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          daily_date: string | null
          daily_number: number | null
          delivered_at: string | null
          delivered_by: string | null
          delivered_by_name: string | null
          expires_at: string | null
          id: string
          init_point: string | null
          mp_payment_id: string | null
          mp_point_intent_id: string | null
          mp_preference_id: string | null
          mp_refund_id: string | null
          paid_at: string | null
          pickup_code: string | null
          pickup_token: string | null
          point_device_id: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          reconciled_note: string | null
          refund_amount: number | null
          refunded_at: string | null
          refunded_by: string | null
          refunded_by_name: string | null
          refunded_reason: string | null
          seller_name: string | null
          seller_user_id: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          channel?: string
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          daily_date?: string | null
          daily_number?: number | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivered_by_name?: string | null
          expires_at?: string | null
          id?: string
          init_point?: string | null
          mp_payment_id?: string | null
          mp_point_intent_id?: string | null
          mp_preference_id?: string | null
          mp_refund_id?: string | null
          paid_at?: string | null
          pickup_code?: string | null
          pickup_token?: string | null
          point_device_id?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciled_note?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          refunded_by_name?: string | null
          refunded_reason?: string | null
          seller_name?: string | null
          seller_user_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          channel?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          daily_date?: string | null
          daily_number?: number | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivered_by_name?: string | null
          expires_at?: string | null
          id?: string
          init_point?: string | null
          mp_payment_id?: string | null
          mp_point_intent_id?: string | null
          mp_preference_id?: string | null
          mp_refund_id?: string | null
          paid_at?: string | null
          pickup_code?: string | null
          pickup_token?: string | null
          point_device_id?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciled_note?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          refunded_by_name?: string | null
          refunded_reason?: string | null
          seller_name?: string | null
          seller_user_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lojinha_point_devices: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string
          id: string
          label: string
          mp_device_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string
          id?: string
          label: string
          mp_device_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string
          id?: string
          label?: string
          mp_device_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lojinha_settings: {
        Row: {
          accent_color: string | null
          created_at: string
          enabled: boolean
          id: string
          pickup_message: string | null
          slug: string | null
          stock_location_id: string | null
          store_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          pickup_message?: string | null
          slug?: string | null
          stock_location_id?: string | null
          store_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          pickup_message?: string | null
          slug?: string | null
          stock_location_id?: string | null
          store_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lojinha_stock_reservations: {
        Row: {
          cart_token: string
          created_at: string
          expires_at: string
          id: string
          location_id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          cart_token: string
          created_at?: string
          expires_at: string
          id?: string
          location_id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Update: {
          cart_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          location_id?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: []
      }
      monthly_plans: {
        Row: {
          created_at: string
          id: string
          month: number
          plan: Json
          target_margin: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: number
          plan?: Json
          target_margin?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: number
          plan?: Json
          target_margin?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      payment_terminals: {
        Row: {
          accepts_credito: boolean
          accepts_debito: boolean
          accepts_pix: boolean
          created_at: string
          id: string
          is_active: boolean
          label: string
          mode: string
          mp_device_id: string | null
          owner_label: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepts_credito?: boolean
          accepts_debito?: boolean
          accepts_pix?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          mode?: string
          mp_device_id?: string | null
          owner_label?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepts_credito?: boolean
          accepts_debito?: boolean
          accepts_pix?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          mode?: string
          mp_device_id?: string | null
          owner_label?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pix_charges: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          error_message: string | null
          expires_at: string | null
          id: string
          mp_payment_id: string | null
          order_id: string | null
          origin: string
          paid_at: string | null
          qr_code: string | null
          qr_code_base64: string | null
          sale_payload: Json | null
          sector: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          mp_payment_id?: string | null
          order_id?: string | null
          origin: string
          paid_at?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          sale_payload?: Json | null
          sector: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          mp_payment_id?: string | null
          order_id?: string | null
          origin?: string
          paid_at?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          sale_payload?: Json | null
          sector?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pix_charges_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lojinha_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      print_rules: {
        Row: {
          category_id: string
          created_at: string
          id: string
          print_on_sale: boolean
          print_on_scan: boolean
          updated_at: string
          user_id: string
          user_role_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          print_on_sale?: boolean
          print_on_scan?: boolean
          updated_at?: string
          user_id: string
          user_role_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          print_on_sale?: boolean
          print_on_scan?: boolean
          updated_at?: string
          user_id?: string
          user_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_rules_user_role_id_fkey"
            columns: ["user_role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      print_rules_products: {
        Row: {
          created_at: string
          id: string
          print_on_sale: boolean
          print_on_scan: boolean
          product_id: string
          updated_at: string
          user_id: string
          user_role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          print_on_sale?: boolean
          print_on_scan?: boolean
          product_id: string
          updated_at?: string
          user_id: string
          user_role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          print_on_sale?: boolean
          print_on_scan?: boolean
          product_id?: string
          updated_at?: string
          user_id?: string
          user_role_id?: string
        }
        Relationships: []
      }
      printers: {
        Row: {
          created_at: string
          id: string
          location: string | null
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_stock: {
        Row: {
          created_at: string
          id: string
          location_id: string
          lojinha_reserved_qty: number
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          lojinha_reserved_qty?: number
          product_id: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          lojinha_reserved_qty?: number
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          ativo_geral: boolean
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          disponivel_venda: boolean
          id: string
          is_available: boolean
          is_drink: boolean
          is_drink_input: boolean
          is_sellable: boolean
          name: string
          online_price: number | null
          photo_url: string | null
          pickup_description: string | null
          price: number
          product_type: string
          sell_online: boolean
          stock_quantity: number
          track_stock: boolean
          unit: string
          updated_at: string
          user_id: string
          visivel_lojinha_cliente: boolean
          visivel_mobile_garcom: boolean
          visivel_pdv_caixa: boolean
        }
        Insert: {
          ativo_geral?: boolean
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          disponivel_venda?: boolean
          id?: string
          is_available?: boolean
          is_drink?: boolean
          is_drink_input?: boolean
          is_sellable?: boolean
          name: string
          online_price?: number | null
          photo_url?: string | null
          pickup_description?: string | null
          price?: number
          product_type?: string
          sell_online?: boolean
          stock_quantity?: number
          track_stock?: boolean
          unit?: string
          updated_at?: string
          user_id: string
          visivel_lojinha_cliente?: boolean
          visivel_mobile_garcom?: boolean
          visivel_pdv_caixa?: boolean
        }
        Update: {
          ativo_geral?: boolean
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          disponivel_venda?: boolean
          id?: string
          is_available?: boolean
          is_drink?: boolean
          is_drink_input?: boolean
          is_sellable?: boolean
          name?: string
          online_price?: number | null
          photo_url?: string | null
          pickup_description?: string | null
          price?: number
          product_type?: string
          sell_online?: boolean
          stock_quantity?: number
          track_stock?: boolean
          unit?: string
          updated_at?: string
          user_id?: string
          visivel_lojinha_cliente?: boolean
          visivel_mobile_garcom?: boolean
          visivel_pdv_caixa?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promoter_credit_campaign_members: {
        Row: {
          campaign_id: string
          created_at: string
          credited_amount: number
          id: string
          promoter_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          credited_amount: number
          id?: string
          promoter_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          credited_amount?: number
          id?: string
          promoter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promoter_credit_campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promoter_credit_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      promoter_credit_campaigns: {
        Row: {
          applies_to_promotions: boolean
          created_at: string
          credit_amount: number
          enabled: boolean
          event_id: string
          excluded_category_ids: string[]
          excluded_product_ids: string[]
          id: string
          max_percent: number
          min_purchase: number
          name: string
          notes: string | null
          updated_at: string
          user_id: string
          valid_from: string | null
          valid_until: string | null
          valid_weekdays: number[] | null
        }
        Insert: {
          applies_to_promotions?: boolean
          created_at?: string
          credit_amount: number
          enabled?: boolean
          event_id: string
          excluded_category_ids?: string[]
          excluded_product_ids?: string[]
          id?: string
          max_percent?: number
          min_purchase?: number
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
          valid_from?: string | null
          valid_until?: string | null
          valid_weekdays?: number[] | null
        }
        Update: {
          applies_to_promotions?: boolean
          created_at?: string
          credit_amount?: number
          enabled?: boolean
          event_id?: string
          excluded_category_ids?: string[]
          excluded_product_ids?: string[]
          id?: string
          max_percent?: number
          min_purchase?: number
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          valid_from?: string | null
          valid_until?: string | null
          valid_weekdays?: number[] | null
        }
        Relationships: []
      }
      promoter_credit_redemptions: {
        Row: {
          amount: number
          authorized_by: string | null
          authorized_by_name: string | null
          campaign_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          notes: string | null
          promoter_id: string
          sale_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          authorized_by?: string | null
          authorized_by_name?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          notes?: string | null
          promoter_id: string
          sale_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          authorized_by?: string | null
          authorized_by_name?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          notes?: string | null
          promoter_id?: string
          sale_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      promoter_credit_rules: {
        Row: {
          created_at: string
          enabled: boolean
          event_id: string | null
          excluded_category_ids: string[]
          excluded_product_ids: string[]
          id: string
          max_percent: number
          min_purchase: number
          notes: string | null
          promoter_id: string | null
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          event_id?: string | null
          excluded_category_ids?: string[]
          excluded_product_ids?: string[]
          id?: string
          max_percent?: number
          min_purchase?: number
          notes?: string | null
          promoter_id?: string | null
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          event_id?: string | null
          excluded_category_ids?: string[]
          excluded_product_ids?: string[]
          id?: string
          max_percent?: number
          min_purchase?: number
          notes?: string | null
          promoter_id?: string | null
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promoter_credit_rules_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promoter_credit_rules_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      promoter_credits: {
        Row: {
          amount: number
          campaign_id: string | null
          created_at: string
          event_id: string
          expires_after_event_id: string | null
          gender: string | null
          id: string
          notes: string | null
          promoter_id: string
          source: string
          source_ref_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          campaign_id?: string | null
          created_at?: string
          event_id: string
          expires_after_event_id?: string | null
          gender?: string | null
          id?: string
          notes?: string | null
          promoter_id: string
          source: string
          source_ref_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          campaign_id?: string | null
          created_at?: string
          event_id?: string
          expires_after_event_id?: string | null
          gender?: string | null
          id?: string
          notes?: string | null
          promoter_id?: string
          source?: string
          source_ref_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      promoters: {
        Row: {
          accumulated_balance: number
          comm_man_free_type: string
          comm_man_free_value: number
          comm_man_paid_type: string
          comm_man_paid_value: number
          comm_woman_free_type: string
          comm_woman_free_value: number
          comm_woman_paid_type: string
          comm_woman_paid_value: number
          commission_percent: number
          created_at: string
          email: string | null
          guest_message: string | null
          id: string
          instagram_handle: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accumulated_balance?: number
          comm_man_free_type?: string
          comm_man_free_value?: number
          comm_man_paid_type?: string
          comm_man_paid_value?: number
          comm_woman_free_type?: string
          comm_woman_free_value?: number
          comm_woman_paid_type?: string
          comm_woman_paid_value?: number
          commission_percent?: number
          created_at?: string
          email?: string | null
          guest_message?: string | null
          id?: string
          instagram_handle?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accumulated_balance?: number
          comm_man_free_type?: string
          comm_man_free_value?: number
          comm_man_paid_type?: string
          comm_man_paid_value?: number
          comm_woman_free_type?: string
          comm_woman_free_value?: number
          comm_woman_paid_type?: string
          comm_woman_paid_value?: number
          commission_percent?: number
          created_at?: string
          email?: string | null
          guest_message?: string | null
          id?: string
          instagram_handle?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          cost_price_snapshot: number
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
          user_id: string
        }
        Insert: {
          cost_price_snapshot?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          subtotal?: number
          unit_price?: number
          user_id: string
        }
        Update: {
          cost_price_snapshot?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          subtotal?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          notes: string | null
          promoter_id: string | null
          sale_id: string
          terminal_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          method: string
          notes?: string | null
          promoter_id?: string | null
          sale_id: string
          terminal_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          promoter_id?: string | null
          sale_id?: string
          terminal_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_name: string | null
          cancelled_reason: string | null
          category: string
          closing_id: string | null
          consumacao_recipient_name: string | null
          consumacao_target: string | null
          created_at: string
          daily_date: string | null
          daily_number: number | null
          discount_by: string | null
          discount_percent: number
          discount_value: number
          employee_id: string | null
          employee_name: string | null
          event_id: string | null
          gender: string | null
          id: string
          location_id: string | null
          notes: string | null
          payment_method: string
          pickup_token: string | null
          released_at: string | null
          released_by: string | null
          released_by_name: string | null
          session_id: string | null
          status: string
          terminal_id: string | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_name?: string | null
          cancelled_reason?: string | null
          category?: string
          closing_id?: string | null
          consumacao_recipient_name?: string | null
          consumacao_target?: string | null
          created_at?: string
          daily_date?: string | null
          daily_number?: number | null
          discount_by?: string | null
          discount_percent?: number
          discount_value?: number
          employee_id?: string | null
          employee_name?: string | null
          event_id?: string | null
          gender?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          payment_method: string
          pickup_token?: string | null
          released_at?: string | null
          released_by?: string | null
          released_by_name?: string | null
          session_id?: string | null
          status?: string
          terminal_id?: string | null
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_name?: string | null
          cancelled_reason?: string | null
          category?: string
          closing_id?: string | null
          consumacao_recipient_name?: string | null
          consumacao_target?: string | null
          created_at?: string
          daily_date?: string | null
          daily_number?: number | null
          discount_by?: string | null
          discount_percent?: number
          discount_value?: number
          employee_id?: string | null
          employee_name?: string | null
          event_id?: string | null
          gender?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          payment_method?: string
          pickup_token?: string | null
          released_at?: string | null
          released_by?: string | null
          released_by_name?: string | null
          session_id?: string | null
          status?: string
          terminal_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_inventories: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          location_id: string
          net_value: number
          notes: string | null
          opened_at: string
          opened_by: string | null
          opened_by_name: string | null
          status: string
          total_shortage_value: number
          total_surplus_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          location_id: string
          net_value?: number
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opened_by_name?: string | null
          status?: string
          total_shortage_value?: number
          total_surplus_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          location_id?: string
          net_value?: number
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opened_by_name?: string | null
          status?: string
          total_shortage_value?: number
          total_surplus_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_inventory_items: {
        Row: {
          cost_price: number
          counted_qty: number | null
          created_at: string
          diff_value: number
          id: string
          inventory_id: string
          product_id: string
          product_name: string
          system_qty: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_price?: number
          counted_qty?: number | null
          created_at?: string
          diff_value?: number
          id?: string
          inventory_id: string
          product_id: string
          product_name: string
          system_qty?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_price?: number
          counted_qty?: number | null
          created_at?: string
          diff_value?: number
          id?: string
          inventory_id?: string
          product_id?: string
          product_name?: string
          system_qty?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_inventory_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "stock_inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_purchase_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          product_name_snapshot: string
          purchase_id: string
          quantity: number
          total_cost: number
          unit_cost: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          product_name_snapshot: string
          purchase_id: string
          quantity: number
          total_cost: number
          unit_cost: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          product_name_snapshot?: string
          purchase_id?: string
          quantity?: number
          total_cost?: number
          unit_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "stock_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_purchases: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string | null
          expense_id: string | null
          id: string
          location_id: string
          notes: string | null
          reversed_at: string | null
          reversed_by: string | null
          reversed_by_name: string | null
          status: string
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name?: string | null
          expense_id?: string | null
          id?: string
          location_id: string
          notes?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_by_name?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          expense_id?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_by_name?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          from_location_id: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          to_location_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          from_location_id: string
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          to_location_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          from_location_id?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          to_location_id?: string
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      terminal_assignments: {
        Row: {
          created_at: string
          id: string
          seller_user_id: string
          terminal_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          seller_user_id: string
          terminal_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          seller_user_id?: string
          terminal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_assignments_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          created_at: string
          event_id: string
          gender_target: string | null
          id: string
          is_active: boolean
          name: string
          price_early: number
          price_late: number
          sort_order: number
          switch_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          gender_target?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_early?: number
          price_late?: number
          sort_order?: number
          switch_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          gender_target?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_early?: number
          price_late?: number
          sort_order?: number
          switch_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          aceita_cartao: boolean
          aceita_credito_promoter: boolean
          aceita_dinheiro: boolean
          aceita_pix: boolean
          avatar_url: string | null
          can_authorize: boolean
          can_discount: boolean
          can_sell_cash: boolean
          created_at: string
          display_name: string | null
          email: string | null
          eventos_abrir_encerrar: boolean
          eventos_criar: boolean
          eventos_editar: boolean
          eventos_ver_financeiro: boolean
          financeiro_fechar_caixa: boolean
          financeiro_lancar_despesas: boolean
          financeiro_ver_numeros: boolean
          id: string
          lojinha_can_sell: boolean
          lojinha_payment_methods: string[]
          lojinha_point_device_id: string | null
          max_discount_percent: number
          owner_id: string
          permissions: string[]
          pix_enabled: boolean
          pix_key: string | null
          pode_adicionar_bebidas: boolean
          pode_lancar_consumacao: boolean
          pode_pix_chave: boolean
          produtos_adicionar_entrada: boolean
          produtos_conferir_estoque: boolean
          produtos_criar_combo: boolean
          produtos_criar_editar: boolean
          produtos_inventario: boolean
          promoter_id: string | null
          promoters_comissoes: boolean
          promoters_gerenciar: boolean
          promoters_ver_desempenho: boolean
          role: Database["public"]["Enums"]["app_role"]
          role_preset: string | null
          updated_at: string
          user_id: string
          vendas_abre_caixa: boolean
          vendas_abrir_fechar_caixa: boolean
          vendas_ao_vivo: boolean
          vendas_fechamento: boolean
          vendas_garcom: boolean
          vendas_historico: boolean
          vendas_pdv_caixa: boolean
          vendas_pedidos: boolean
          vendas_promoter_creditos_dinheiro: boolean
          vendas_sangria: boolean
          vendas_validar_qr: boolean
          whatsapp: string | null
        }
        Insert: {
          aceita_cartao?: boolean
          aceita_credito_promoter?: boolean
          aceita_dinheiro?: boolean
          aceita_pix?: boolean
          avatar_url?: string | null
          can_authorize?: boolean
          can_discount?: boolean
          can_sell_cash?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          eventos_abrir_encerrar?: boolean
          eventos_criar?: boolean
          eventos_editar?: boolean
          eventos_ver_financeiro?: boolean
          financeiro_fechar_caixa?: boolean
          financeiro_lancar_despesas?: boolean
          financeiro_ver_numeros?: boolean
          id?: string
          lojinha_can_sell?: boolean
          lojinha_payment_methods?: string[]
          lojinha_point_device_id?: string | null
          max_discount_percent?: number
          owner_id: string
          permissions?: string[]
          pix_enabled?: boolean
          pix_key?: string | null
          pode_adicionar_bebidas?: boolean
          pode_lancar_consumacao?: boolean
          pode_pix_chave?: boolean
          produtos_adicionar_entrada?: boolean
          produtos_conferir_estoque?: boolean
          produtos_criar_combo?: boolean
          produtos_criar_editar?: boolean
          produtos_inventario?: boolean
          promoter_id?: string | null
          promoters_comissoes?: boolean
          promoters_gerenciar?: boolean
          promoters_ver_desempenho?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          role_preset?: string | null
          updated_at?: string
          user_id: string
          vendas_abre_caixa?: boolean
          vendas_abrir_fechar_caixa?: boolean
          vendas_ao_vivo?: boolean
          vendas_fechamento?: boolean
          vendas_garcom?: boolean
          vendas_historico?: boolean
          vendas_pdv_caixa?: boolean
          vendas_pedidos?: boolean
          vendas_promoter_creditos_dinheiro?: boolean
          vendas_sangria?: boolean
          vendas_validar_qr?: boolean
          whatsapp?: string | null
        }
        Update: {
          aceita_cartao?: boolean
          aceita_credito_promoter?: boolean
          aceita_dinheiro?: boolean
          aceita_pix?: boolean
          avatar_url?: string | null
          can_authorize?: boolean
          can_discount?: boolean
          can_sell_cash?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          eventos_abrir_encerrar?: boolean
          eventos_criar?: boolean
          eventos_editar?: boolean
          eventos_ver_financeiro?: boolean
          financeiro_fechar_caixa?: boolean
          financeiro_lancar_despesas?: boolean
          financeiro_ver_numeros?: boolean
          id?: string
          lojinha_can_sell?: boolean
          lojinha_payment_methods?: string[]
          lojinha_point_device_id?: string | null
          max_discount_percent?: number
          owner_id?: string
          permissions?: string[]
          pix_enabled?: boolean
          pix_key?: string | null
          pode_adicionar_bebidas?: boolean
          pode_lancar_consumacao?: boolean
          pode_pix_chave?: boolean
          produtos_adicionar_entrada?: boolean
          produtos_conferir_estoque?: boolean
          produtos_criar_combo?: boolean
          produtos_criar_editar?: boolean
          produtos_inventario?: boolean
          promoter_id?: string | null
          promoters_comissoes?: boolean
          promoters_gerenciar?: boolean
          promoters_ver_desempenho?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          role_preset?: string | null
          updated_at?: string
          user_id?: string
          vendas_abre_caixa?: boolean
          vendas_abrir_fechar_caixa?: boolean
          vendas_ao_vivo?: boolean
          vendas_fechamento?: boolean
          vendas_garcom?: boolean
          vendas_historico?: boolean
          vendas_pdv_caixa?: boolean
          vendas_pedidos?: boolean
          vendas_promoter_creditos_dinheiro?: boolean
          vendas_sangria?: boolean
          vendas_validar_qr?: boolean
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "promoters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      unified_sales_history: {
        Row: {
          category: string | null
          channel: string | null
          created_at: string | null
          customer_name: string | null
          daily_number: number | null
          delivered_at: string | null
          delivered_by: string | null
          delivered_by_name: string | null
          id: string | null
          owner_id: string | null
          payment_method: string | null
          seller_name: string | null
          seller_user_id: string | null
          status: string | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _can_authorize_cash: {
        Args: { _owner: string; _uid: string }
        Returns: boolean
      }
      _ensure_sector_row: {
        Args: { _owner: string; _sector: string }
        Returns: {
          authorized_at: string | null
          authorized_by: string | null
          authorized_by_name: string | null
          close_declared: Json | null
          created_at: string
          id: string
          notes: string | null
          opening_amount: number
          requested_at: string | null
          requested_by: string | null
          requested_by_name: string | null
          sector: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_register_sectors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _sector_permission: { Args: { _sector: string }; Returns: string }
      abandon_lojinha_order: { Args: { _order_id: string }; Returns: Json }
      add_guest_to_event: {
        Args: {
          _companions?: Json
          _event_slug: string
          _gender: string
          _name: string
          _phone: string
          _promoter_slug?: string
        }
        Returns: Json
      }
      add_guest_to_list: {
        Args: { _gender: string; _name: string; _phone: string; _slug: string }
        Returns: string
      }
      add_guest_to_list_v2: {
        Args: {
          _companions?: Json
          _gender: string
          _name: string
          _phone: string
          _slug: string
        }
        Returns: Json
      }
      apply_role_preset: {
        Args: { p_preset: string; p_user_role_id: string }
        Returns: undefined
      }
      authorize_open_sector: {
        Args: { _notes?: string; _opening_amount: number; _sector: string }
        Returns: string
      }
      cancel_local_sale: {
        Args: { _reason: string; _sale_id: string }
        Returns: Json
      }
      checkin_guest: {
        Args: { _checked: boolean; _entry_id: string }
        Returns: undefined
      }
      close_cash_blind: {
        Args: {
          _declared_credito: number
          _declared_debito: number
          _declared_dinheiro: number
          _declared_pix: number
          _grant_token: string
          _notes?: string
        }
        Returns: string
      }
      close_expired_events: { Args: never; Returns: number }
      close_inventory: {
        Args: { _adjust_stock?: boolean; _inventory_id: string }
        Returns: undefined
      }
      confirm_close_sector: { Args: { _sector: string }; Returns: string }
      consume_grant: { Args: { _scope: string; _token: string }; Returns: Json }
      expire_old_promoter_credits: {
        Args: { _owner_id: string }
        Returns: number
      }
      expire_pending_lojinha_orders: { Args: never; Returns: undefined }
      finalize_sale_from_pix: { Args: { _charge_id: string }; Returns: string }
      force_close_sector: { Args: { _sector: string }; Returns: string }
      force_open_sector: {
        Args: { _opening_amount: number; _sector: string }
        Returns: string
      }
      get_combo_items_for_sales: {
        Args: never
        Returns: {
          combo_product_id: string
          component_product_id: string
          quantity: number
        }[]
      }
      get_event_consumacao: { Args: { _event_id: string }; Returns: Json }
      get_event_drink_margin: {
        Args: { p_event_id: string; p_window_events?: number }
        Returns: Json
      }
      get_event_landing: { Args: { _slug: string }; Returns: Json }
      get_event_staff_to_close: {
        Args: { _event_id: string }
        Returns: {
          accepts_cash: boolean
          closed_at: string
          closing_id: string
          staff_name: string
          staff_user_id: string
          total_reported: number
          total_system: number
        }[]
      }
      get_guest_list_info: {
        Args: { _slug: string }
        Returns: {
          event_date: string
          event_end_date: string
          event_flyer_url: string
          event_location: string
          event_name: string
          event_promoter_id: string
          event_status: string
          event_whatsapp_group_url: string
          promoter_avatar_url: string
          promoter_guest_message: string
          promoter_instagram: string
          promoter_name: string
          promoter_phone: string
          show_real_count_when_big: boolean
          total_entries: number
        }[]
      }
      get_live_dashboard: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      get_my_open_session: { Args: never; Returns: Json }
      get_owner_id: { Args: { _user_id: string }; Returns: string }
      get_portaria_sales: {
        Args: { _event_id: string }
        Returns: {
          cancelled_at: string
          cancelled_reason: string
          created_at: string
          employee_name: string
          id: string
          items: Json
          payments: Json
          status: string
          total: number
        }[]
      }
      get_portaria_summary: { Args: { _event_id: string }; Returns: Json }
      get_sector_statuses: {
        Args: never
        Returns: {
          authorized_at: string | null
          authorized_by: string | null
          authorized_by_name: string | null
          close_declared: Json | null
          created_at: string
          id: string
          notes: string | null
          opening_amount: number
          requested_at: string | null
          requested_by: string | null
          requested_by_name: string | null
          sector: string
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cash_register_sectors"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_session_expected_totals: { Args: never; Returns: Json }
      get_staff_closing_breakdown: {
        Args: { _event_id: string; _staff_user_id: string }
        Returns: Json
      }
      get_supplier_consumacao_history: {
        Args: { _expense_id: string; _from?: string; _to?: string }
        Returns: Json
      }
      grant_via_pin: { Args: { _pin: string; _scope: string }; Returns: Json }
      has_owner_pin: { Args: never; Returns: boolean }
      has_permission: {
        Args: { _owner_id: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      is_owner_of: {
        Args: { _owner_id: string; _user_id: string }
        Returns: boolean
      }
      list_unified_sales_history: {
        Args: {
          _channel?: string
          _from?: string
          _limit?: number
          _seller_user_id?: string
          _to?: string
        }
        Returns: {
          category: string | null
          channel: string | null
          created_at: string | null
          customer_name: string | null
          daily_number: number | null
          delivered_at: string | null
          delivered_by: string | null
          delivered_by_name: string | null
          id: string | null
          owner_id: string | null
          payment_method: string | null
          seller_name: string | null
          seller_user_id: string | null
          status: string | null
          total: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "unified_sales_history"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      lojinha_confirm_delivery_pos: {
        Args: { _order_id: string }
        Returns: Json
      }
      lojinha_confirm_payment: {
        Args: { _mp_payment_id: string; _order_id: string }
        Returns: Json
      }
      lojinha_create_order: {
        Args: {
          _cart_token: string
          _customer_email: string
          _customer_name: string
          _customer_phone: string
          _items: Json
          _slug: string
        }
        Returns: Json
      }
      lojinha_create_pending_order: {
        Args: {
          _cart_token: string
          _customer_email: string
          _customer_name: string
          _customer_phone: string
          _items: Json
        }
        Returns: {
          id: string
          pickup_code: string
          pickup_token: string
          total: number
        }[]
      }
      lojinha_create_pos_order:
        | {
            Args: {
              _customer_name: string
              _items: Json
              _seller_name?: string
            }
            Returns: {
              daily_number: number
              id: string
              pickup_code: string
              pickup_token: string
              total: number
            }[]
          }
        | {
            Args: { _device_id: string; _items: Json; _payment_method: string }
            Returns: Json
          }
      lojinha_customer_abandon_order: {
        Args: { _customer_phone: string; _order_id: string }
        Returns: Json
      }
      lojinha_find_pending_for_customer: {
        Args: { _customer_phone: string; _slug: string }
        Returns: Json
      }
      lojinha_generate_pickup_code: { Args: never; Returns: string }
      lojinha_get_order: { Args: { _order_id: string }; Returns: Json }
      lojinha_get_storefront: { Args: { _slug: string }; Returns: Json }
      lojinha_mark_order_delivered: {
        Args: { _order_id: string }
        Returns: Json
      }
      lojinha_mark_pos_paid: {
        Args: { _order_id: string; _payment_id: string }
        Returns: Json
      }
      lojinha_operation_window: { Args: { _slug: string }; Returns: Json }
      lojinha_release_expired_reservations: { Args: never; Returns: undefined }
      lojinha_release_order_reservation: {
        Args: { _order_id: string }
        Returns: undefined
      }
      lojinha_release_order_reservations: {
        Args: { _order_id: string }
        Returns: undefined
      }
      lojinha_reserve_cart_item: {
        Args: {
          _cart_token: string
          _product_id: string
          _qty: number
          _slug: string
        }
        Returns: Json
      }
      lojinha_reserve_for_checkout: {
        Args: { _order_id: string }
        Returns: Json
      }
      lojinha_toggle_sell_online: {
        Args: { _product_id: string }
        Returns: boolean
      }
      lojinha_validate_qr: { Args: { _token: string }; Returns: Json }
      mark_units_printed: { Args: { _qr_tokens: string[] }; Returns: undefined }
      next_daily_order_number: { Args: { _owner: string }; Returns: number }
      open_cash_session:
        | {
            Args: { _event_id?: string; _notes?: string; _opening: number }
            Returns: string
          }
        | {
            Args: {
              _event_id?: string
              _grant_token?: string
              _notes?: string
              _opening: number
            }
            Returns: string
          }
      order_lookup_by_token: { Args: { _token: string }; Returns: Json }
      order_release: { Args: { _id: string; _source: string }; Returns: Json }
      promoter_active_balance: {
        Args: { _promoter_id: string }
        Returns: number
      }
      promoter_campaign_balance: {
        Args: { _campaign_id: string; _promoter_id: string }
        Returns: number
      }
      promoter_names_balance: {
        Args: { _promoter_id: string }
        Returns: number
      }
      redeem_promoter_credit: {
        Args: {
          _amount: number
          _grant_token?: string
          _promoter_id: string
          _sale_id: string
        }
        Returns: string
      }
      redeem_promoter_credit_v2: {
        Args: {
          _amount: number
          _campaign_id?: string
          _grant_token?: string
          _promoter_id: string
          _sale_id: string
        }
        Returns: string
      }
      refund_event_sale: {
        Args: {
          _amount: number
          _grant_token: string
          _reason: string
          _sale_id: string
        }
        Returns: undefined
      }
      refund_pdv_sale: {
        Args: {
          _amount: number
          _grant_token: string
          _reason: string
          _sale_id: string
        }
        Returns: undefined
      }
      register_drink_consumption: {
        Args: { p_event_id: string; p_product_id: string; p_quantity?: number }
        Returns: string
      }
      register_event_entry: {
        Args: {
          _amount: number
          _event_id: string
          _gender: string
          _notes?: string
          _payment_method: string
          _ticket_type_id: string
        }
        Returns: string
      }
      register_event_entry_cart: {
        Args: { _event_id: string; _items: Json; _payments: Json }
        Returns: string
      }
      register_stock_purchase: {
        Args: {
          _due_date: string
          _expense_category_id: string
          _expense_category_name: string
          _expense_date: string
          _items: Json
          _location_id: string
          _notes: string
          _paid: boolean
          _payment_method: string
          _supplier_id: string
          _supplier_name: string
        }
        Returns: string
      }
      register_withdrawal: {
        Args: { _amount: number; _grant_token: string; _reason: string }
        Returns: string
      }
      register_withdrawal_for_session: {
        Args: {
          _amount: number
          _grant_token: string
          _reason: string
          _session_id: string
        }
        Returns: string
      }
      reopen_staff_closing: {
        Args: { _closing_id: string }
        Returns: undefined
      }
      request_close_sector: {
        Args: { _declared?: Json; _sector: string }
        Returns: string
      }
      request_open_sector: { Args: { _sector: string }; Returns: string }
      reverse_stock_purchase: {
        Args: { _purchase_id: string }
        Returns: boolean
      }
      seed_default_bar_expense_categories: {
        Args: { _user_id: string }
        Returns: undefined
      }
      seed_default_cost_categories: {
        Args: { _user_id: string }
        Returns: undefined
      }
      seed_default_product_categories: {
        Args: { _user_id: string }
        Returns: undefined
      }
      set_owner_pin: { Args: { _pin: string }; Returns: undefined }
      start_event: { Args: { _event_id: string }; Returns: undefined }
      submit_staff_closing: {
        Args: {
          _cash_counted: number
          _event_id: string
          _notes?: string
          _pix_chave_refunded: string[]
          _staff_user_id: string
          _terminals: Json
        }
        Returns: string
      }
      transfer_stock: {
        Args: {
          _from_location: string
          _notes?: string
          _product_id: string
          _quantity: number
          _to_location: string
        }
        Returns: string
      }
      undo_drink_consumption: { Args: { p_id: string }; Returns: undefined }
      upsert_promoter_credit_campaign: {
        Args: {
          _applies_to_promotions: boolean
          _campaign_id: string
          _credit_amount: number
          _enabled: boolean
          _event_id: string
          _excluded_category_ids: string[]
          _excluded_product_ids: string[]
          _max_percent: number
          _min_purchase: number
          _name: string
          _notes: string
          _promoter_ids: string[]
          _valid_from: string
          _valid_until: string
          _valid_weekdays: number[]
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "owner" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "staff"],
    },
  },
} as const
