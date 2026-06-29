export type SettlementWinner = "hero" | "opponent" | null;
export type SettlementStatus = "awarded" | "showdown" | "split";

export interface SettlementSummary {
  detail: string;
  headline: string;
  heroAfterBb: number;
  heroBeforeBb: number;
  opponentAfterBb: number;
  opponentBeforeBb: number;
  potBb: number;
  status: SettlementStatus;
  winner: SettlementWinner;
}

export function formatBb(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}bb`;
}

export function roundBb(value: number): number {
  return Math.round(value * 10) / 10;
}
