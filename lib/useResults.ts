"use client";
import useSWR from "swr";
import type { FeedKey, ResultsPayload } from "./types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useResults(feed: FeedKey = "overall", refreshMs = 30_000) {
  return useSWR<ResultsPayload>(`/api/results?feed=${feed}`, fetcher, {
    refreshInterval: refreshMs,
    revalidateOnFocus: false,
  });
}
