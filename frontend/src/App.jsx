import React, { useEffect, useMemo, useState } from "react";

const fallbackArticles = [];

function formatDate(dateString) {
  if (!dateString) return "Unknown date";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function timeAgo(dateString) {
  if (!dateString) return "Unknown";
  const now = new Date();
  const then = new Date(dateString);
  const diffMs = now - then;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function App() {
  const [articles, setArticles] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("All");
  const [selectedSource, setSelectedSource] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadArticles() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/latest_cyber_news.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setArticles(Array.isArray(data) ? data : fallbackArticles);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Could not load live JSON feed yet.");
          setArticles(fallbackArticles);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadArticles();
    return () => {
      cancelled = true;
    };
  }, []);

  const allTags = useMemo(() => {
    const tags = new Set();
    articles.forEach((article) => {
      (article.tags || []).forEach((tag) => tags.add(tag));
    });
    return ["All", ...Array.from(tags).sort((a, b) => a.localeCompare(b))];
  }, [articles]);

  const allSources = useMemo(() => {
    const sources = new Set(
      articles.map((article) => article.feed_title).filter(Boolean)
    );
    return ["All", ...Array.from(sources).sort((a, b) => a.localeCompare(b))];
  }, [articles]);

  const filteredArticles = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...articles]
      .filter((article) => {
        const matchesSearch =
          !query ||
          article.title?.toLowerCase().includes(query) ||
          article.summary?.toLowerCase().includes(query) ||
          article.feed_title?.toLowerCase().includes(query) ||
          (article.tags || []).some((tag) => tag.toLowerCase().includes(query));

        const matchesTag =
          selectedTag === "All" || (article.tags || []).includes(selectedTag);

        const matchesSource =
          selectedSource === "All" || article.feed_title === selectedSource;

        return matchesSearch && matchesTag && matchesSource;
      })
      .sort((a, b) => {
        const aTime = a.published_eastern ? new Date(a.published_eastern).getTime() : 0;
        const bTime = b.published_eastern ? new Date(b.published_eastern).getTime() : 0;
        return bTime - aTime;
      });
  }, [articles, search, selectedTag, selectedSource]);

  const stats = useMemo(() => {
    const total = articles.length;
    const sources = new Set(articles.map((a) => a.feed_title).filter(Boolean)).size;
    const today = new Date();
    const todayCount = articles.filter((article) => {
      if (!article.published_eastern) return false;
      const d = new Date(article.published_eastern);
      return d.toDateString() === today.toDateString();
    });

    return {
      total,
      sources,
      todayCount: todayCount.length,
    };
  }, [articles]);

  return (
    <div className="page-shell">
      <div className="container">
        <header className="hero">
          <div>
            <div className="eyebrow">Cyber Intel Feed</div>
            <h1>Latest cybersecurity news in one place</h1>
            <p>
              A local web app powered by your Python RSS aggregation script.
              Search, filter by source or tags, and review the latest cyber
              intelligence stories.
            </p>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span>Articles</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="stat-card">
              <span>Sources</span>
              <strong>{stats.sources}</strong>
            </div>
            <div className="stat-card">
              <span>Published today</span>
              <strong>{stats.todayCount}</strong>
            </div>
          </div>
        </header>

        <section className="toolbar card">
          <div className="toolbar-grid">
            <div>
              <label className="label">Search</label>
              <input
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search titles, summaries, feeds, or tags"
              />
            </div>

            <div>
                <label className="label">Source</label>
                <select
                    className="search-input"
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                >
                    {allSources.map((source) => (
                        <option key={source} value={source}>
                            {source}
                        </option>
                    ))}
                </select>
            </div>

            <div>
              <label className="label">Tag</label>
              <div className="chips">
                {allTags.slice(0, 18).map((tag) => (
                  <button
                    key={tag}
                    className={`chip ${selectedTag === tag ? "chip-active" : ""}`}
                    onClick={() => setSelectedTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="empty-state card">Loading cyber intel feed...</div>
        ) : (
          <>
            {error ? <div className="warning">{error}</div> : null}

            <div className="results-bar">
              <span>
                Showing <strong>{filteredArticles.length}</strong> articles
              </span>
              <span>Refresh by rerunning the Python script</span>
            </div>

            <section className="articles-grid">
              {filteredArticles.map((article) => (
                <article key={article.id} className="article-card card">
                  <div className="article-top-row">
                    <span className="source-badge">
                      {article.feed_title || "Unknown source"}
                    </span>
                    <span className="time-ago">
                      {timeAgo(article.published_eastern)}
                    </span>
                  </div>

                  <div className="chips">
                    {(article.tags || []).slice(0, 8).map((tag) => (
                      <button
                        key={`${article.id}-${tag}`}
                        className="chip"
                        onClick={() => setSelectedTag(tag)}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>

                  <div className="article-footer">
                    <span>{formatDate(article.published_eastern)}</span>
                    <a href={article.link} target="_blank" rel="noreferrer">
                      Open article
                    </a>
                  </div>
                </article>
              ))}
            </section>

            {filteredArticles.length === 0 ? (
              <div className="empty-state card">
                <h3>No articles match your filters</h3>
                <p>Try clearing your search or switching back to all tags and all sources.</p>
                <div className="chips center-row">
                  <button className="chip" onClick={() => setSearch("")}>
                    Clear search
                  </button>
                  <button className="chip" onClick={() => setSelectedTag("All")}>
                    All tags
                  </button>
                  <button className="chip" onClick={() => setSelectedSource("All")}>
                    All sources
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}