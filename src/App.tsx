import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AccessMode, DirectoryEvent, Listing, ListingKind } from "./types";
import { accessLabels, kindLabels } from "./types";

const kindTabs: Array<{ value: "all" | ListingKind; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "group", label: "Groups" },
  { value: "channel", label: "Channels" },
  { value: "business", label: "Businesses" },
  { value: "resource", label: "Resources" }
];

const accessOptions: Array<{ value: "all" | AccessMode; label: string }> = [
  { value: "all", label: "Any access" },
  ...Object.entries(accessLabels).map(([value, label]) => ({ value: value as AccessMode, label }))
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function App() {
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<"all" | ListingKind>("all");
  const [access, setAccess] = useState<"all" | AccessMode>("all");
  const [listings, setListings] = useState<Listing[]>([]);
  const [events, setEvents] = useState<DirectoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("porcupine:saved") ?? "[]"));
    } catch {
      return new Set();
    }
  });

  const loadDirectory = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (activeKind !== "all") params.set("kind", activeKind);
      if (access !== "all") params.set("access", access);
      const [listingResponse, eventResponse] = await Promise.all([
        fetch(`/api/listings?${params}`),
        fetch("/api/events")
      ]);
      if (!listingResponse.ok || !eventResponse.ok) throw new Error("The directory is not available yet.");
      const listingData = await listingResponse.json() as { items: Listing[] };
      const eventData = await eventResponse.json() as { items: DirectoryEvent[] };
      setListings(listingData.items);
      setEvents(eventData.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDirectory();
  }, [activeKind, access]);

  const savedCount = savedIds.size;
  const hasSearch = Boolean(query.trim() || activeKind !== "all" || access !== "all");
  const groupedCounts = useMemo(() => listings.reduce<Record<string, number>>((counts, listing) => {
    counts[listing.kind] = (counts[listing.kind] ?? 0) + 1;
    return counts;
  }, {}), [listings]);

  function toggleSaved(id: string) {
    const next = new Set(savedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSavedIds(next);
    localStorage.setItem("porcupine:saved", JSON.stringify([...next]));
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void loadDirectory();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Porcupine Directory home">
          <span className="brand-mark">✳</span>
          <span><strong>PORCUPINE</strong><small>DIRECTORY</small></span>
        </a>
        <nav className="topnav" aria-label="Main navigation">
          <a href="#directory">Explore</a>
          <a href="#events">Events</a>
          <button className="text-button" onClick={() => setShowAddForm(true)}>Add something</button>
          <span className="saved-pill">{savedCount} saved</span>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">A field guide to freer New Hampshire</p>
            <h1>Find your people.<br /><em>Find your way in.</em></h1>
            <p className="hero-intro">A calm, searchable map of the groups, channels, businesses, resources, and events that make the community move.</p>
            <form className="search-box" onSubmit={submitSearch}>
              <span className="search-icon">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “homeschool”, “Monadnock”, or “liberty”" aria-label="Search the directory" />
              <button type="submit">Search</button>
            </form>
            <div className="hero-notes"><span><i className="dot green" />Browse without an account</span><span><i className="dot gold" />Save privately in your browser</span></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun"></div>
            <div className="mountain mountain-back"></div>
            <div className="mountain mountain-front"></div>
            <div className="trail"></div>
            <div className="hero-card card-one"><span>01</span><strong>discover</strong></div>
            <div className="hero-card card-two"><span>02</span><strong>connect</strong></div>
            <div className="hero-card card-three"><span>03</span><strong>contribute</strong></div>
          </div>
        </section>

        <section className="directory-section" id="directory">
          <div className="section-heading">
            <div><p className="eyebrow">The living index</p><h2>What are you looking for?</h2></div>
            <p className="section-aside">Start broad. The useful details—how to join, where to go, who it is for—live inside each entry.</p>
          </div>
          <div className="tab-row" role="tablist" aria-label="Directory categories">
            {kindTabs.map((tab) => <button key={tab.value} className={activeKind === tab.value ? "tab active" : "tab"} onClick={() => setActiveKind(tab.value)}>{tab.label}{tab.value !== "all" && <span>{groupedCounts[tab.value] ?? 0}</span>}</button>)}
          </div>
          <div className="filter-row">
            <label>Access <select value={access} onChange={(event) => setAccess(event.target.value as "all" | AccessMode)}>{accessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <span className="result-note">{hasSearch ? "Filtered view" : "The directory is community-maintained"}</span>
          </div>

          {error && <div className="status-card error-card"><strong>Not connected yet.</strong><span>{error} Start PostgreSQL and the API with <code>npm run db:up && npm run dev</code>.</span></div>}
          {!error && loading && <div className="status-card"><span className="loading-orb" />Loading the directory…</div>}
          {!error && !loading && listings.length === 0 && <div className="empty-state"><div className="empty-mark">✳</div><h3>{hasSearch ? "Nothing matches that search yet" : "The map is ready for its first entries"}</h3><p>{hasSearch ? "Try another phrase or clear a filter. If something is missing, you can submit it for review." : "The public data import is intentionally waiting for a verified source export. Add a useful group, channel, business, or resource and it will enter the review queue."}</p><button className="button dark" onClick={() => setShowAddForm(true)}>Add a directory entry <span>↗</span></button></div>}
          {!error && !loading && listings.length > 0 && <div className="listing-grid">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} saved={savedIds.has(listing.id)} onSave={() => toggleSaved(listing.id)} />)}</div>}
        </section>

        <section className="events-section" id="events">
          <div className="events-intro"><p className="eyebrow">On the horizon</p><h2>Events worth<br /><em>showing up for.</em></h2><p>Community events synced from the FSP calendar, with source links preserved so you can always check the original.</p><a href="https://community.fsp.org/calendar/" target="_blank" rel="noreferrer" className="underlined-link">Visit the FSP calendar ↗</a></div>
          <div className="event-list">
            {events.length === 0 ? <div className="event-empty"><span className="calendar-icon">▦</span><div><strong>Upcoming events will appear here</strong><p>The calendar connection is prepared, pending an approved feed URL.</p></div></div> : events.map((event) => <article className="event-card" key={event.id}><div className="event-date">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(event.startsAt))}</div><div><h3>{event.title}</h3><p>{formatDate(event.startsAt)}{event.venue ? ` · ${event.venue}` : ""}{event.city ? `, ${event.city}` : ""}</p></div>{event.url && <a href={event.url} target="_blank" rel="noreferrer" aria-label={`Open ${event.title}`}>↗</a>}</article>)}
          </div>
        </section>

        <section className="principles-section">
          <div><p className="eyebrow">Built on trust</p><h2>Useful without<br /><em>keeping tabs.</em></h2></div>
          <div className="principle-grid"><div><span>01</span><h3>No login to look around</h3><p>Discovery is open. A profile is never the price of admission.</p></div><div><span>02</span><h3>Participation, explained</h3><p>Every entry makes access expectations visible: open, public, invite-only, or unknown.</p></div><div><span>03</span><h3>Local by default</h3><p>Saved interests stay in your browser until you decide otherwise.</p></div></div>
        </section>
      </main>

      <footer><span>PORCUPINE DIRECTORY · NH</span><span>Community-built, source-linked, privacy-minded.</span></footer>

      {showAddForm && <AddListingForm onClose={() => setShowAddForm(false)} onSubmitted={(message) => { setShowAddForm(false); setNotice(message); }} />}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}
    </div>
  );
}

