"""
Build the NBA Higher/Lower player pool.

Run once before starting the game server:
    python build_player_pool.py

Strategy:
  - Pre-filter players from commonallplayers (active: all; inactive: 4+ season careers)
  - Fetch PlayercareerstatsL career totals per player (checkpointed)
  - Apply stat significance filter
  - Fetch awards per player for the filtered pool (checkpointed)
  - Apply award significance filter
  - Save player_pool.json

Checkpoints are saved every 100 players so the script can be interrupted
and resumed safely. Expected runtime: 20-35 minutes.
"""

import json
import os
import time

import pandas as pd
from nba_api.stats.endpoints import commonallplayers, playercareerstats, playerawards
from nba_api.stats.static import players as nba_players_static

STATS_CACHE   = "career_stats_cache.json"
AWARDS_CACHE  = "awards_cache.json"
OUTPUT        = "player_pool.json"

RATE_LIMIT    = 0.6   # seconds between API calls


# ── 1. Get pre-filtered player list ──────────────────────────────────────────

def get_candidate_players() -> list[dict]:
    """
    Returns list of {id, name, team, is_active} for players to fetch stats for.
    Active: all. Inactive: career_len >= 4 seasons (proxy for significance).
    """
    print("Fetching player list from commonallplayers...")
    df = commonallplayers.CommonAllPlayers(
        is_only_current_season=0, timeout=30
    ).get_data_frames()[0]

    df["FROM_YEAR"]   = pd.to_numeric(df["FROM_YEAR"], errors="coerce").fillna(0).astype(int)
    df["TO_YEAR"]     = pd.to_numeric(df["TO_YEAR"],   errors="coerce").fillna(0).astype(int)
    df["career_len"]  = df["TO_YEAR"] - df["FROM_YEAR"] + 1
    df["IS_ACTIVE"]   = df["ROSTERSTATUS"] == 1

    active_mask   = df["IS_ACTIVE"]
    inactive_mask = ~df["IS_ACTIVE"] & (df["career_len"] >= 4)

    filtered = df[active_mask | inactive_mask].copy()
    print(f"  Active: {active_mask.sum()}  |  Inactive 4+ seasons: {(inactive_mask).sum()}")
    print(f"  Total candidates: {len(filtered)}")

    return [
        {
            "id":        int(row["PERSON_ID"]),
            "name":      str(row["DISPLAY_FIRST_LAST"]),
            "team":      str(row.get("TEAM_ABBREVIATION", "") or "---"),
            "is_active": bool(row["IS_ACTIVE"]),
            "from_year": int(row["FROM_YEAR"]),
            "to_year":   int(row["TO_YEAR"]),
        }
        for _, row in filtered.iterrows()
    ]


# ── 2. Fetch career totals (checkpointed) ────────────────────────────────────

def fetch_career_stats(candidates: list[dict]) -> dict:
    """
    Returns dict of str(player_id) → career stat dict.
    Resumes from STATS_CACHE checkpoint.
    """
    cache: dict = {}
    if os.path.exists(STATS_CACHE):
        with open(STATS_CACHE) as f:
            cache = json.load(f)
        print(f"Resuming career stats: {len(cache)}/{len(candidates)} done")

    remaining = [p for p in candidates if str(p["id"]) not in cache]
    total     = len(candidates)

    for i, player in enumerate(remaining, start=len(cache) + 1):
        pid = player["id"]
        try:
            career = playercareerstats.PlayerCareerStats(
                player_id=pid, timeout=30
            ).get_data_frames()

            # df[1] is the career totals row
            if len(career) > 1 and not career[1].empty:
                row = career[1].iloc[0]
                gp = int(row.get("GP", 0) or 0)
                cache[str(pid)] = {
                    "GP":   gp,
                    "PTS":  int(row.get("PTS",  0) or 0),
                    "REB":  int(row.get("REB",  0) or 0),
                    "AST":  int(row.get("AST",  0) or 0),
                    "STL":  int(row.get("STL",  0) or 0),
                    "BLK":  int(row.get("BLK",  0) or 0),
                    "FG3M": int(row.get("FG3M", 0) or 0),
                    "FG3A": int(row.get("FG3A", 0) or 0),
                }
            else:
                cache[str(pid)] = None  # no data

        except Exception as e:
            print(f"  Warning: career stats for {pid} ({player['name']}): {e}")
            cache[str(pid)] = None

        if i % 100 == 0 or i == total:
            with open(STATS_CACHE, "w") as f:
                json.dump(cache, f)
            pct = i / total * 100
            print(f"  [{i}/{total}  {pct:.1f}%] career stats checkpoint saved")

        time.sleep(RATE_LIMIT)

    return cache


