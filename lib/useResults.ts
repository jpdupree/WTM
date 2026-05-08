"use client";
import useSWR from "swr";
import type { ResultsPayload } from "./types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useResults(refreshMs = 30_000) {
  return useSWR<ResultsPayload>("/api/results", fetcher, {
    refreshInterval: refreshMs,
    revalidateOnFocus: false,
  });
}
