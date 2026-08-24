export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          links: Json | null;
          name: string;
          role: string;
          role_title: string | null;
          skills: string[] | null;
          team: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string;
          id: string;
          links?: Json | null;
          name?: string;
          role?: string;
          role_title?: string | null;
          skills?: string[] | null;
          team?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          links?: Json | null;
          name?: string;
          role?: string;
          role_title?: string | null;
          skills?: string[] | null;
          team?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      member_projects: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          short_description: string | null;
          project_type: string | null;
          role: string | null;
          technologies: string[] | null;
          image_url: string | null;
          status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          short_description?: string | null;
          project_type?: string | null;
          role?: string | null;
          technologies?: string[] | null;
          image_url?: string | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          short_description?: string | null;
          project_type?: string | null;
          role?: string | null;
          technologies?: string[] | null;
          image_url?: string | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_links: {
        Row: {
          id: string;
          project_id: string;
          link_type: Database["public"]["Enums"]["project_link_type"];
          url: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          link_type: Database["public"]["Enums"]["project_link_type"];
          url: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          link_type?: Database["public"]["Enums"]["project_link_type"];
          url?: string;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          project_id: string;
          member_id: string;
        };
        Insert: {
          project_id: string;
          member_id: string;
        };
        Update: {
          project_id?: string;
          member_id?: string;
        };
        Relationships: [];
      };
      hackathons: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          theme: string | null;
          category: string | null;
          start_date: string;
          end_date: string;
          location: string | null;
          registration_url: string | null;
          announcement_url: string | null;
          status: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          theme?: string | null;
          category?: string | null;
          start_date: string;
          end_date: string;
          location?: string | null;
          registration_url?: string | null;
          announcement_url?: string | null;
          status?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          theme?: string | null;
          category?: string | null;
          start_date?: string;
          end_date?: string;
          location?: string | null;
          registration_url?: string | null;
          announcement_url?: string | null;
          status?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      hackathon_projects: {
        Row: {
          hackathon_id: string;
          project_id: string;
        };
        Insert: {
          hackathon_id: string;
          project_id: string;
        };
        Update: {
          hackathon_id?: string;
          project_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          name: string;
          prefix: string;
          client_name: string;
          end_users: string[] | null;
          modules: string[] | null;
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          prefix?: string;
          client_name?: string;
          end_users?: string[] | null;
          modules?: string[] | null;
          created_at: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          prefix?: string;
          client_name?: string;
          end_users?: string[] | null;
          modules?: string[] | null;
          created_at?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      sprints: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          start_date: string;
          end_date: string;
          status: Database["public"]["Enums"]["sprint_status"];
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          start_date: string;
          end_date: string;
          status?: Database["public"]["Enums"]["sprint_status"];
          created_at?: string;
          created_by: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          start_date?: string;
          end_date?: string;
          status?: Database["public"]["Enums"]["sprint_status"];
          created_at?: string;
          created_by?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          sprint_id: string | null;
          title: string;
          description: string | null;
          status: Database["public"]["Enums"]["task_status"];
          priority: Database["public"]["Enums"]["task_priority"];
          story_points: number | null;
          assignee_id: string | null;
          epic: string | null;
          branch_name: string | null;
          created_at: string;
          created_by: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sprint_id?: string | null;
          title: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: Database["public"]["Enums"]["task_priority"];
          story_points?: number | null;
          assignee_id?: string | null;
          epic?: string | null;
          branch_name?: string | null;
          created_at?: string;
          created_by: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sprint_id?: string | null;
          title?: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: Database["public"]["Enums"]["task_priority"];
          story_points?: number | null;
          assignee_id?: string | null;
          epic?: string | null;
          branch_name?: string | null;
          created_at?: string;
          created_by?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          key: string;
          value: Json;
        };
        Insert: {
          key: string;
          value: Json;
        };
        Update: {
          key?: string;
          value?: Json;
        };
        Relationships: [];
      };
      ai_logs: {
        Row: {
          id: string;
          type: string;
          input: string;
          output: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          input: string;
          output: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          input?: string;
          output?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "pm" | "developer" | "qa";
      project_link_type: "live_demo" | "github" | "figma" | "play_store" | "case_study" | "website";
      sprint_status: "planning" | "active" | "completed";
      task_status: "backlog" | "todo" | "in_progress" | "review" | "qa" | "done";
      task_priority: "low" | "medium" | "high" | "critical";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["pm", "developer", "qa"],
      project_link_type: ["live_demo", "github", "figma", "play_store", "case_study", "website"],
      sprint_status: ["planning", "active", "completed"],
      task_status: ["backlog", "todo", "in_progress", "review", "qa", "done"],
      task_priority: ["low", "medium", "high", "critical"],
    },
  },
} as const;
