import type { SeasonSummary } from "@shared/api-types.ts";
import { useEffect, useEffectEvent, useState } from "react";
import { getSeasons } from "../api/client.ts";
import styles from "./SeasonSelector.module.css";

interface SeasonSelectorProps {
  /** The list is fetched only once the server is awake, so requests don't pile up on a sleeping server. */
  serverAwake: boolean;
  /** The chosen season, or null before the list has loaded. */
  season: number | null;
  onSeasonChange: (season: number) => void;
}

/** "2026 · Issue 07", or just "2026" if the issue couldn't be read from the PDF. */
function seasonLabel({ season, issue }: SeasonSummary): string {
  return issue ? `${season} · ${issue}` : String(season);
}

/** A dropdown of the seasons in the database. It picks the newest one as soon as the list arrives. */
export function SeasonSelector({ serverAwake, season, onSeasonChange }: SeasonSelectorProps) {
  const [seasons, setSeasons] = useState<SeasonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lets the effect below call the latest onSeasonChange without re-running when it changes.
  const selectSeason = useEffectEvent(onSeasonChange);

  useEffect(() => {
    if (!serverAwake) return;

    const controller = new AbortController();
    getSeasons(controller.signal)
      .then((response) => {
        setSeasons(response.seasons);
        // The API lists the newest season first.
        const newest = response.seasons[0];
        if (newest) selectSeason(newest.season);
      })
      .catch((caught: unknown) => {
        // An abort means this component is going away, so there's nothing to show.
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Couldn't load the seasons");
      });
    return () => controller.abort();
  }, [serverAwake]);

  // While there's nothing to pick, a disabled box says why, so the header keeps its shape.
  let placeholder = "Loading…";
  if (!serverAwake) placeholder = "—";
  else if (error) placeholder = "Unavailable";
  else if (seasons?.length === 0) placeholder = "None loaded";

  return (
    <label className={styles.selector}>
      <span className={styles.label}>Season</span>
      {seasons && seasons.length > 0 ? (
        <select
          className={styles.select}
          value={season ?? ""}
          onChange={(event) => onSeasonChange(Number(event.target.value))}
        >
          {seasons.map((summary) => (
            <option key={summary.season} value={summary.season}>
              {seasonLabel(summary)}
            </option>
          ))}
        </select>
      ) : (
        <select className={styles.select} disabled title={error ?? undefined}>
          <option>{placeholder}</option>
        </select>
      )}
    </label>
  );
}