function ListingCard({ listing, saved, onSave }: { listing: Listing; saved: boolean; onSave: () => void }) {
  return <article className="listing-card"><div className="card-top"><span className={`type-label ${listing.kind}`}>{kindLabels[listing.kind]}</span><button className={saved ? "save-button saved" : "save-button"} onClick={onSave} aria-label={saved ? `Remove ${listing.name} from saved` : `Save ${listing.name}`}>{saved ? "★" : "☆"}</button></div><h3>{listing.name}</h3><p>{listing.summary}</p><div className="card-meta"><span>{accessLabels[listing.accessMode]}</span>{listing.location && <span>{listing.location}</span>}</div><div className="tag-row">{listing.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}</div><div className="card-footer"><small>{listing.sourceName}</small>{listing.url && <a href={listing.url} target="_blank" rel="noreferrer">Open ↗</a>}</div></article>;
}

function AddListingForm({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: (message: string) => void }) {
  const [form, setForm] = useState({ kind: "group" as ListingKind, name: "", summary: "", description: "", url: "", location: "", tags: "", accessMode: "unknown" as AccessMode, accessInstructions: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to submit this listing.");
      onSubmitted("Thanks — your entry is queued for community review.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit this listing.");
    } finally { setSubmitting(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title"><div className="modal-heading"><div><p className="eyebrow">Help make the map useful</p><h2 id="add-title">Add a directory entry</h2></div><button className="close-button" onClick={onClose} aria-label="Close">×</button></div><p className="modal-intro">No account needed. New entries stay private to the review queue until a community editor checks them.</p><form onSubmit={submit}><div className="form-grid"><label>What is it?<select value={form.kind} onChange={(event) => update("kind", event.target.value)}>{kindTabs.slice(1).map((tab) => <option key={tab.value} value={tab.value}>{tab.label.slice(0, -1)}</option>)}</select></label><label>Access<select value={form.accessMode} onChange={(event) => update("accessMode", event.target.value)}>{Object.entries(accessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="wide">Name<input required minLength={2} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. a group, channel, or business" /></label><label className="wide">One-line description<textarea required minLength={10} maxLength={280} rows={2} value={form.summary} onChange={(event) => update("summary", event.target.value)} placeholder="What would someone want to know first?" /></label><label>Website or channel link<input type="url" value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://" /></label><label>Town / region<input value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="Optional, keep it broad" /></label><label className="wide">How does someone participate?<textarea rows={2} value={form.accessInstructions} onChange={(event) => update("accessInstructions", event.target.value)} placeholder="Open link, request an invite, attend an event…" /></label><label className="wide">Tags <span className="label-note">comma separated</span><input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="mutual aid, Monadnock, family-friendly" /></label></div>{error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button type="submit" className="button dark" disabled={submitting}>{submitting ? "Sending…" : "Send for review ↗"}</button></div></form></div></div>;
}

export default App;