# ── 3. Stat-based significance filter ────────────────────────────────────────

def passes_stat_filter(stats: dict, is_active: bool) -> bool:
    if stats is None:
        return False
    if is_active:
        return True   # include all active players regardless of stats
    return (
        stats["GP"]  >= 400
        or stats["PTS"] >= 5000
        or stats["REB"] >= 2000
        or stats["AST"] >= 2500
        or stats["STL"] >= 700
        or stats["BLK"] >= 700
    )


# ── 4. Fetch awards (checkpointed) ───────────────────────────────────────────

ALL_STAR_CODE = "All-Star"
ALL_NBA_CODE  = "KIANT"
ALL_DEF_CODE  = "KIADT"
INDIVIDUAL_AWARD_SUBTYPES = {
    "KIMVP",    # MVP
    "KDPYR",    # DPOY
    "KFMVP",    # Finals MVP
    "Champion", # Championship
    "KCRTY",    # ROTY
    "KCSMY",    # Sixth Man of the Year
    "KCMIP",    # Most Improved Player
    "KCATR",    # All-Rookie
    "KCAST",    # All-Star Game MVP / other
}


def _parse_awards(awards_df: pd.DataFrame) -> dict:
    if awards_df is None or awards_df.empty:
        return {"ALL_STAR": 0, "ALL_NBA": 0, "ALL_DEFENSIVE": 0, "has_individual": False}

    def _count(code: str) -> int:
        return int(
            ((awards_df.get("SUBTYPE1", pd.Series(dtype=str)) == code)
             | (awards_df.get("SUBTYPE2", pd.Series(dtype=str)) == code)).sum()
        )

    has_individual = bool(
        awards_df[
            awards_df.get("SUBTYPE1", pd.Series(dtype=str)).isin(INDIVIDUAL_AWARD_SUBTYPES)
            | awards_df.get("SUBTYPE2", pd.Series(dtype=str)).isin(INDIVIDUAL_AWARD_SUBTYPES)
        ].shape[0] > 0
    )

    return {
        "ALL_STAR":     _count(ALL_STAR_CODE),
        "ALL_NBA":      _count(ALL_NBA_CODE),
        "ALL_DEFENSIVE":_count(ALL_DEF_CODE),
        "has_individual": has_individual,
    }


def fetch_awards(player_ids: list[int]) -> dict:
    """Returns dict of str(player_id) → award counts. Resumes from AWARDS_CACHE."""
    cache: dict = {}
    if os.path.exists(AWARDS_CACHE):
        with open(AWARDS_CACHE) as f:
            cache = json.load(f)
        print(f"Resuming awards fetch: {len(cache)}/{len(player_ids)} done")

    remaining = [pid for pid in player_ids if str(pid) not in cache]
    total     = len(player_ids)

    for i, pid in enumerate(remaining, start=len(cache) + 1):
        try:
            awards_df = playerawards.PlayerAwards(player_id=pid, timeout=30).get_data_frames()[0]
            cache[str(pid)] = _parse_awards(awards_df)
        except Exception as e:
            print(f"  Warning: awards for {pid}: {e}")
            cache[str(pid)] = {"ALL_STAR": 0, "ALL_NBA": 0, "ALL_DEFENSIVE": 0, "has_individual": False}

        if i % 100 == 0 or i == total:
            with open(AWARDS_CACHE, "w") as f:
                json.dump(cache, f)
            pct = i / total * 100
            print(f"  [{i}/{total}  {pct:.1f}%] awards checkpoint saved")

        time.sleep(RATE_LIMIT)

    return cache


