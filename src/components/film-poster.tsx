"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard } from "lucide-react";
import type { Item } from "@/shared/types";
import { filmQuery, type FilmCover } from "@/shared/films";
import { fetchFilmCover } from "@/client/films";

export function FilmPoster({
  film,
  compact = false,
}: {
  film: Item;
  compact?: boolean;
}) {
  const { title, year } = filmQuery(film.name, film.details);
  // Remount on query changes so a previous film's cover can never flash on this film.
  return (
    <Poster
      key={`${title}:${year}`}
      title={title}
      year={year}
      compact={compact}
    />
  );
}

function Poster({
  title,
  year,
  compact,
}: {
  title: string;
  year?: string;
  compact: boolean;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const [cover, setCover] = useState<FilmCover | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      void fetchFilmCover(title, year).then((value) => {
        if (mounted) setCover(value);
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "150px" },
    );
    if (container.current) observer.observe(container.current);
    return () => {
      mounted = false;
      observer.disconnect();
    };
  }, [title, year]);
  const poster = cover?.status === "matched" ? cover.posterUrl : null;
  const message = !cover ? "Finding cover…" : "Cover unavailable";
  return (
    <span
      ref={container}
      className={`film-poster ${compact ? "film-poster-compact" : ""}`}
    >
      {poster && !failed ? (
        <img
          src={poster}
          alt={`${title}${year ? ` (${year})` : ""} film poster`}
          width={400}
          height={600}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="poster-placeholder"
          role="img"
          aria-label={`${title}: ${message}`}
        >
          <Clapperboard size={compact ? 18 : 40} aria-hidden="true" />
          {!compact && <span>{message}</span>}
        </span>
      )}
      {!compact && cover?.status === "matched" && poster && !failed && (
        <span className="poster-source">
          IMDb{cover.year ? ` · ${cover.year}` : ""}
        </span>
      )}
    </span>
  );
}
