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
      account_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          name: string | null
          phone: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          name?: string | null
          phone?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          name?: string | null
          phone?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          record_id: string | null
          table_name: string | null
          user_id: string | null
          work_order_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          app_name: string
          brand_color: string | null
          email_provider_note: string | null
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          app_name?: string
          brand_color?: string | null
          email_provider_note?: string | null
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          app_name?: string
          brand_color?: string | null
          email_provider_note?: string | null
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      dropdown_options: {
        Row: {
          active: boolean
          created_at: string
          id: string
          option_type: string
          option_value: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          option_type: string
          option_value: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          option_type?: string
          option_value?: string
          sort_order?: number
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      follow_up_events: {
        Row: {
          changed_by: string | null
          created_at: string
          follow_up: Database["public"]["Enums"]["follow_up_status"]
          follow_up_date: string | null
          follow_up_notes: string | null
          id: string
          work_order_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          follow_up: Database["public"]["Enums"]["follow_up_status"]
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          work_order_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          follow_up?: Database["public"]["Enums"]["follow_up_status"]
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          failed_rows: number | null
          file_name: string | null
          id: string
          import_type: string
          notes: string | null
          successful_rows: number | null
          total_rows: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          failed_rows?: number | null
          file_name?: string | null
          id?: string
          import_type: string
          notes?: string | null
          successful_rows?: number | null
          total_rows?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          failed_rows?: number | null
          file_name?: string | null
          id?: string
          import_type?: string
          notes?: string | null
          successful_rows?: number | null
          total_rows?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note_text: string
          note_type: Database["public"]["Enums"]["note_type"]
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note_text: string
          note_type?: Database["public"]["Enums"]["note_type"]
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note_text?: string
          note_type?: Database["public"]["Enums"]["note_type"]
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          user_id: string
          work_order_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          user_id: string
          work_order_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          created_at: string
          description: string | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          photo_category: Database["public"]["Enums"]["photo_category"]
          schedule_visit_id: string | null
          storage_path: string | null
          uploaded_by: string | null
          work_order_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          photo_category?: Database["public"]["Enums"]["photo_category"]
          schedule_visit_id?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          work_order_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          photo_category?: Database["public"]["Enums"]["photo_category"]
          schedule_visit_id?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_schedule_visit_id_fkey"
            columns: ["schedule_visit_id"]
            isOneToOne: false
            referencedRelation: "schedule_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          created_at: string
          id: string
          notes: string | null
          property_name: string
          property_type: string | null
          state: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          property_name: string
          property_type?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          property_name?: string
          property_type?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      schedule_visits: {
        Row: {
          actual_hours: number | null
          assigned_to: string | null
          completed: boolean
          created_at: string
          created_by: string | null
          end_time: string | null
          estimated_hours: number | null
          id: string
          manager_notes: string | null
          scheduled_date: string
          start_time: string | null
          tech_notes: string | null
          tenant_notes: string | null
          updated_at: string
          visit_status: Database["public"]["Enums"]["visit_status"]
          work_order_id: string
        }
        Insert: {
          actual_hours?: number | null
          assigned_to?: string | null
          completed?: boolean
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          estimated_hours?: number | null
          id?: string
          manager_notes?: string | null
          scheduled_date: string
          start_time?: string | null
          tech_notes?: string | null
          tenant_notes?: string | null
          updated_at?: string
          visit_status?: Database["public"]["Enums"]["visit_status"]
          work_order_id: string
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string | null
          completed?: boolean
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          estimated_hours?: number | null
          id?: string
          manager_notes?: string | null
          scheduled_date?: string
          start_time?: string | null
          tech_notes?: string | null
          tenant_notes?: string | null
          updated_at?: string
          visit_status?: Database["public"]["Enums"]["visit_status"]
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_visits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_visits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      status_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["job_status"]
          old_status: Database["public"]["Enums"]["job_status"] | null
          work_order_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["job_status"]
          old_status?: Database["public"]["Enums"]["job_status"] | null
          work_order_id: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["job_status"]
          old_status?: Database["public"]["Enums"]["job_status"] | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          access_notes: string | null
          active: boolean
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          lease_notes: string | null
          move_in_date: string | null
          move_out_date: string | null
          phone: string | null
          property_id: string | null
          special_instructions: string | null
          tenant_name: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          active?: boolean
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lease_notes?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          phone?: string | null
          property_id?: string | null
          special_instructions?: string | null
          tenant_name: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          active?: boolean
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lease_notes?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          phone?: string | null
          property_id?: string | null
          special_instructions?: string | null
          tenant_name?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          end_time: string | null
          entry_date: string
          id: string
          notes: string | null
          schedule_visit_id: string | null
          start_time: string | null
          technician_id: string | null
          total_hours: number
          work_order_id: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          schedule_visit_id?: string | null
          start_time?: string | null
          technician_id?: string | null
          total_hours?: number
          work_order_id: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          schedule_visit_id?: string | null
          start_time?: string | null
          technician_id?: string | null
          total_hours?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_schedule_visit_id_fkey"
            columns: ["schedule_visit_id"]
            isOneToOne: false
            referencedRelation: "schedule_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          access_notes: string | null
          active: boolean
          created_at: string
          floor: string | null
          id: string
          notes: string | null
          property_id: string
          unit_number: string
          unit_type: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          active?: boolean
          created_at?: string
          floor?: string | null
          id?: string
          notes?: string | null
          property_id: string
          unit_number: string
          unit_type?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          active?: boolean
          created_at?: string
          floor?: string | null
          id?: string
          notes?: string | null
          property_id?: string
          unit_number?: string
          unit_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          last_seen_at: string | null
          login_at: string
          logout_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          last_seen_at?: string | null
          login_at?: string
          logout_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          last_seen_at?: string | null
          login_at?: string
          logout_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          actual_hours: number | null
          admin_estimated_hours: number | null
          archived: boolean
          assigned_to: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          category: string | null
          closed_at: string | null
          closed_by: string | null
          completed: boolean
          completed_at: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          delay_reason: Database["public"]["Enums"]["delay_reason"]
          due_at: string | null
          estimated_hours: number | null
          follow_up: Database["public"]["Enums"]["follow_up_status"]
          follow_up_date: string | null
          follow_up_notes: string | null
          id: string
          internal_notes: string | null
          job_number: string
          job_type: string | null
          manager_notes: string | null
          parts_needed: string | null
          payer_responsibility: string | null
          priority: Database["public"]["Enums"]["job_priority"]
          property_id: string | null
          public_tenant_notes: string | null
          reopen_reason: string | null
          reopened: boolean
          reopened_at: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["job_status"]
          subcategory: string | null
          tags: string[] | null
          task_description: string | null
          tech_notes: string | null
          tenant_id: string | null
          tenant_notes: string | null
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          admin_estimated_hours?: number | null
          archived?: boolean
          assigned_to?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          category?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completed?: boolean
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          delay_reason?: Database["public"]["Enums"]["delay_reason"]
          due_at?: string | null
          estimated_hours?: number | null
          follow_up?: Database["public"]["Enums"]["follow_up_status"]
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          internal_notes?: string | null
          job_number: string
          job_type?: string | null
          manager_notes?: string | null
          parts_needed?: string | null
          payer_responsibility?: string | null
          priority?: Database["public"]["Enums"]["job_priority"]
          property_id?: string | null
          public_tenant_notes?: string | null
          reopen_reason?: string | null
          reopened?: boolean
          reopened_at?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          subcategory?: string | null
          tags?: string[] | null
          task_description?: string | null
          tech_notes?: string | null
          tenant_id?: string | null
          tenant_notes?: string | null
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          admin_estimated_hours?: number | null
          archived?: boolean
          assigned_to?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          category?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completed?: boolean
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          delay_reason?: Database["public"]["Enums"]["delay_reason"]
          due_at?: string | null
          estimated_hours?: number | null
          follow_up?: Database["public"]["Enums"]["follow_up_status"]
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          internal_notes?: string | null
          job_number?: string
          job_type?: string | null
          manager_notes?: string | null
          parts_needed?: string | null
          payer_responsibility?: string | null
          priority?: Database["public"]["Enums"]["job_priority"]
          property_id?: string | null
          public_tenant_notes?: string | null
          reopen_reason?: string | null
          reopened?: boolean
          reopened_at?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          subcategory?: string | null
          tags?: string[] | null
          task_description?: string | null
          tech_notes?: string | null
          tenant_id?: string | null
          tenant_notes?: string | null
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_profiles: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          phone: string
        }[]
      }
      admin_set_user_active: {
        Args: { _active: boolean; _target_user: string }
        Returns: undefined
      }
      can_access_work_order: { Args: { _wo: string }; Returns: boolean }
      can_write_work_order: { Args: { _wo: string }; Returns: boolean }
      current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_user_active: { Args: never; Returns: boolean }
      get_invite_by_token: {
        Args: { _token: string }
        Returns: {
          accepted_at: string
          accepted_by: string
          accepted_by_name: string
          email: string
          expires_at: string
          id: string
          name: string
          revoked_at: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          active: boolean
          email: string
          id: string
          name: string
          phone: string
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "technician" | "viewer"
      delay_reason:
        | "none"
        | "waiting_tenant"
        | "waiting_parts"
        | "weather"
        | "emergency_call"
        | "could_not_access"
        | "needs_approval"
        | "need_more_information"
        | "need_quote"
        | "need_vendor"
        | "other"
      follow_up_status:
        | "no"
        | "yes"
        | "next_week"
        | "scheduled"
        | "needs_manager_review"
        | "needs_tenant_response"
        | "needs_parts"
        | "needs_vendor"
      job_priority: "emergency" | "high" | "normal" | "low"
      job_status:
        | "new"
        | "scheduled"
        | "not_started"
        | "in_progress"
        | "waiting_parts"
        | "waiting_tenant"
        | "waiting_approval"
        | "could_not_access"
        | "done"
        | "manager_review"
        | "closed"
        | "reopened"
        | "cancelled"
      note_type: "manager" | "technician" | "tenant" | "internal" | "follow_up"
      photo_category: "before" | "during" | "after" | "other"
      visit_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled"
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
      app_role: ["admin", "manager", "technician", "viewer"],
      delay_reason: [
        "none",
        "waiting_tenant",
        "waiting_parts",
        "weather",
        "emergency_call",
        "could_not_access",
        "needs_approval",
        "need_more_information",
        "need_quote",
        "need_vendor",
        "other",
      ],
      follow_up_status: [
        "no",
        "yes",
        "next_week",
        "scheduled",
        "needs_manager_review",
        "needs_tenant_response",
        "needs_parts",
        "needs_vendor",
      ],
      job_priority: ["emergency", "high", "normal", "low"],
      job_status: [
        "new",
        "scheduled",
        "not_started",
        "in_progress",
        "waiting_parts",
        "waiting_tenant",
        "waiting_approval",
        "could_not_access",
        "done",
        "manager_review",
        "closed",
        "reopened",
        "cancelled",
      ],
      note_type: ["manager", "technician", "tenant", "internal", "follow_up"],
      photo_category: ["before", "during", "after", "other"],
      visit_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "rescheduled",
      ],
    },
  },
} as const
