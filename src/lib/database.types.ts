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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      channel_members: {
        Row: {
          channel_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_posts: {
        Row: {
          access_level: string
          approved_at: string | null
          approved_by: string | null
          author_id: string
          body: string | null
          channel_id: string
          content_type: string | null
          created_at: string
          duration_min: number | null
          episode_number: number | null
          episode_title: string | null
          genre: string | null
          id: string
          is_short: boolean | null
          media_type: string | null
          media_url: string | null
          rejection_note: string | null
          release_year: number | null
          season_number: number | null
          series_id: string | null
          status: string
          submitted_at: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string | null
          trailer_url: string | null
          video_url: string | null
          view_count: number
          visibility: string
        }
        Insert: {
          access_level?: string
          approved_at?: string | null
          approved_by?: string | null
          author_id: string
          body?: string | null
          channel_id: string
          content_type?: string | null
          created_at?: string
          duration_min?: number | null
          episode_number?: number | null
          episode_title?: string | null
          genre?: string | null
          id?: string
          is_short?: boolean | null
          media_type?: string | null
          media_url?: string | null
          rejection_note?: string | null
          release_year?: number | null
          season_number?: number | null
          series_id?: string | null
          status?: string
          submitted_at?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string | null
          trailer_url?: string | null
          video_url?: string | null
          view_count?: number
          visibility?: string
        }
        Update: {
          access_level?: string
          approved_at?: string | null
          approved_by?: string | null
          author_id?: string
          body?: string | null
          channel_id?: string
          content_type?: string | null
          created_at?: string
          duration_min?: number | null
          episode_number?: number | null
          episode_title?: string | null
          genre?: string | null
          id?: string
          is_short?: boolean | null
          media_type?: string | null
          media_url?: string | null
          rejection_note?: string | null
          release_year?: number | null
          season_number?: number | null
          series_id?: string | null
          status?: string
          submitted_at?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string | null
          trailer_url?: string | null
          video_url?: string | null
          view_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_posts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_videos: {
        Row: {
          channel_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          rejection_reason: string | null
          status: string
          storage_path: string
          thumbnail_path: string | null
          title: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          status?: string
          storage_path: string
          thumbnail_path?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          status?: string
          storage_path?: string
          thumbnail_path?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_videos_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          approval_expires_at: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_official: boolean
          is_public: boolean
          link: string | null
          media_size: number
          member_count: number
          name: string
          owner_id: string
          post_count: number
          status: string
        }
        Insert: {
          approval_expires_at?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_official?: boolean
          is_public?: boolean
          link?: string | null
          media_size?: number
          member_count?: number
          name: string
          owner_id: string
          post_count?: number
          status?: string
        }
        Update: {
          approval_expires_at?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_official?: boolean
          is_public?: boolean
          link?: string | null
          media_size?: number
          member_count?: number
          name?: string
          owner_id?: string
          post_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_access_grants: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          post_id: string
          reason: string | null
          starts_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          post_id: string
          reason?: string | null
          starts_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          post_id?: string
          reason?: string | null
          starts_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_access_grants_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_access_grants_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "free_post_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_access_grants_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "premium_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_access_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          channel_id: string | null
          created_at: string
          file_id: string | null
          id: string
          moderator_note: string | null
          post_id: string | null
          reason: string
          reported_user_id: string | null
          reporter_id: string
          resolution: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_type: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          file_id?: string | null
          id?: string
          moderator_note?: string | null
          post_id?: string | null
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_type?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          file_id?: string | null
          id?: string
          moderator_note?: string | null
          post_id?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "free_post_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "premium_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_fingerprints: {
        Row: {
          created_at: string | null
          device_id: string
          id: string
          is_debug_build: boolean | null
          is_emulator: boolean | null
          is_rooted: boolean | null
          last_seen: string | null
          manufacturer: string | null
          model: string | null
          os_version: string | null
          platform: string
          risk_score: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          id?: string
          is_debug_build?: boolean | null
          is_emulator?: boolean | null
          is_rooted?: boolean | null
          last_seen?: string | null
          manufacturer?: string | null
          model?: string | null
          os_version?: string | null
          platform: string
          risk_score?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          id?: string
          is_debug_build?: boolean | null
          is_emulator?: boolean | null
          is_rooted?: boolean | null
          last_seen?: string | null
          manufacturer?: string | null
          model?: string | null
          os_version?: string | null
          platform?: string
          risk_score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      files: {
        Row: {
          category: string
          channel_id: string | null
          created_at: string
          id: string
          is_public: boolean
          mime_type: string
          name: string
          size: number
          storage_path: string
          user_id: string
        }
        Insert: {
          category?: string
          channel_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          mime_type?: string
          name: string
          size?: number
          storage_path: string
          user_id: string
        }
        Update: {
          category?: string
          channel_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          mime_type?: string
          name?: string
          size?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      iap_purchases: {
        Row: {
          acknowledged: boolean
          base_plan_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_notification_type: string | null
          package_name: string
          plan_code: string
          platform: string
          product_id: string
          purchase_token: string
          raw_response: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          base_plan_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_notification_type?: string | null
          package_name: string
          plan_code: string
          platform?: string
          product_id: string
          purchase_token: string
          raw_response?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          base_plan_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_notification_type?: string | null
          package_name?: string
          plan_code?: string
          platform?: string
          product_id?: string
          purchase_token?: string
          raw_response?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iap_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_reputation: {
        Row: {
          category: string | null
          id: string
          ip_address: unknown
          is_datacenter: boolean | null
          is_proxy: boolean | null
          is_vpn: boolean | null
          last_checked: string | null
          risk_score: number | null
        }
        Insert: {
          category?: string | null
          id?: string
          ip_address: unknown
          is_datacenter?: boolean | null
          is_proxy?: boolean | null
          is_vpn?: boolean | null
          last_checked?: string | null
          risk_score?: number | null
        }
        Update: {
          category?: string | null
          id?: string
          ip_address?: unknown
          is_datacenter?: boolean | null
          is_proxy?: boolean | null
          is_vpn?: boolean | null
          last_checked?: string | null
          risk_score?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          channel_id: string | null
          created_at: string
          id: string
          post_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          channel_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          channel_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "free_post_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "premium_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          amount_inr: number
          created_at: string
          duration_days: number
          entitlement_expires_at: string | null
          external_transaction_token: string | null
          failure_reason: string | null
          google_report_error: string | null
          google_reported_at: string | null
          id: string
          meta_device: Json | null
          meta_error: string | null
          meta_sent_at: string | null
          method: string
          paid_at: string | null
          plan_code: string
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          raw: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          amount_inr: number
          created_at?: string
          duration_days: number
          entitlement_expires_at?: string | null
          external_transaction_token?: string | null
          failure_reason?: string | null
          google_report_error?: string | null
          google_reported_at?: string | null
          id?: string
          meta_device?: Json | null
          meta_error?: string | null
          meta_sent_at?: string | null
          method: string
          paid_at?: string | null
          plan_code: string
          provider: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
          user_id?: string | null
        }
        Update: {
          amount_inr?: number
          created_at?: string
          duration_days?: number
          entitlement_expires_at?: string | null
          external_transaction_token?: string | null
          failure_reason?: string | null
          google_report_error?: string | null
          google_reported_at?: string | null
          id?: string
          meta_device?: Json | null
          meta_error?: string | null
          meta_sent_at?: string | null
          method?: string
          paid_at?: string | null
          plan_code?: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      persona_sessions: {
        Row: {
          created_at: string | null
          device_binding_hash: string
          device_id: string
          expires_at: string
          id: string
          is_valid: boolean | null
          last_rotated: string | null
          rotation_count: number | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_binding_hash: string
          device_id: string
          expires_at: string
          id?: string
          is_valid?: boolean | null
          last_rotated?: string | null
          rotation_count?: number | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_binding_hash?: string
          device_id?: string
          expires_at?: string
          id?: string
          is_valid?: boolean | null
          last_rotated?: string | null
          rotation_count?: number | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      post_view_log: {
        Row: {
          day: string
          post_id: string
          user_id: string
        }
        Insert: {
          day?: string
          post_id: string
          user_id: string
        }
        Update: {
          day?: string
          post_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          adult_confirmed_at: string | null
          approval_note: string | null
          approval_reviewed_at: string | null
          approval_reviewed_by: string | null
          approval_status: string
          auto_backup: boolean | null
          avatar_url: string | null
          birth_year: number | null
          can_upload_content: boolean
          community_guidelines_version: string | null
          created_at: string
          creator_status: string
          email: string
          fcm_token: string | null
          full_name: string | null
          iap_product_id: string | null
          iap_purchase_token: string | null
          id: string
          is_admin: boolean
          is_guest: boolean
          notifications_enabled: boolean | null
          plan: string
          plan_cancelled_at: string | null
          plan_expires_at: string | null
          plan_started_at: string | null
          plan_status: string
          privacy_version: string | null
          role: string
          storage_limit: number
          storage_used: number
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          username: string | null
          wifi_only: boolean | null
        }
        Insert: {
          account_status?: string
          adult_confirmed_at?: string | null
          approval_note?: string | null
          approval_reviewed_at?: string | null
          approval_reviewed_by?: string | null
          approval_status?: string
          auto_backup?: boolean | null
          avatar_url?: string | null
          birth_year?: number | null
          can_upload_content?: boolean
          community_guidelines_version?: string | null
          created_at?: string
          creator_status?: string
          email: string
          fcm_token?: string | null
          full_name?: string | null
          iap_product_id?: string | null
          iap_purchase_token?: string | null
          id: string
          is_admin?: boolean
          is_guest?: boolean
          notifications_enabled?: boolean | null
          plan?: string
          plan_cancelled_at?: string | null
          plan_expires_at?: string | null
          plan_started_at?: string | null
          plan_status?: string
          privacy_version?: string | null
          role?: string
          storage_limit?: number
          storage_used?: number
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          username?: string | null
          wifi_only?: boolean | null
        }
        Update: {
          account_status?: string
          adult_confirmed_at?: string | null
          approval_note?: string | null
          approval_reviewed_at?: string | null
          approval_reviewed_by?: string | null
          approval_status?: string
          auto_backup?: boolean | null
          avatar_url?: string | null
          birth_year?: number | null
          can_upload_content?: boolean
          community_guidelines_version?: string | null
          created_at?: string
          creator_status?: string
          email?: string
          fcm_token?: string | null
          full_name?: string | null
          iap_product_id?: string | null
          iap_purchase_token?: string | null
          id?: string
          is_admin?: boolean
          is_guest?: boolean
          notifications_enabled?: boolean | null
          plan?: string
          plan_cancelled_at?: string | null
          plan_expires_at?: string | null
          plan_started_at?: string | null
          plan_status?: string
          privacy_version?: string | null
          role?: string
          storage_limit?: number
          storage_used?: number
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          username?: string | null
          wifi_only?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_approval_reviewed_by_fkey"
            columns: ["approval_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string | null
          details: Json | null
          device_id: string | null
          event_type: string
          id: string
          ip_address: unknown
          reason: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          device_id?: string | null
          event_type: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          device_id?: string | null
          event_type?: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      series: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          channel_id: string
          created_at: string
          description: string | null
          genre: string | null
          id: string
          owner_id: string
          rejection_note: string | null
          release_year: number | null
          status: string
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          channel_id: string
          created_at?: string
          description?: string | null
          genre?: string | null
          id?: string
          owner_id: string
          rejection_note?: string | null
          release_year?: number | null
          status?: string
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          channel_id?: string
          created_at?: string
          description?: string | null
          genre?: string | null
          id?: string
          owner_id?: string
          rejection_note?: string | null
          release_year?: number | null
          status?: string
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_videos: {
        Row: {
          context: string
          created_at: string
          id: string
          post_id: string | null
          signed_locked: boolean
          stream_uid: string
          user_id: string
        }
        Insert: {
          context: string
          created_at?: string
          id?: string
          post_id?: string | null
          signed_locked?: boolean
          stream_uid: string
          user_id: string
        }
        Update: {
          context?: string
          created_at?: string
          id?: string
          post_id?: string | null
          signed_locked?: boolean
          stream_uid?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_videos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_videos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "free_post_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_videos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "premium_preview"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          description: string
          duration_days: number
          iap_product_id: string | null
          id: string
          is_active: boolean
          is_popular: boolean
          name: string
          price_inr: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          duration_days: number
          iap_product_id?: string | null
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name: string
          price_inr: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          duration_days?: number
          iap_product_id?: string | null
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name?: string
          price_inr?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscription_requests: {
        Row: {
          amount_inr: number
          created_at: string
          id: string
          plan_code: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_path: string | null
          status: string
          updated_at: string
          upi_transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount_inr: number
          created_at?: string
          id?: string
          plan_code: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          status?: string
          updated_at?: string
          upi_transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount_inr?: number
          created_at?: string
          id?: string
          plan_code?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          status?: string
          updated_at?: string
          upi_transaction_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subtitles: {
        Row: {
          created_at: string | null
          file_url: string
          id: string
          language: string
          video_id: string
        }
        Insert: {
          created_at?: string | null
          file_url: string
          id?: string
          language: string
          video_id: string
        }
        Update: {
          created_at?: string | null
          file_url?: string
          id?: string
          language?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtitles_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtitles_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "free_post_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtitles_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "premium_preview"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          id: string
          progress: number
          status: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number
          id?: string
          progress?: number
          status?: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          progress?: number
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_rate_limit_log: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          app_version: string | null
          device_id: string
          first_seen_at: string
          id: string
          last_seen_at: string
          model: string | null
          platform: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          device_id: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          model?: string | null
          platform?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          device_id?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          model?: string | null
          platform?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_install_source: {
        Row: {
          created_at: string | null
          id: string
          install_source:
            | Database["public"]["Enums"]["install_source_type"]
            | null
          referrer: string | null
          user_id: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          install_source?:
            | Database["public"]["Enums"]["install_source_type"]
            | null
          referrer?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          install_source?:
            | Database["public"]["Enums"]["install_source_type"]
            | null
          referrer?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      user_personas: {
        Row: {
          activated_at: string | null
          activation_time: string | null
          admin_approved_at: string | null
          admin_approved_by: string | null
          created_at: string | null
          id: string
          is_full_access_granted: boolean | null
          last_verified: string | null
          needs_admin_approval: boolean | null
          persona: Database["public"]["Enums"]["persona_type"]
          risk_score: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          activation_time?: string | null
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          created_at?: string | null
          id?: string
          is_full_access_granted?: boolean | null
          last_verified?: string | null
          needs_admin_approval?: boolean | null
          persona: Database["public"]["Enums"]["persona_type"]
          risk_score?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activated_at?: string | null
          activation_time?: string | null
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          created_at?: string | null
          id?: string
          is_full_access_granted?: boolean | null
          last_verified?: string | null
          needs_admin_approval?: boolean | null
          persona?: Database["public"]["Enums"]["persona_type"]
          risk_score?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          auto_play_next_episode: boolean | null
          created_at: string | null
          default_quality: string | null
          default_speed: number | null
          default_subtitle_language: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_play_next_episode?: boolean | null
          created_at?: string | null
          default_quality?: string | null
          default_speed?: number | null
          default_subtitle_language?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_play_next_episode?: boolean | null
          created_at?: string | null
          default_quality?: string | null
          default_speed?: number | null
          default_subtitle_language?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      watch_history: {
        Row: {
          completed: boolean
          duration_seconds: number
          id: string
          last_watched_at: string
          position_seconds: number
          post_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          duration_seconds?: number
          id?: string
          last_watched_at?: string
          position_seconds?: number
          post_id: string
          user_id: string
        }
        Update: {
          completed?: boolean
          duration_seconds?: number
          id?: string
          last_watched_at?: string
          position_seconds?: number
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "free_post_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "premium_preview"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      free_post_media: {
        Row: {
          id: string | null
          media_type: string | null
          media_url: string | null
          video_url: string | null
        }
        Relationships: []
      }
      premium_preview: {
        Row: {
          access_level: string | null
          author_id: string | null
          body: string | null
          channel_id: string | null
          content_type: string | null
          created_at: string | null
          duration_min: number | null
          episode_number: number | null
          episode_title: string | null
          genre: string | null
          id: string | null
          is_short: boolean | null
          media_type: string | null
          release_year: number | null
          season_number: number | null
          series_id: string | null
          status: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string | null
          view_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_terms: {
        Args: {
          p_community_guidelines_version: string
          p_privacy_version: string
          p_terms_version: string
        }
        Returns: undefined
      }
      activate_approved_channels: { Args: never; Returns: undefined }
      admin_broadcast: {
        Args: { p_audience?: string; p_body: string; p_title: string }
        Returns: number
      }
      admin_clear_signed_lock: {
        Args: { p_stream_uid: string }
        Returns: undefined
      }
      admin_get_post_grantees: {
        Args: { p_post_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          full_name: string
          grant_id: string
          granted_by: string
          granted_by_email: string
          reason: string
          starts_at: string
          status: string
          user_id: string
        }[]
      }
      admin_get_profiles_by_ids: {
        Args: { p_ids: string[] }
        Returns: {
          email: string
          full_name: string
          id: string
          username: string
        }[]
      }
      admin_get_user: { Args: { p_user_id: string }; Returns: Json }
      admin_get_user_grants: {
        Args: { p_user_id: string }
        Returns: {
          access_level: string
          created_at: string
          expires_at: string
          grant_id: string
          post_id: string
          post_title: string
          reason: string
          starts_at: string
          status: string
        }[]
      }
      admin_grant_content_access: {
        Args: {
          p_expires_at?: string
          p_post_id: string
          p_reason?: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_list_audit_log: {
        Args: { p_limit?: number; p_target_type?: string }
        Returns: {
          action: string
          admin_email: string
          admin_id: string
          admin_name: string
          created_at: string
          id: string
          metadata: Json
          target_id: string
          target_type: string
        }[]
      }
      admin_list_channel_activity: {
        Args: never
        Returns: {
          id: string
          last_upload_at: string
          member_count: number
          name: string
          owner_name: string
          pending_content_count: number
          status: string
          total_content_count: number
        }[]
      }
      admin_list_payments: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          amount_inr: number
          created_at: string
          email: string
          failure_reason: string
          full_name: string
          google_report_needed: boolean
          google_reported: boolean
          id: string
          method: string
          paid_at: string
          plan_code: string
          provider: string
          provider_payment_id: string
          status: string
        }[]
      }
      admin_list_pending_content: {
        Args: never
        Returns: {
          channel_name: string
          content_type: string
          created_at: string
          id: string
          owner_name: string
          title: string
        }[]
      }
      admin_list_plans: {
        Args: never
        Returns: {
          code: string
          created_at: string
          description: string
          duration_days: number
          iap_product_id: string | null
          id: string
          is_active: boolean
          is_popular: boolean
          name: string
          price_inr: number
          sort_order: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "subscription_plans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_subscribers: {
        Args: { p_cohort?: string; p_limit?: number; p_query?: string }
        Returns: {
          account_status: string
          created_at: string
          device_count: number
          email: string
          full_name: string
          id: string
          plan_expires_at: string
          plan_started_at: string
          plan_status: string
        }[]
      }
      admin_list_user_approvals: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          approval_note: string
          approval_reviewed_at: string
          approval_status: string
          created_at: string
          device_count: number
          email: string
          full_name: string
          id: string
          username: string
        }[]
      }
      admin_list_user_devices: {
        Args: { p_user_id: string }
        Returns: {
          app_version: string
          device_id: string
          first_seen_at: string
          last_seen_at: string
          model: string
          platform: string
        }[]
      }
      admin_replace_post_video: {
        Args: { p_new_uid: string; p_post_id: string }
        Returns: undefined
      }
      admin_resolve_report: {
        Args: {
          p_action: string
          p_moderator_note?: string
          p_report_id: string
          p_resolution: string
        }
        Returns: undefined
      }
      admin_revoke_content_access: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: undefined
      }
      admin_search_users: {
        Args: { p_limit?: number; p_query?: string }
        Returns: {
          account_status: string
          approval_status: string
          created_at: string
          email: string
          full_name: string
          id: string
          plan_expires_at: string
          plan_status: string
        }[]
      }
      admin_set_channel_status: {
        Args: { p_channel_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      admin_set_post_access_level: {
        Args: { p_access_level: string; p_post_id: string }
        Returns: undefined
      }
      admin_set_post_status: {
        Args: { p_post_id: string; p_status: string }
        Returns: undefined
      }
      admin_set_signed_lock: {
        Args: { p_stream_uid: string }
        Returns: undefined
      }
      admin_set_user_approval: {
        Args: { p_note?: string; p_status: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_user_flags: {
        Args: {
          p_account_status?: string
          p_can_upload?: boolean
          p_is_admin?: boolean
          p_reason?: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_set_user_plan: {
        Args: {
          p_action: string
          p_days?: number
          p_expires_at?: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_subscriber_counts: {
        Args: never
        Returns: {
          active_count: number
          cancelled_count: number
          expired_count: number
          expiring_count: number
        }[]
      }
      admin_update_channel: {
        Args: {
          p_category: string
          p_channel_id: string
          p_description: string
          p_is_official: boolean
          p_is_public: boolean
          p_name: string
        }
        Returns: undefined
      }
      admin_update_plan: {
        Args: {
          p_code: string
          p_description: string
          p_duration_days: number
          p_is_active: boolean
          p_is_popular: boolean
          p_name: string
          p_price_inr: number
        }
        Returns: undefined
      }
      admin_update_post: {
        Args: {
          p_body?: string
          p_clear_fields?: string[]
          p_duration_min?: number
          p_episode_number?: number
          p_episode_title?: string
          p_genre?: string
          p_post_id: string
          p_release_year?: number
          p_season_number?: number
          p_thumbnail_url?: string
          p_title?: string
        }
        Returns: undefined
      }
      apply_play_entitlement: {
        Args: { p_expires_at: string; p_plan_status: string; p_user_id: string }
        Returns: undefined
      }
      approve_channel_content: {
        Args: { content_id: string }
        Returns: undefined
      }
      approve_post: { Args: { p_post_id: string }; Returns: undefined }
      can_create_ugc: { Args: { p_user_id: string }; Returns: boolean }
      can_post_to_channel: { Args: { p_channel_id: string }; Returns: boolean }
      cloudlynk_is_trusted_writer: { Args: never; Returns: boolean }
      confirm_adult: { Args: never; Returns: undefined }
      current_policy_versions: {
        Args: never
        Returns: {
          community_guidelines_version: string
          privacy_version: string
          terms_version: string
        }[]
      }
      decrement_storage_used: {
        Args: { p_bytes: number; p_user_id: string }
        Returns: undefined
      }
      delete_channel: { Args: { p_channel_id: string }; Returns: undefined }
      demo_reset: { Args: never; Returns: Json }
      expire_lapsed_plans: {
        Args: never
        Returns: {
          expired_count: number
        }[]
      }
      export_my_data: { Args: never; Returns: Json }
      get_my_channel_posts: {
        Args: { p_status?: string }
        Returns: {
          approved_at: string
          channel_id: string
          channel_name: string
          content_type: string
          created_at: string
          id: string
          rejection_note: string
          status: string
          thumbnail_url: string
          title: string
          video_url: string
        }[]
      }
      get_my_subscription_status: {
        Args: never
        Returns: {
          latest_request_amount_inr: number
          latest_request_created_at: string
          latest_request_id: string
          latest_request_plan_code: string
          latest_request_rejection_reason: string
          latest_request_reviewed_at: string
          latest_request_screenshot_path: string
          latest_request_status: string
          plan_expires_at: string
          plan_started_at: string
          plan_status: string
        }[]
      }
      grant_gateway_payment: {
        Args: {
          p_order_id: string
          p_provider_payment_id: string
          p_raw?: Json
        }
        Returns: string
      }
      has_content_access: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: boolean
      }
      has_public_approved_post: {
        Args: { p_author_id: string }
        Returns: boolean
      }
      increment_channel_members: {
        Args: { p_channel_id: string }
        Returns: undefined
      }
      increment_storage_used: {
        Args: { p_bytes: number; p_user_id: string }
        Returns: undefined
      }
      is_activated: { Args: { user_id: string }; Returns: boolean }
      is_active_admin: { Args: never; Returns: boolean }
      is_guest: { Args: never; Returns: boolean }
      is_owner_or_admin: { Args: { p_channel_id: string }; Returns: boolean }
      is_plan_active: { Args: { p_user_id: string }; Returns: boolean }
      is_profile_active: { Args: { p_user_id: string }; Returns: boolean }
      is_reviewer_ip: { Args: { check_ip: unknown }; Returns: boolean }
      is_user_approved: { Args: { p_user_id: string }; Returns: boolean }
      join_channel: { Args: { p_channel_id: string }; Returns: undefined }
      leave_channel: { Args: { p_channel_id: string }; Returns: undefined }
      mark_activation_needed: { Args: { user_id: string }; Returns: undefined }
      notify_expiring_plans: {
        Args: { p_days_ahead?: number }
        Returns: {
          notified_count: number
        }[]
      }
      prune_abandoned_guests: { Args: never; Returns: number }
      record_device: {
        Args: {
          p_app_version?: string
          p_device_id: string
          p_model?: string
          p_platform?: string
        }
        Returns: undefined
      }
      record_post_view: { Args: { p_post_id: string }; Returns: undefined }
      reject_channel_content: {
        Args: { content_id: string; reason?: string }
        Returns: undefined
      }
      reject_post: {
        Args: { p_post_id: string; p_reason?: string }
        Returns: undefined
      }
      set_birth_year: { Args: { p_birth_year: number }; Returns: undefined }
      update_channel: {
        Args: { p_channel_id: string; p_description: string; p_name: string }
        Returns: Json
      }
      user_files_bytes: { Args: { p_user: string }; Returns: number }
      user_files_owner: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      install_source_type: "playstore" | "ads" | "referral" | "unknown"
      persona_type: "organic" | "inorganic" | "reviewer"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      install_source_type: ["playstore", "ads", "referral", "unknown"],
      persona_type: ["organic", "inorganic", "reviewer"],
    },
  },
} as const
