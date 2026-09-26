"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  FileSpreadsheet,
  GitCompareArrows,
  Heart,
  Leaf,
  ListOrdered,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { SessionView, SortingAlgorithm } from "@/shared/types";
import * as api from "@/client/api";
import { FilmPoster } from "./film-poster";
import { ThemeToggle } from "./theme-toggle";

const sample =
  "Title,Year,Director\nSpirited Away,2001,Hayao Miyazaki\nThe Grand Budapest Hotel,2014,Wes Anderson\nArrival,2016,Denis Villeneuve\nInterstellar,2014,Christopher Nolan\nFantastic Mr. Fox,2009,Wes Anderson\nAmélie,2001,Jean-Pierre Jeunet\n";
const storageKey = "sortory-session";
const pausedKey = "sortory-paused-session";
function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(storageKey, id);
    else localStorage.removeItem(storageKey);
  } catch {
    /* Ranking still works without browser storage. */
  }
}
function download(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvCell(value: string) {
  const safe = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function RankingApp() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  function setRankingPaused(value: boolean, id = session?.id) {
    setPaused(value);
    try {
      if (value && id) localStorage.setItem(pausedKey, id);
      else localStorage.removeItem(pausedKey);
    } catch {
      /* Viewing and resuming still work without browser storage. */
    }
  }
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [algorithm, setAlgorithm] = useState<SortingAlgorithm>("merge");
  const [dragging, setDragging] = useState(false);
  const [showReset, setShowReset] = useState<"restart" | "replace" | null>(
    null,
  );
  const input = useRef<HTMLInputElement>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (showReset) resetDialog.current?.showModal();
    else resetDialog.current?.close();
  }, [showReset]);
  useEffect(() => {
    let active = true;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {}
    if (!saved) {
      setRestoring(false);
      return;
    }
    api
      .restore(saved)
      .then((value) => {
        if (active) {
          setSession(value);
          setAlgorithm(value.algorithm);
          setStarted(value.comparisons > 0);
          try {
            setPaused(localStorage.getItem(pausedKey) === value.id && !value.results);
          } catch {}
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          remember(null);
        }
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function importFile(file?: File, header = hasHeader) {
    if (!file || inFlight.current) return;
    if (file.size > 1024 * 1024) {
      setError("Choose a CSV smaller than 1 MB.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await api.upload(file, header, algorithm);
      setSession(value);
      setStarted(false);
      setRankingPaused(false);
      remember(value.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not upload the file.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function changeAlgorithm(value: SortingAlgorithm) {
    if (inFlight.current) return;
    if (!session) {
      setAlgorithm(value);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await api.changeAlgorithm(session, value);
      setSession(updated);
      setAlgorithm(updated.algorithm);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not change the sorting algorithm.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const choose = useCallback(
    async (action: "choose" | "undo", winner?: string) => {
      if (!session || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError("");
      try {
        setSession(await api.decide(session, action, winner));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not save your choice.",
        );
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [session],
  );
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        !started ||
        paused ||
        !session?.pair ||
        busy ||
        showReset ||
        (event.target instanceof HTMLElement &&
          ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName))
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        void choose(
          "choose",
          session.pair[event.key === "ArrowLeft" ? 0 : 1].id,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, paused, session, busy, showReset, choose]);
  const stage = session?.results || paused ? 3 : started ? 2 : 1;
  const displayedRanking = session?.results ?? (paused ? session?.currentRanking : null);
  const provisional = !!session && !session.results && paused;
  function reset() {
    setSession(null);
    setStarted(false);
    setRankingPaused(false);
    setShowReset(null);
    setError("");
    remember(null);
  }
  async function restart() {
    if (!session || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      setSession(await api.decide(session, "restart"));
      setStarted(true);
      setRankingPaused(false);
      setShowReset(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not restart your ranking.",
      );
      setShowReset(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function exportResults() {
    if (!session || !displayedRanking) return;
    const headings = Object.keys(session.items[0].details);
    const rows = [
      [provisional ? "Provisional rank" : "Rank", "Film", ...headings],
      ...displayedRanking.map((item, index) => [
        String(index + 1),
        item.name,
        ...headings.map((key) => item.details[key] || ""),
      ]),
    ];
    download(
      rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      `${session.name}-${provisional ? "provisional" : "ranked"}.csv`,
    );
  }

  return (
    <div className="app-shell">
      <header className="header">
        <a className="brand" href="/" aria-label="Sortory home">
          <span className="brand-mark">
            <ArrowDownUp size={21} />
          </span>
          sortory<span className="brand-dot">.</span>
        </a>
        <span className="header-note">Your taste. Your order.</span>
        <div className="header-actions">
          <ThemeToggle />
          <button
            className="text-button"
            onClick={() =>
              document
                .getElementById("how-it-works")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            How it works <span className="help-circle">?</span>
          </button>
        </div>
      </header>
      <main>
        <div className="intro">
          <div className="eyebrow">
            <span /> LESS OVERTHINKING. MORE YOU.
          </div>
          <h1>
            A little clarity for
            <br />
            your <span>favorite films.</span>
            <svg className="flourish" viewBox="0 0 55 55" aria-hidden="true">
              <path d="M8 43 21 26M30 35l17-4M25 16l2-13" />
            </svg>
          </h1>
          <p>
            Big list? Strong opinions? Find your order, one choice at a time.
            <br className="desktop-break" /> Bring your films. We’ll help you
            discover what comes first.
          </p>
        </div>
        <div className="workspace">
          <nav className="steps" aria-label="Ranking progress">
            {[
              { label: "Add your films", icon: Upload },
              { label: "Make your choices", icon: GitCompareArrows },
              { label: "See your ranking", icon: ListOrdered },
            ].map(({ label, icon: Icon }, index) => (
              <div
                key={label}
                className={`step ${stage === index + 1 ? "active" : ""} ${stage > index + 1 ? "complete" : ""}`}
                aria-current={stage === index + 1 ? "step" : undefined}
              >
                <span className="step-number">
                  {stage > index + 1 ? <Check size={14} /> : index + 1}
                </span>
                <Icon size={16} />
                <span>{label}</span>
                {index < 2 && (
                  <ChevronRight className="step-chevron" size={16} />
                )}
              </div>
            ))}
          </nav>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {restoring ? (
            <div className="loading">
              <LoaderCircle className="spin" /> Opening your workspace…
            </div>
          ) : stage === 1 ? (
            <div className="import-layout">
              <section className="import-main">
                <div className="section-heading">
                  <span className="icon-tile">
                    <FileSpreadsheet size={21} />
                  </span>
                  <div>
                    <h2>Your films. Your personal ranking.</h2>
                    <p>Upload film names. We’ll find their covers on IMDb.</p>
                  </div>
                </div>
                <label className="algorithm-field" htmlFor="sorting-algorithm">
                  Sorting algorithm
                  <select
                    id="sorting-algorithm"
                    value={session?.algorithm ?? algorithm}
                    disabled={busy}
                    onChange={(event) =>
                      void changeAlgorithm(
                        event.target.value as SortingAlgorithm,
                      )
                    }
                  >
                    <option value="merge">Merge sort</option>
                    <option value="quick">Quick sort</option>
                    <option value="heap">Heap sort</option>
                  </select>
                </label>
                {!session ? (
                  <>
                    <input
                      ref={input}
                      type="file"
                      accept=".csv,text/csv"
                      className="visually-hidden"
                      aria-label="Upload CSV file"
                      disabled={busy}
                      onChange={(event) =>
                        void importFile(event.target.files?.[0])
                      }
                    />
                    <button
                      className={`dropzone ${dragging ? "dragging" : ""}`}
                      disabled={busy}
                      onClick={() => input.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);
                        void importFile(event.dataTransfer.files[0]);
                      }}
                    >
                      <span className="upload-illustration">
                        <FileSpreadsheet size={34} />
                        <span>
                          <Plus size={14} />
                        </span>
                      </span>
                      <strong>
                        {busy
                          ? "Reading your list…"
                          : "Drop your CSV right here"}
                      </strong>
                      <span>
                        or <span className="browse">browse files</span> to get
                        started
                      </span>
                      <small>CSV files · Up to 500 films · Max 1 MB</small>
                    </button>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={hasHeader}
                        onChange={(event) => setHasHeader(event.target.checked)}
                        disabled={busy}
                      />{" "}
                      My first row contains column names
                    </label>
                    <div className="sample-row">
                      <span>Just looking around?</span>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void importFile(
                            new File([sample], "Movie night favorites.csv", {
                              type: "text/csv",
                            }),
                            true,
                          )
                        }
                      >
                        Try a sample list <ArrowRight size={15} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="preview">
                    <div className="preview-title">
                      <span className="success-icon">
                        <CheckCheck size={20} />
                      </span>
                      <div>
                        <strong>{session.name}</strong>
                        <span>
                          {session.items.length} films · Ready to rank
                        </span>
                      </div>
                      <button
                        className="text-button"
                        onClick={reset}
                        aria-label="Remove uploaded list"
                        disabled={busy}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <ol>
                      {session.items.slice(0, 4).map((item) => (
                        <li key={item.id} className="film-preview-row">
                          <FilmPoster film={item} compact />
                          <div>
                            <span>{item.name}</span>
                            <small>
                              {Object.values(item.details)
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {session.items.length > 4 && (
                      <p className="more-items">
                        + {session.items.length - 4} more films
                      </p>
                    )}
                    <button
                      className="primary-button full"
                      disabled={busy}
                      onClick={() => setStarted(true)}
                    >
                      Let’s find your favorites <ArrowRight size={17} />
                    </button>
                    <p className="estimate">
                      At most {session.maxComparisons} quick choices. Go at your
                      own pace.
                    </p>
                  </div>
                )}
              </section>
              <aside className="csv-guide">
                <span className="small-label">A LITTLE CSV GUIDANCE</span>
                <h3>
                  Simple list.
                  <br />
                  Memorable films.
                </h3>
                <p>
                  From cult classics to new favorites.
                  <br />
                  Bring your watchlist to life with IMDb covers.
                </p>
                <div className="mini-sheet">
                  <div className="sheet-top">
                    <span />
                    <span />
                    <span />
                    <span className="sheet-filename">my-favorites.csv</span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th />
                        <th>Title</th>
                        <th>Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>1</td>
                        <td>Spirited Away</td>
                        <td>2001</td>
                      </tr>
                      <tr>
                        <td>2</td>
                        <td>Arrival</td>
                        <td>2016</td>
                      </tr>
                      <tr>
                        <td>3</td>
                        <td>Interstellar</td>
                        <td>2014</td>
                      </tr>
                    </tbody>
                  </table>
                  <span className="sheet-tag">
                    <Check size={12} /> Just like this
                  </span>
                </div>
                <ul className="guide-tips">
                  <li>
                    <Check size={14} /> One film per row
                  </li>
                  <li>
                    <Check size={14} /> Film names in the first column
                  </li>
                  <li>
                    <Check size={14} /> Optional year or jahr column identifies
                    remakes
                  </li>
                </ul>
                <button
                  className="template-link"
                  onClick={() => download(sample, "sortory-template.csv")}
                >
                  <Download size={14} /> Download example CSV
                </button>
              </aside>
            </div>
          ) : stage === 2 && session ? (
            <section className="compare-section">
              <div className="compare-heading">
                <span className="small-label">TRUST YOUR INSTINCTS</span>
                <h2>Which film do you prefer?</h2>
                <p>Choose the one you’d put higher on your list.</p>
              </div>
              <div className="progress-heading">
                <span>{session.name}</span>
                <span>{session.comparisons} choices made</span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-valuenow={session.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Estimated ranking progress"
              >
                <span style={{ width: `${session.progress}%` }} />
              </div>
              <div className="comparison-cards">
                {session.pair?.map((item, index) => (
                  <button
                    className={`choice-card choice-${index}`}
                    key={`${index}-${item.id}`}
                    disabled={busy}
                    onClick={() => void choose("choose", item.id)}
                  >
                    <span className="choice-label">
                      OPTION {index === 0 ? "A" : "B"}
                      <Heart size={18} />
                    </span>
                    <FilmPoster film={item} />
                    <span className="choice-name">{item.name}</span>
                    <span className="choice-details">
                      {Object.entries(item.details)
                        .filter(([, value]) => value)
                        .map(([key, value]) => (
                          <span key={key}>
                            <small>{key}</small>
                            {value}
                          </span>
                        ))}
                    </span>
                    <span className="choice-cta">
                      I prefer this <ArrowRight size={17} />
                    </span>
                  </button>
                ))}
                <span className="versus">or</span>
              </div>
              <div className="compare-footer">
                <button
                  className="text-button"
                  disabled={busy || session.comparisons === 0}
                  onClick={() => void choose("undo")}
                >
                  <RotateCcw size={15} /> Undo last choice
                </button>
                <span>
                  {busy
                    ? "Saving your choice…"
                    : "Tip: use the ← and → arrow keys"}
                </span>
              </div>
              <p className="saved-note">
                <Check size={13} /> Progress is saved automatically. You can
                come back anytime.
              </p>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => setRankingPaused(true)}
              >
                <ListOrdered size={16} /> Pause &amp; view ranking
              </button>
              <button
                className="text-button restart-button"
                disabled={busy}
                onClick={() => setShowReset("restart")}
              >
                <RotateCcw size={15} /> Start over
              </button>
              <p className="cover-note">
                Covers found via{" "}
                <a
                  href="https://www.imdb.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  IMDb
                </a>
                . Missing cover? You can still rank the film.
              </p>
            </section>
          ) : session && displayedRanking ? (
            <section className="results-section">
              <span className="result-icon">
                <Sparkles size={25} />
              </span>
              <span className="small-label">{provisional ? "RANKING PAUSED" : "YOUR TASTE, IN ORDER"}</span>
              <h2>{provisional ? "Your ranking so far" : "And the favorites are…"}</h2>
              <p>
                {session.items.length} films. {session.comparisons} choices.
                {provisional ? " Your progress is saved. Resume anytime." : " One list that’s completely you."}
              </p>
              {provisional && (
                <>
                  <p role="status">
                    This order is provisional, based on your choices so far.
                    Films without an established order keep their initial relative order where possible.
                    Positions may change as you compare more films.
                  </p>
                  <button className="primary-button resume-button" onClick={() => {
                    setStarted(true);
                    setRankingPaused(false);
                  }}>
                    Resume ranking <ArrowRight size={17} />
                  </button>
                </>
              )}
              <ol className="results-list">
                {displayedRanking.map((item, index) => (
                  <li key={item.id}>
                    <span
                      className={`rank-number ${!provisional && index < 3 ? "podium" : ""}`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <FilmPoster film={item} compact />
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {Object.values(item.details)
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    {!provisional && index === 0 && (
                      <span className="favorite-badge">
                        <Heart size={12} /> YOUR FAVORITE
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <div className="result-actions">
                <button className="primary-button" onClick={exportResults}>
                  <Download size={17} /> {provisional ? "Download provisional ranking" : "Download ranking"}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setShowReset("replace")}
                >
                  Rank another list <Plus size={16} />
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setShowReset("restart")}
                >
                  <RotateCcw size={16} /> Start over
                </button>
              </div>
              {!provisional && <button
                className="text-button undo-result"
                disabled={busy}
                onClick={() => {
                  setStarted(true);
                  void choose("undo");
                }}
              >
                <RotateCcw size={14} /> Rethink your last choice
              </button>}
            </section>
          ) : null}
          <div className="workspace-footer">
            <span>
              <Leaf size={14} /> A little less chaos. A little more clarity.
            </span>
            <span>Made for your kind of favorite.</span>
          </div>
        </div>
        <section className="how-section" id="how-it-works">
          <div className="how-title">
            <span className="small-label">FROM A LIST TO YOUR LIST</span>
            <h2>No scores. No spreadsheets. Just choices.</h2>
          </div>
          <div className="how-grid">
            <article>
              <span className="how-icon">
                <Upload size={20} />
              </span>
              <div>
                <h3>Bring your film list</h3>
                <p>
                  Upload a CSV of film names.
                  <br className="desktop-break" /> We find their covers on IMDb.
                </p>
              </div>
            </article>
            <article>
              <span className="how-icon peach">
                <GitCompareArrows size={21} />
              </span>
              <div>
                <h3>Pick one. Then another.</h3>
                <p>
                  We show you two films at a time.
                  <br className="desktop-break" /> You choose the one you
                  prefer.
                </p>
              </div>
            </article>
            <article>
              <span className="how-icon yellow">
                <ListOrdered size={21} />
              </span>
              <div>
                <h3>Meet your personal ranking</h3>
                <p>
                  A clever sorting algorithm connects
                  <br className="desktop-break" /> your choices into one ordered
                  list.
                </p>
              </div>
            </article>
          </div>
        </section>
        {session && stage === 2 && (
          <button
            className="start-over text-button"
            disabled={busy}
            onClick={() => setShowReset("replace")}
          >
            Start a different list <ArrowRight size={14} />
          </button>
        )}
      </main>
      <footer className="page-footer">
        <span className="footer-brand">sortory.</span>
        <span>Because some things are a matter of taste.</span>
        <Heart size={14} />
      </footer>
      <dialog
        ref={resetDialog}
        className="modal"
        aria-labelledby="reset-title"
        aria-describedby="reset-description"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setShowReset(null);
        }}
      >
        <button
          className="modal-close text-button"
          autoFocus
          disabled={busy}
          onClick={() => setShowReset(null)}
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <h2 id="reset-title">
          {showReset === "restart"
            ? "Start this ranking over?"
            : "Start a fresh list?"}
        </h2>
        <p id="reset-description">
          {showReset === "restart"
            ? "This will erase all your choices and restart with the same films and sorting algorithm. This cannot be undone. Download your results first if you’d like to keep them."
            : "This will clear this browser’s current ranking. Download your results first if you’d like to keep them."}
        </p>
        <div className="result-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => setShowReset(null)}
          >
            {showReset === "restart" ? "Keep my ranking" : "Keep this list"}
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => (showReset === "restart" ? void restart() : reset())}
          >
            {busy
              ? "Starting over…"
              : showReset === "restart"
                ? "Start over"
                : "Start fresh"}{" "}
            <ArrowRight size={16} />
          </button>
        </div>
      </dialog>
    </div>
  );
}
