import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { enrich } from "@/lib/format";
import type { FeedKey, RawResult, ResultsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE_SECONDS = Number(process.env.RACE_CACHE_SECONDS ?? 15);

const FEED_ENV: Record<FeedKey, string> = {
  overall: "RACE_FEED_OVERALL",
  men: "RACE_FEED_MEN",
  women: "RACE_FEED_WOMEN",
  teams: "RACE_FEED_TEAMS",
};

const cache: Partial<Record<FeedKey, { at: number; payload: ResultsPayload }>> = {};

function feedFromQuery(q: string | null): FeedKey {
  if (q === "men" || q === "women" || q === "teams") return q;
  return "overall";
}

function feedUrl(feed: FeedKey): string | undefined {
  if (feed === "overall") {
    return process.env.RACE_FEED_OVERALL || process.env.RACE_RESULTS_URL;
  }
  return process.env[FEED_ENV[feed]];
}

async function loadSample(): Promise<RawResult[]> {
  const file = path.join(process.cwd(), "data", "sample.json");
  return JSON.parse(await fs.readFile(file, "utf8")) as RawResult[];
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

export async function GET(req: NextRequest) {
  const feed = feedFromQuery(req.nextUrl.searchParams.get("feed"));
  const now = Date.now();
  const hit = cache[feed];
  if (hit && now - hit.at < CACHE_SECONDS * 1000) {
    return NextResponse.json(hit.payload);
  }

  const url = feedUrl(feed);
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
    feed,
    fetchedAt: new Date().toISOString(),
    source,
    count: raw.length,
    results: raw.map(enrich),
  };
  cache[feed] = { at: now, payload };

  return NextResponse.json(payload, {
    headers: error ? { "x-fallback-reason": error } : undefined,
  });
}
