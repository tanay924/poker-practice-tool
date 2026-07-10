export type AnalysisStatus = "queued" | "solving" | "ready" | "failed" | "unsupported" | "cancelled";

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
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  cancel_requested_at: string | null;
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

export interface AnalysisPage {
  items: AnalysisListItem[];
  next_cursor: string | null;
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
  details?: DecisionDetails;
}

export interface PotOddsDetails {
  available: boolean;
  reason?: string;
  call_amount_bb?: number;
  pot_before_call_bb?: number;
  pot_if_call_bb?: number;
  required_equity?: number;
}

export interface EquityDetails {
  available: boolean;
  source: string;
  hero: number | null;
  villain: number | null;
  note?: string;
  hero_wins?: number;
  villain_wins?: number;
  ties?: number;
  total_runouts?: number;
}

export interface DecisionDetails {
  pot_odds?: PotOddsDetails;
  equity?: EquityDetails;
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

export interface ProfileRead {
  user_id: string;
  username: string;
}

export interface AccountExport {
  exported_at: string;
  profile: ProfileRead | null;
  hands: Array<Record<string, unknown>>;
  analysis_jobs: Array<Record<string, unknown>>;
  friend_requests: Array<Record<string, unknown>>;
  friendships: Array<Record<string, unknown>>;
  shared_hands: Array<Record<string, unknown>>;
}

export interface AccountDeletion {
  deleted_hands: number;
  deleted_analysis_jobs: number;
  deleted_study_spots: number;
  deleted_shared_hands: number;
  deleted_social_rows: number;
  external_auth_deleted: boolean;
  message: string;
}

export interface AnalysisControl {
  enabled: boolean;
  message: string;
  updated_at: string;
}

export interface GuestSessionAllowance {
  expires_at: string;
  analysis_remaining: number;
  preflop_remaining: number;
}

export interface FriendRequestRead {
  id: number;
  requester_username: string;
  recipient_username: string;
  status: string;
  created_at: string;
}

export interface FriendRead {
  user_id: string;
  username: string;
}

export interface BlockRead {
  user_id: string;
  username: string;
  created_at: string;
}

export interface ReportRead {
  id: number;
  reporter_user_id: string;
  reported_user_id: string | null;
  shared_hand_id: number | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

export interface NotificationCounts {
  pending_friend_requests: number;
  unread_shared_hands: number;
}

export interface SharedHandRead {
  id: number;
  hand_id: number;
  owner_username: string;
  hero_hand: string;
  board: string[];
  status: AnalysisStatus | null;
  created_at: string;
  read_at: string | null;
}

export interface StatsOverview {
  hands_played: number;
}

export interface StatsAnalyzed {
  hands_analyzed: number;
  sample_size: number;
  preflop_decisions_reviewed: number;
  preflop_correct: number;
  preflop_accuracy: number | null;
  postflop_decisions_reviewed: number;
  postflop_mistakes: number;
  biggest_leak: string;
}

export interface StatsAccuracyRow {
  label: string;
  decisions: number;
  correct: number;
  accuracy: number | null;
}

export interface StatsMistakeRow {
  label: string;
  decisions: number;
  mistakes: number;
}

export interface StatsCountRow {
  label: string;
  count: number;
}

export interface StatsRecent {
  hands_played_7d: number;
  hands_analyzed_7d: number;
  hands_played_30d: number;
  hands_analyzed_30d: number;
  preflop_accuracy_30d: number | null;
}

export interface StudyRecommendation {
  label: string;
  detail: string;
  to: string;
}

export interface MyStats {
  overall: StatsOverview;
  analyzed: StatsAnalyzed;
  preflop_by_position: StatsAccuracyRow[];
  preflop_by_spot: StatsAccuracyRow[];
  preflop_mistake_types: StatsCountRow[];
  postflop_by_street: StatsMistakeRow[];
  postflop_by_action: StatsMistakeRow[];
  postflop_by_situation: StatsMistakeRow[];
  recent: StatsRecent;
  recommendations: StudyRecommendation[];
}

export interface StudySpotRead {
  street: string;
  node: string;
  hero_hand: string;
  board: string[];
  line: string[];
  tags: string[];
  hero_action: string;
  best_action: string;
  verdict: string;
  confidence: string | null;
  solver_strategy: Record<string, number>;
}

export interface StudySpotSourceRead {
  street: string;
  node: string;
  tags: string[];
}

export interface SimilarStudySpots {
  source: StudySpotSourceRead;
  spots: StudySpotRead[];
}

export interface PreflopRange {
  id: number;
  name: string;
  spot: string;
  stack_bb: number;
  source: string;
  version: string;
  provenance: string;
  range_json: {
    name: string;
    spot: string;
    stack_bb: number;
    actions: Record<string, Record<string, number>>;
  };
  created_at: string;
}