# ── 5. Assemble final pool ────────────────────────────────────────────────────

def build_pool(candidates, stats_cache, awards_cache) -> list:
    pool = []

    for player in candidates:
        pid       = player["id"]
        stats     = stats_cache.get(str(pid))
        awards    = awards_cache.get(str(pid), {"ALL_STAR": 0, "ALL_NBA": 0, "ALL_DEFENSIVE": 0, "has_individual": False})
        is_active = player["is_active"]

        if stats is None:
            continue

        # Active players always included; retired players need >= 3 conditions
        if is_active:
            pass
        else:
            conditions = sum([
                stats["GP"]  >= 400,
                stats["PTS"] >= 5000,
                stats["REB"] >= 2000,
                stats["AST"] >= 2500,
                stats["STL"] >= 700,
                stats["BLK"] >= 700,
                awards["ALL_NBA"]       >= 1,
                awards["ALL_DEFENSIVE"] >= 1,
                awards["ALL_STAR"]      >= 1,
                bool(awards["has_individual"]),
            ])
            if conditions < 3:
                continue

        gp   = max(stats["GP"], 1)
        fg3m = stats["FG3M"]
        fg3a = stats["FG3A"]

        pool.append({
            "id":        pid,
            "name":      player["name"],
            "team":      player["team"],
            "is_active": is_active,
            "from_year": player.get("from_year", 0),
            "to_year":   player.get("to_year", 0),
            "stats": {
                "PPG":           round(stats["PTS"] / gp, 1),
                "RPG":           round(stats["REB"] / gp, 1),
                "APG":           round(stats["AST"] / gp, 1),
                "SPG":           round(stats["STL"] / gp, 1),
                "BPG":           round(stats["BLK"] / gp, 1),
                "PTS":           stats["PTS"],
                "REB":           stats["REB"],
                "AST":           stats["AST"],
                "STL":           stats["STL"],
                "BLK":           stats["BLK"],
                "FG3M":          fg3m,
                "FG3_PCT":       round(fg3m / fg3a * 100, 1) if fg3a > 0 else 0.0,
                "ALL_NBA":       awards["ALL_NBA"],
                "ALL_DEFENSIVE": awards["ALL_DEFENSIVE"],
                "ALL_STAR":      awards["ALL_STAR"],
            },
        })

    return pool


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Step 1: candidate player list
    candidates = get_candidate_players()

    # Step 2: career stats (checkpointed)
    print(f"\nFetching career stats for {len(candidates)} players "
          f"(~{len(candidates) * RATE_LIMIT / 60:.0f} min)...")
    stats_cache = fetch_career_stats(candidates)

    # Step 3: stat filter → reduced pool for award fetching
    stat_passed = [
        p for p in candidates
        if passes_stat_filter(stats_cache.get(str(p["id"])), p["is_active"])
    ]
    print(f"\nPlayers passing stat filter: {len(stat_passed)}")

    # Step 4: awards (checkpointed, only for stat-filtered pool)
    award_ids = [p["id"] for p in stat_passed]
    print(f"Fetching awards for {len(award_ids)} players "
          f"(~{len(award_ids) * RATE_LIMIT / 60:.0f} min)...")
    awards_cache = fetch_awards(award_ids)

    # Step 5: build + save final pool
    pool = build_pool(candidates, stats_cache, awards_cache)
    print(f"\nFinal pool: {len(pool)} players")

    with open(OUTPUT, "w") as f:
        json.dump(pool, f, indent=2)
    print(f"Saved: {OUTPUT}")

    # Quick sanity check
    active_count = sum(1 for p in pool if p["is_active"])
    print(f"  Active: {active_count}  |  Retired: {len(pool) - active_count}")


if __name__ == "__main__":
    main()
