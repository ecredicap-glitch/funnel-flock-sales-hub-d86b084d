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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      campaign_messages: {
        Row: {
          attempts: number
          body: string | null
          campaign_id: string
          contact_id: string | null
          created_at: string
          error: string | null
          id: string
          phone: string
          replied_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          workspace_id: string
        }
        Insert: {
          attempts?: number
          body?: string | null
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          phone: string
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          workspace_id: string
        }
        Update: {
          attempts?: number
          body?: string | null
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          phone?: string
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          batch_pause_max: number
          batch_pause_min: number
          batch_size: number
          body: string
          created_at: string
          created_by: string | null
          daily_limit: number
          dedupe_days: number
          failed: number
          id: string
          instance_id: string | null
          list_id: string | null
          max_interval_s: number
          min_interval_s: number
          name: string
          next_send_at: string | null
          pause_reason: string | null
          sent: number
          sent_in_batch: number
          status: Database["public"]["Enums"]["campaign_status"]
          total: number
          window_days: number[]
          window_end: number
          window_start: number
          workspace_id: string
        }
        Insert: {
          batch_pause_max?: number
          batch_pause_min?: number
          batch_size?: number
          body: string
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          dedupe_days?: number
          failed?: number
          id?: string
          instance_id?: string | null
          list_id?: string | null
          max_interval_s?: number
          min_interval_s?: number
          name: string
          next_send_at?: string | null
          pause_reason?: string | null
          sent?: number
          sent_in_batch?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          total?: number
          window_days?: number[]
          window_end?: number
          window_start?: number
          workspace_id: string
        }
        Update: {
          batch_pause_max?: number
          batch_pause_min?: number
          batch_size?: number
          body?: string
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          dedupe_days?: number
          failed?: number
          id?: string
          instance_id?: string | null
          list_id?: string | null
          max_interval_s?: number
          min_interval_s?: number
          name?: string
          next_send_at?: string | null
          pause_reason?: string | null
          sent?: number
          sent_in_batch?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          total?: number
          window_days?: number[]
          window_end?: number
          window_start?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_imports: {
        Row: {
          created_at: string
          created_by: string
          duplicates: number
          file_name: string
          finished_at: string | null
          id: string
          inserted: number
          invalid: number
          list_id: string | null
          opt_in_mode: string
          opt_in_source: string | null
          status: string
          tags: string[]
          total_rows: number
          updated: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          duplicates?: number
          file_name: string
          finished_at?: string | null
          id?: string
          inserted?: number
          invalid?: number
          list_id?: string | null
          opt_in_mode: string
          opt_in_source?: string | null
          status?: string
          tags?: string[]
          total_rows?: number
          updated?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          duplicates?: number
          file_name?: string
          finished_at?: string | null
          id?: string
          inserted?: number
          invalid?: number
          list_id?: string | null
          opt_in_mode?: string
          opt_in_source?: string | null
          status?: string
          tags?: string[]
          total_rows?: number
          updated?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_imports_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_imports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_list_members: {
        Row: {
          added_at: string
          contact_id: string
          list_id: string
          workspace_id: string
        }
        Insert: {
          added_at?: string
          contact_id: string
          list_id: string
          workspace_id: string
        }
        Update: {
          added_at?: string
          contact_id?: string
          list_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_lists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          created_by: string | null
          custom_fields: Json
          eligible: boolean | null
          email: string | null
          id: string
          name: string | null
          opt_in_at: string | null
          opt_in_source: string | null
          phone: string
          status: Database["public"]["Enums"]["contact_status"]
          status_changed_at: string | null
          status_reason: string | null
          tags: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          eligible?: boolean | null
          email?: string | null
          id?: string
          name?: string | null
          opt_in_at?: string | null
          opt_in_source?: string | null
          phone: string
          status?: Database["public"]["Enums"]["contact_status"]
          status_changed_at?: string | null
          status_reason?: string | null
          tags?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          eligible?: boolean | null
          email?: string | null
          id?: string
          name?: string | null
          opt_in_at?: string | null
          opt_in_source?: string | null
          phone?: string
          status?: Database["public"]["Enums"]["contact_status"]
          status_changed_at?: string | null
          status_reason?: string | null
          tags?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_messages: {
        Row: {
          body: string | null
          contact_id: string | null
          id: string
          instance_id: string | null
          opt_out: boolean
          phone: string
          provider_message_id: string | null
          received_at: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          contact_id?: string | null
          id?: string
          instance_id?: string | null
          opt_out?: boolean
          phone: string
          provider_message_id?: string | null
          received_at?: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          contact_id?: string | null
          id?: string
          instance_id?: string | null
          opt_out?: boolean
          phone?: string
          provider_message_id?: string | null
          received_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_messages: {
        Row: {
          body: string
          contact_id: string | null
          id: string
          instance_id: string | null
          phone: string
          sent_at: string
          sent_by: string | null
          workspace_id: string
        }
        Insert: {
          body: string
          contact_id?: string | null
          id?: string
          instance_id?: string | null
          phone: string
          sent_at?: string
          sent_by?: string | null
          workspace_id: string
        }
        Update: {
          body?: string
          contact_id?: string | null
          id?: string
          instance_id?: string | null
          phone?: string
          sent_at?: string
          sent_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_events: {
        Row: {
          actor: string | null
          created_at: string
          detail: Json
          event: string
          id: number
          instance_id: string | null
          workspace_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: never
          instance_id?: string | null
          workspace_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: never
          instance_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_events_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_gateway_secrets: {
        Row: {
          api_key_enc: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          api_key_enc: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          api_key_enc?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_gateway_secrets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_gateways"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      whatsapp_gateways: {
        Row: {
          api_key_hint: string | null
          base_url: string
          created_at: string
          last_checked_at: string | null
          last_error: string | null
          provider: string
          provider_version: string | null
          status: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          api_key_hint?: string | null
          base_url: string
          created_at?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: string
          provider_version?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          api_key_hint?: string | null
          base_url?: string
          created_at?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: string
          provider_version?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_gateways_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instance_secrets: {
        Row: {
          instance_id: string
          instance_token_enc: string | null
          updated_at: string
          webhook_token_hash: string
        }
        Insert: {
          instance_id: string
          instance_token_enc?: string | null
          updated_at?: string
          webhook_token_hash: string
        }
        Update: {
          instance_id?: string
          instance_token_enc?: string | null
          updated_at?: string
          webhook_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_secrets_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          connected_at: string | null
          created_at: string
          created_by: string | null
          daily_limit: number
          disconnected_at: string | null
          display_name: string
          id: string
          last_error: string | null
          last_event_at: string | null
          pairing_code: string | null
          phone_number: string | null
          profile_name: string | null
          profile_pic_url: string | null
          provider_instance: string
          qr_code: string | null
          qr_updated_at: string | null
          status: string
          updated_at: string
          warmup_enabled: boolean
          webhook_url: string | null
          workspace_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          disconnected_at?: string | null
          display_name: string
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          pairing_code?: string | null
          phone_number?: string | null
          profile_name?: string | null
          profile_pic_url?: string | null
          provider_instance: string
          qr_code?: string | null
          qr_updated_at?: string | null
          status?: string
          updated_at?: string
          warmup_enabled?: boolean
          webhook_url?: string | null
          workspace_id: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          disconnected_at?: string | null
          display_name?: string
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          pairing_code?: string | null
          phone_number?: string | null
          profile_name?: string | null
          profile_pic_url?: string | null
          provider_instance?: string
          qr_code?: string | null
          qr_updated_at?: string | null
          status?: string
          updated_at?: string
          warmup_enabled?: boolean
          webhook_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      contact_list_stats: {
        Args: { _workspace_id: string }
        Returns: {
          eligible: number
          list_id: string
          total: number
        }[]
      }
      contact_tags: {
        Args: { _workspace_id: string }
        Returns: {
          tag: string
          total: number
        }[]
      }
      create_workspace: { Args: { _name: string }; Returns: string }
      enqueue_campaign: { Args: { _campaign_id: string }; Returns: number }
      has_workspace_role: {
        Args: {
          _role: Database["public"]["Enums"]["member_role"]
          _workspace_id: string
        }
        Returns: boolean
      }
      import_contacts_batch: {
        Args: { _import_id: string; _rows: Json }
        Returns: Json
      }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
      shares_workspace_with: { Args: { _other: string }; Returns: boolean }
    }
    Enums: {
      campaign_status:
        | "draft"
        | "running"
        | "paused"
        | "completed"
        | "cancelled"
      contact_status: "active" | "blocked" | "unsubscribed"
      member_role: "admin" | "operator"
      message_status: "queued" | "sent" | "failed" | "skipped"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      campaign_status: ["draft", "running", "paused", "completed", "cancelled"],
      contact_status: ["active", "blocked", "unsubscribed"],
      member_role: ["admin", "operator"],
      message_status: ["queued", "sent", "failed", "skipped"],
    },
  },
} as const
