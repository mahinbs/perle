export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          password_hash: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name: string
          password_hash: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          password_hash?: string
          created_at?: string
          updated_at?: string
        }
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          token: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token?: string
          expires_at?: string
          created_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          user_id: string
          notifications: boolean
          dark_mode: boolean
          search_history: boolean
          voice_search: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          notifications?: boolean
          dark_mode?: boolean
          search_history?: boolean
          voice_search?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          notifications?: boolean
          dark_mode?: boolean
          search_history?: boolean
          voice_search?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      search_history: {
        Row: {
          id: string
          user_id: string | null
          query: string
          mode: string
          timestamp: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          query: string
          mode: string
          timestamp?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          query?: string
          mode?: string
          timestamp?: string
          created_at?: string
        }
      }
      library_items: {
        Row: {
          id: string
          user_id: string
          title: string
          content: string
          source: string
          url: string | null
          date: string
          is_bookmarked: boolean
          tags: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          content: string
          source: string
          url?: string | null
          date: string
          is_bookmarked?: boolean
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          content?: string
          source?: string
          url?: string | null
          date?: string
          is_bookmarked?: boolean
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

