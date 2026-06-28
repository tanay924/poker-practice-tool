export type AnalysisStatus = "queued" | "solving" | "ready" | "failed" | "unsupported";

export interface ActionEntry {
  street: "preflop" | "flop" | "turn" | "river";
  actor: "SB" | "BB" | "hero" | "villain";
  action: string;
  amount_bb: number;
  target_amount_bb?: number;
  pot_after: number;
  node: string;
  spot_id?: string;
  hand_key?: string;
  frequency?: number;
  automatic?: boolean;
}

export interface HandCreate {
  hero_position: string;
  villain_position: string;
  hero_cards: string;
  villain_cards: string;
  board_json: string[];
  stack_bb: number;
  pot: number;
  action_history_json: ActionEntry[];
  result_json: Record<string, unknown>;
}

export interface HandRead extends HandCreate {
  id: number;
  created_at: string;
}

export interface AnalysisJob {
  id: number;
  hand_id: number;
  status: AnalysisStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  solver_input_json: Record<string, unknown> | null;
  solver_output_json: SolverOutput | null;
}

export interface AnalysisListItem {
  job_id: number;
  hand_id: number;
  created_at: string;
  hero_hand: string;
  board: string[];
  status: AnalysisStatus;
  error: string | null;
}

export interface SolverStreetResult {
  street: "flop" | "turn" | "river";
  node: string;
  hero_hand: string;
  board: string[];
  solver_strategy: Record<string, number>;
  hero_action: string;
  best_action: string;
  verdict: string;
  confidence: string;
}

export interface PreflopResult {
  actor: string;
  correct: boolean;
  hand_key: string;
  hero_action: string;
  node: string;
  options: Record<string, number>;
  selected_frequency: number;
  spot_id: string;
  spot_name: string;
  street: "preflop";
}

export interface SolverOutput {
  metadata?: {
    solver?: {
      name: string;
      version?: string;
      commit?: string;
    };
    config?: Record<string, unknown>;
    range_hashes?: Record<string, string>;
    duration_seconds?: number;
    cache?: {
      hit: boolean;
    };
  };
  preflop_results?: PreflopResult[];
  preflop_summary?: {
    overall: string;
    blocks_postflop: boolean;
    decision_count: number;
    correct_count: number;
  };
  postflop_status?: string;
  postflop_error?: string;
  street_results: SolverStreetResult[];
  summary: {
    overall: string;
    largest_mistake: {
      street: string;
      node: string;
      hero_action: string;
      best_action: string;
    } | null;
  };
}

export interface AnalysisDetail {
  hand: HandRead;
  job: AnalysisJob | null;
}

export interface PreflopRange {
  id: number;
  name: string;
  spot: string;
  stack_bb: number;
  source: string;
  range_json: {
    name: string;
    spot: string;
    stack_bb: number;
    actions: Record<string, Record<string, number>>;
  };
  created_at: string;
}
