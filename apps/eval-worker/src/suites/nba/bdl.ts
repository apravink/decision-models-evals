const BASE = "https://api.balldontlie.io/v1";

export interface BdlTeam {
  id: number;
  conference: string;
  division: string;
  city: string;
  name: string;
  full_name: string;
  abbreviation: string;
}

export interface BdlGame {
  id: number;
  date: string;
  datetime: string | null;
  season: number;
  status: string;
  status_state: string | null;
  period: number;
  time: string;
  postseason: boolean;
  postponed: boolean;
  home_team_score: number | null;
  visitor_team_score: number | null;
  home_team: { id: number; abbreviation: string };
  visitor_team: { id: number; abbreviation: string };
}

interface BdlList<T> {
  data: T[];
  meta: { next_cursor: number | null; per_page: number };
}

async function bdlFetch<T>(apiKey: string, path: string, params: URLSearchParams): Promise<T> {
  const url = new URL(BASE + path);
  for (const [key, value] of params) url.searchParams.append(key, value);
  let res = await fetch(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    res = await fetch(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(30_000) });
  }
  if (!res.ok) throw new Error(`balldontlie ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function fetchTeams(apiKey: string): Promise<BdlTeam[]> {
  return bdlFetch<BdlList<BdlTeam>>(apiKey, "/teams", new URLSearchParams()).then((r) => r.data);
}

export function fetchGamesByDates(apiKey: string, dates: string[]): Promise<BdlGame[]> {
  const params = new URLSearchParams({ per_page: "100" });
  for (const date of dates) params.append("dates[]", date);
  return bdlFetch<BdlList<BdlGame>>(apiKey, "/games", params).then((r) => r.data);
}

export async function fetchSeasonGames(
  apiKey: string,
  season: number,
  onPage: (games: BdlGame[]) => Promise<void> | void,
  sleepMs = 0,
): Promise<number> {
  let cursor: number | null = null;
  let total = 0;
  do {
    const params = new URLSearchParams({ per_page: "100", "seasons[]": String(season) });
    if (cursor !== null) params.set("cursor", String(cursor));
    const page = await bdlFetch<BdlList<BdlGame>>(apiKey, "/games", params);
    await onPage(page.data);
    total += page.data.length;
    const next = page.meta.next_cursor;
    cursor = next !== null && next > 0 ? next : null;
    if (cursor !== null && sleepMs > 0) await new Promise((resolve) => setTimeout(resolve, sleepMs));
  } while (cursor !== null);
  return total;
}
