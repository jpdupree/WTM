import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { enrich } from "@/lib/format";
import type { RawResult, ResultsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE_SECONDS = Number(process.env.RACE_CACHE_SECONDS ?? 15);

let cache: { at: number; payload: ResultsPayload } | null = null;

async function loadSample(): Promise<RawResult[]> {
  const file = path.join(process.cwd(), "data", "sample.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as RawResult[];
}

async function fetchUpstream(url: string): Promise<RawResult[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  const data = (await res.json()) as RawResult[];
  if (!Array.isArray(data)) throw new Error("Unexpected payload shape");
  return data;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_SECONDS * 1000) {
    return NextResponse.json(cache.payload);
  }

  const url = process.env.RACE_RESULTS_URL;
  let raw: RawResult[];
  let source: "live" | "sample" = "sample";
  let error: string | undefined;

  if (url) {
    try {
      raw = await fetchUpstream(url);
      source = "live";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      raw = await loadSample();
    }
  } else {
    raw = await loadSample();
  }

  const payload: ResultsPayload = {
    fetchedAt: new Date().toISOString(),
    source,
    count: raw.length,
    results: raw.map(enrich),
  };
  cache = { at: now, payload };

  return NextResponse.json(payload, {
    headers: error ? { "x-fallback-reason": error } : undefined,
  });
}
