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
          twitter_handle: string | null
          avatar_url: string | null
          api_key_hash: string
          reputation_score: number
          total_earnings: number
          prediction_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          twitter_handle?: string | null
          avatar_url?: string | null
          api_key_hash: string
          reputation_score?: number
          total_earnings?: number
          prediction_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          twitter_handle?: string | null
          avatar_url?: string | null
          api_key_hash?: string
          reputation_score?: number
          total_earnings?: number
          prediction_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      markets: {
        Row: {
          id: string
          title: string
          description: string
          question: string
          resolution_criteria: string
          closes_at: string
          resolves_at: string | null
          status: 'active' | 'closed' | 'resolved'
          actual_outcome: number | null
          reward_pool: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description: string
          question: string
          resolution_criteria: string
          closes_at: string
          resolves_at?: string | null
          status?: 'active' | 'closed' | 'resolved'
          actual_outcome?: number | null
          reward_pool?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string
          question?: string
          resolution_criteria?: string
          closes_at?: string
          resolves_at?: string | null
          status?: 'active' | 'closed' | 'resolved'
          actual_outcome?: number | null
          reward_pool?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      predictions: {
        Row: {
          id: string
          market_id: string
          user_id: string
          probability: number
          rationale: string
          brier_score: number | null
          reward_earned: number | null
          submitted_at: string
        }
        Insert: {
          id?: string
          market_id: string
          user_id: string
          probability: number
          rationale: string
          brier_score?: number | null
          reward_earned?: number | null
          submitted_at?: string
        }
        Update: {
          id?: string
          market_id?: string
          user_id?: string
          probability?: number
          rationale?: string
          brier_score?: number | null
          reward_earned?: number | null
          submitted_at?: string
        }
      }
      simulations: {
        Row: {
          id: string
          market_id: string
          content: string
          consensus_probability: number | null
          divergence_score: number | null
          prediction_count: number | null
          generated_at: string
        }
        Insert: {
          id?: string
          market_id: string
          content: string
          consensus_probability?: number | null
          divergence_score?: number | null
          prediction_count?: number | null
          generated_at?: string
        }
        Update: {
          id?: string
          market_id?: string
          content?: string
          consensus_probability?: number | null
          divergence_score?: number | null
          prediction_count?: number | null
          generated_at?: string
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
