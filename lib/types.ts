export type RaceCategory = "Individual" | "Team" | string;
export type FeedKey = "overall" | "men" | "women" | "teams";

export interface RawResult {
  Rank: number;
  Bib: number;
  Name: string;
  Category?: RaceCategory;
  Overall?: number;
  Gender: number;
  Nation: string;
  AgeGroup: number | string;
  Distance: string;
  Laps: string;
  LastLapTime: string;
  LastSeen: string;
  LastSeenTOD: string;
  TotalTime: string;
  Diff?: string;
}

export interface Result extends RawResult {
  laps: number;
  distanceMiles: number;
  totalTimeSec: number;
  lastLapSec: number;
  avgLapSec: number;
  diffMiles: number | null;
}

export interface ResultsPayload {
  feed: FeedKey;
  fetchedAt: string;
  source: "live" | "sample";
  count: number;
  results: Result[];
}
