export type RaceCategory = "Individual" | "Team" | string;

export interface RawResult {
  Rank: number;
  Bib: number;
  Name: string;
  Category: RaceCategory;
  Gender: number;
  Nation: string;
  AgeGroup: number;
  Distance: string;
  Laps: string;
  LastLapTime: string;
  LastSeen: string;
  LastSeenTOD: string;
  TotalTime: string;
}

export interface Result extends RawResult {
  laps: number;
  distanceMiles: number;
  totalTimeSec: number;
  lastLapSec: number;
  avgLapSec: number;
}

export interface ResultsPayload {
  fetchedAt: string;
  source: "live" | "sample";
  count: number;
  results: Result[];
}
