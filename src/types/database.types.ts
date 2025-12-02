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
      profiles: {
        Row: {
          id: string
          username: string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      houses: {
        Row: {
          id: string
          name: string
          address: string
          invite_code: string
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          name: string
          address: string
          invite_code: string
          created_at?: string
          created_by: string
        }
        Update: {
          id?: string
          name?: string
          address?: string
          invite_code?: string
          created_at?: string
          created_by?: string
        }
      }
      house_members: {
        Row: {
          id: string
          house_id: string
          user_id: string
          is_admin: boolean
          joined_at: string
        }
        Insert: {
          id?: string
          house_id: string
          user_id: string
          is_admin?: boolean
          joined_at?: string
        }
        Update: {
          id?: string
          house_id?: string
          user_id?: string
          is_admin?: boolean
          joined_at?: string
        }
      }
      expenses: {
        Row: {
          id: string
          house_id: string
          created_by: string
          title: string
          amount: number
          is_recurring: boolean
          recurrence_period: string | null
          split_with: string[]
          created_at: string
          due_date: string | null
        }
        Insert: {
          id?: string
          house_id: string
          created_by: string
          title: string
          amount: number
          is_recurring?: boolean
          recurrence_period?: string | null
          split_with: string[]
          created_at?: string
          due_date?: string | null
        }
        Update: {
          id?: string
          house_id?: string
          created_by?: string
          title?: string
          amount?: number
          is_recurring?: boolean
          recurrence_period?: string | null
          split_with?: string[]
          created_at?: string
          due_date?: string | null
        }
      }
      expense_payments: {
        Row: {
          id: string
          expense_id: string
          user_id: string
          amount: number
          paid: boolean
          paid_at: string | null
        }
        Insert: {
          id?: string
          expense_id: string
          user_id: string
          amount: number
          paid?: boolean
          paid_at?: string | null
        }
        Update: {
          id?: string
          expense_id?: string
          user_id?: string
          amount?: number
          paid?: boolean
          paid_at?: string | null
        }
      }
      notes: {
        Row: {
          id: string
          house_id: string
          created_by: string
          title: string
          content: string
          category: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          house_id: string
          created_by: string
          title: string
          content: string
          category?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          house_id?: string
          created_by?: string
          title?: string
          content?: string
          category?: string
          created_at?: string
          updated_at?: string
        }
      }
      member_presence: {
        Row: {
          id: string
          user_id: string
          house_id: string
          is_home: boolean
          last_updated: string
        }
        Insert: {
          id?: string
          user_id: string
          house_id: string
          is_home?: boolean
          last_updated?: string
        }
        Update: {
          id?: string
          user_id?: string
          house_id?: string
          is_home?: boolean
          last_updated?: string
        }
      }
    }
  }
}
