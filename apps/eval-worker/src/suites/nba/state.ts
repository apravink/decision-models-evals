export interface TeamSnapshot {
  gp: number;
  wins: number;
  losses: number;
  win_pct: number;
  streak: number;
  last10: string;
  avg_pts_for: number;
  avg_pts_against: number;
  home_record: string;
  away_record: string;
}

interface GameRow {
  date: string;
  home_team_id: number;
  visitor_team_id: number;
  home_score: number | null;
  visitor_score: number | null;
}

export async function teamSnapshot(
  db: D1Database,
  teamId: number,
  season: number,
  beforeDate?: string,
): Promise<TeamSnapshot | null> {
  const sql = `SELECT date, home_team_id, visitor_team_id, home_score, visitor_score
               FROM nba_games
               WHERE season = ?1 AND postseason = 0 AND status_state = 'final'
                 AND home_score IS NOT NULL AND visitor_score IS NOT NULL
                 AND (home_team_id = ?2 OR visitor_team_id = ?2)${beforeDate ? " AND date < ?3" : ""}
               ORDER BY date`;
  const stmt = beforeDate
    ? db.prepare(sql).bind(season, teamId, beforeDate)
    : db.prepare(sql).bind(season, teamId);
  const { results } = await stmt.all<GameRow>();
  if (results.length === 0) return null;

  let wins = 0;
  let losses = 0;
  let homeWins = 0;
  let homeLosses = 0;
  let awayWins = 0;
  let awayLosses = 0;
  let ptsFor = 0;
  let ptsAgainst = 0;
  const outcomes: ("W" | "L")[] = [];
  for (const game of results) {
    const isHome = game.home_team_id === teamId;
    const own = isHome ? game.home_score! : game.visitor_score!;
    const opp = isHome ? game.visitor_score! : game.home_score!;
    const won = own > opp;
    outcomes.push(won ? "W" : "L");
    if (won) {
      wins++;
      if (isHome) homeWins++;
      else awayWins++;
    } else {
      losses++;
      if (isHome) homeLosses++;
      else awayLosses++;
    }
    ptsFor += own;
    ptsAgainst += opp;
  }

  let streak = 0;
  const last = outcomes[outcomes.length - 1]!;
  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (outcomes[i] === last) streak++;
    else break;
  }
  const gp = results.length;
  const last10 = outcomes.slice(-10);
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    gp,
    wins,
    losses,
    win_pct: Math.round((wins / gp) * 1000) / 1000,
    streak: last === "W" ? streak : -streak,
    last10: `${last10.filter((o) => o === "W").length}-${last10.filter((o) => o === "L").length}`,
    avg_pts_for: round1(ptsFor / gp),
    avg_pts_against: round1(ptsAgainst / gp),
    home_record: `${homeWins}-${homeLosses}`,
    away_record: `${awayWins}-${awayLosses}`,
  };
}
