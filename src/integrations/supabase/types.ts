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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      canvas_documents: {
        Row: {
          access_key: string
          canvas_data: Json
          created_at: string
          id: string
          name: string
        }
        Insert: {
          access_key: string
          canvas_data?: Json
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          access_key?: string
          canvas_data?: Json
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      canvas_saves: {
        Row: {
          canvas_data: Json
          created_at: string
          document_id: string | null
          folder_id: string | null
          id: string
          name: string
        }
        Insert: {
          canvas_data: Json
          created_at?: string
          document_id?: string | null
          folder_id?: string | null
          id?: string
          name?: string
        }
        Update: {
          canvas_data?: Json
          created_at?: string
          document_id?: string | null
          folder_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_saves_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "canvas_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_saves_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "save_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      save_folders: {
        Row: {
          created_at: string
          document_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "save_folders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "canvas_documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      rpc_create_document: {
        Args: { p_access_key: string; p_name: string }
        Returns: string
      }
      rpc_export_documents: {
        Args: never
        Returns: {
          canvas_data: Json
          created_at: string
          id: string
          name: string
        }[]
      }
      rpc_get_document_data: { Args: { p_doc_id: string }; Returns: Json }
      rpc_has_library_password: { Args: never; Returns: boolean }
      rpc_set_library_password: { Args: { p_hash: string }; Returns: undefined }
      rpc_update_document_data: {
        Args: { p_data: Json; p_doc_id: string }
        Returns: undefined
      }
      rpc_upsert_document: {
        Args: {
          p_access_key: string
          p_canvas_data: Json
          p_created_at: string
          p_id: string
          p_name: string
        }
        Returns: undefined
      }
      rpc_verify_document: {
        Args: { p_access_key: string; p_name: string }
        Returns: string
      }
      rpc_verify_library_password: {
        Args: { p_hash: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
