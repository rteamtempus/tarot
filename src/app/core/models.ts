// Domain types mirroring the `tarot_*` schema (see supabase/migrations/0001).
// Only the fields the client needs are typed; extend as features land.

export type Arcana = 'major' | 'minor';
export type Suit = 'wands' | 'cups' | 'swords' | 'pentacles';
export type Court = 'page' | 'knight' | 'queen' | 'king';
export type Orientation = 'upright' | 'reversed';
export type ReadingType = 'spread' | 'daily' | 'practice';
export type AnalysisMode = 'reading' | 'study';
export type ReadingSource = 'manual' | 'photo' | 'draw';

export interface TarotProfile {
  id: string;
  display_name: string | null;
  use_reversals: boolean;
  default_deck_id: string | null;
  default_set_id: string | null;
  default_spread_id: string | null;
}

export interface TarotCard {
  id: string;
  name: string;
  arcana: Arcana;
  suit: Suit | null;
  number: number | null;
  court: Court | null;
  element: string | null;
  core_keywords: string[];
  sort_order: number;
}

export interface TarotInterpretation {
  id: string;
  set_id: string;
  card_id: string;
  upright_text: string | null;
  upright_keywords: string[];
  reversed_text: string | null;
  reversed_keywords: string[];
}

export interface TarotSpread {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  is_public: boolean;
  is_builtin: boolean;
}

export interface TarotSpreadPosition {
  id: string;
  spread_id: string;
  position_index: number;
  label: string;
  meaning: string | null;
  reading_order: number;
  x: number;
  y: number;
  rotation_deg: number;
  z_index: number;
  card_count: number;
}
