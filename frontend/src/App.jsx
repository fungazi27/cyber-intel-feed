import React, { useEffect, useMemo, useRef, useState } from "react";

const fallbackArticles = [];
const ITEMS_PER_PAGE = 10;

function formatDate(dateString) {
  if (!dateString) return "Unknown date";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function timeAgo(dateString) {
  if (!dateString) return "Unknown";

  const now = new Date();
  const then = new Date(dateString);

  if (Number.isNaN(then.getTime())) return "Unknown";

  const diffMs = now - then;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getFilterLabel(baseLabel, selectedItems) {
  if (selectedItems.length === 0) return `All ${baseLabel}`;
  if (selectedItems.length === 1) return selectedItems[0];
  return `${selectedItems.length} selected`;
}

function useOutsideClick(ref, handler) {
  useEffect(() => {
    function handleClick(event) {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler();
    }

    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [ref, handler]);
}

function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  setSelectedValues,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useOutsideClick(dropdownRef, () => setIsOpen(false));

  function toggleValue(value) {
    setSelectedValues((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  }

  function clearAll() {
    setSelectedValues([]);
  }

  return (
    <div className="dropdown-wrapper" ref={dropdownRef}>
      <label className="label">{label}</label>

      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span>{getFilterLabel(label, selectedValues)}</span>
        <span className={`dropdown-caret ${isOpen ? "dropdown-caret-open" : ""}`}>
          ▾
        </span>
      </button>

      {isOpen ? (
        <div className="dropdown-menu">
          <div className="dropdown-menu-header">
            <span className="dropdown-menu-title">{label}</span>
            <button type="button" className="dropdown-clear" onClick={clearAll}>
              Clear
            </button>
          </div>

          <div className="dropdown-options">
            {options.length === 0 ? (
              <div className="dropdown-empty">No options available</div>
            ) : (
              options.map((option) => (
                <label key={option} className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option)}
                    onChange={() => toggleValue(option)}
                  />
                  <span>{option}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const [articles, setArticles] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [openTags, setOpenTags] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadArticles() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/latest_cyber_news.json", {
          cache: "no-store",
        });

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
        if (!cancelled) {
          setLoading(false);
        }
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

    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [articles]);

  const allSources = useMemo(() => {
    const sources = new Set(
      articles.map((article) => article.feed_title).filter(Boolean)
    );

    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }, [articles]);

  const filteredArticles = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...articles]
      .filter((article) => {
        const matchesSearch =
          !query ||
          article.title?.toLowerCase().includes(query) ||
          article.feed_title?.toLowerCase().includes(query) ||
          (article.tags || []).some((tag) => tag.toLowerCase().includes(query));

        const matchesTags =
          selectedTags.length === 0 ||
          selectedTags.some((tag) => (article.tags || []).includes(tag));

        const matchesSources =
          selectedSources.length === 0 ||
          selectedSources.includes(article.feed_title);

        return matchesSearch && matchesTags && matchesSources;
      })
      .sort((a, b) => {
        const aTime = a.published_eastern
          ? new Date(a.published_eastern).getTime()
          : 0;
        const bTime = b.published_eastern
          ? new Date(b.published_eastern).getTime()
          : 0;
        return bTime - aTime;
      });
  }, [articles, search, selectedTags, selectedSources]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredArticles.length / ITEMS_PER_PAGE)
  );

  useEffect(() => {
    setPage(1);
  }, [search, selectedTags, selectedSources]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedArticles = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    return filteredArticles.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredArticles, page]);

  function toggleTags(articleId) {
    setOpenTags((prev) => ({
      ...prev,
      [articleId]: !prev[articleId],
    }));
  }

  return (
    <div className="page-shell">
      <div className="container">
        <header className="hero">
          <div>
            <div className="eyebrow">Cyber Intel Feed</div>
            <h1>Latest cybersecurity news in one place</h1>
            <div style={{ height: "8px" }} />
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
                placeholder="Search titles, feeds, or tags"
              />
            </div>

            <MultiSelectDropdown
              label="Sources"
              options={allSources}
              selectedValues={selectedSources}
              setSelectedValues={setSelectedSources}
            />

            <MultiSelectDropdown
              label="Tags"
              options={allTags}
              selectedValues={selectedTags}
              setSelectedValues={setSelectedTags}
            />
          </div>
        </section>

        {loading ? (
          <div className="empty-state card">Loading cyber intel feed...</div>
        ) : (
          <>
            {error ? <div className="warning">{error}</div> : null}

            <div className="results-bar">
              <span>
                Showing <strong>{paginatedArticles.length}</strong> of{" "}
                <strong>{filteredArticles.length}</strong> articles
              </span>
              <span>Refresh by rerunning the Python script</span>
            </div>

            <section className="articles-grid">
              {paginatedArticles.map((article) => (
                <article key={article.id} className="article-card card">
                  <div className="article-top-row">
                    <span className="source-badge">
                      {article.feed_title || "Unknown source"}
                    </span>

                    <span className="time-ago">
                      {timeAgo(article.published_eastern)}
                    </span>
                  </div>

                  <h2>
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noreferrer"
                      className="article-title-link"
                    >
                      {article.title}
                    </a>
                  </h2>

                  <button
                    type="button"
                    className="tags-toggle"
                    onClick={() => toggleTags(article.id)}
                  >
                    {openTags[article.id] ? "Hide tags" : "Click here for tags"}
                  </button>

                  {openTags[article.id] ? (
                    <div className="chips">
                      {(article.tags || []).slice(0, 8).map((tag) => (
                        <button
                          key={`${article.id}-${tag}`}
                          className="chip"
                          onClick={() =>
                            setSelectedTags((prev) =>
                              prev.includes(tag) ? prev : [...prev, tag]
                            )
                          }
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="article-footer">
                    <span>{formatDate(article.published_eastern)}</span>
                  </div>
                </article>
              ))}
            </section>

            <div className="pagination card">
              <div className="pagination-text">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
              </div>

              <div className="pagination-actions">
                <button
                  className="chip"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>

                <button
                  className="chip"
                  onClick={() =>
                    setPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            </div>

            {filteredArticles.length === 0 ? (
              <div className="empty-state card">
                <h3>No articles match your filters</h3>
                <p>
                  Try clearing the search text or removing some selected tags
                  and sources.
                </p>

                <div className="chips center-row">
                  <button className="chip" onClick={() => setSearch("")}>
                    Clear search
                  </button>

                  <button className="chip" onClick={() => setSelectedTags([])}>
                    Clear tags
                  </button>

                  <button
                    className="chip"
                    onClick={() => setSelectedSources([])}
                  >
                    Clear sources
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