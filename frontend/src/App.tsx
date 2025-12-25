import React, { useState } from 'react';
import axios from 'axios';

interface SearchResult {
  title: string;
  url?: string | null;
  snippet: string;
  source: 'duckduckgo' | 'ai' | 'fusion';
  score?: number | null;
}

interface SearchResponse {
  query: string;
  refined_query: string;
  mode: string;
  results: SearchResult[];
  ai_summary: string;
  key_takeaways: string[];
  followup_questions: string[];
  latency_ms: number;
}

interface WebSearchResponse {
  query: string;
  results: SearchResult[];
  latency_ms: number;
}

interface ImageResult {
  title?: string | null;
  url: string;
  thumbnail?: string | null;
  source: string;
}

interface ImageSearchResponse {
  query: string;
  images: ImageResult[];
  latency_ms: number;
}

type SubTabId = 'all' | 'web' | 'ai' | 'insights';

const SUB_TABS: { id: SubTabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'web', label: 'Web' },
  { id: 'ai', label: 'AI' },
  { id: 'insights', label: 'Insights' },
];

interface BrowserTabState {
  id: string;
  title: string;
  query: string;
  activeSubTab: SubTabId;
  webLoading: boolean;
  aiLoading: boolean;
  imageLoading: boolean;
  error: string | null;
  webData: WebSearchResponse | null;
  aiData: SearchResponse | null;
  imageData: ImageSearchResponse | null;
  openUrl: string | null;
}

const createInitialTab = (): BrowserTabState => ({
  id: 'tab-1',
  title: 'New Tab',
  query: '',
  activeSubTab: 'all',
  webLoading: false,
  aiLoading: false,
  imageLoading: false,
  error: null,
  webData: null,
  aiData: null,
  imageData: null,
  openUrl: null,
});

const App: React.FC = () => {
  const [tabs, setTabs] = useState<BrowserTabState[]>([createInitialTab()]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const setActiveTabState = (updater: (prev: BrowserTabState) => BrowserTabState) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? updater(t) : t)));
  };

  const hasResults = !!activeTab.webData && activeTab.webData.results && activeTab.webData.results.length > 0;

  const currentMode: SubTabId = activeTab.activeSubTab === 'insights' ? 'all' : activeTab.activeSubTab;

  const handleSearch = async (e?: React.FormEvent, queryOverride?: string) => {
    if (e) e.preventDefault();
    const effectiveQuery = (queryOverride ?? activeTab.query).trim();
    if (!effectiveQuery) return;

    setActiveTabState((tab) => ({
      ...tab,
      webLoading: true,
      aiLoading: true,
      imageLoading: true,
      error: null,
      webData: null,
      aiData: null,
      imageData: null,
      openUrl: null,
      title: tab.query || effectiveQuery || 'New Tab',
    }));

    // 1) Fast web results
    axios
      .post<WebSearchResponse>('http://localhost:8000/web_search', {
        query: effectiveQuery,
        mode: currentMode,
        max_results: 6,
      })
      .then((resp) => {
        setActiveTabState((tab) => ({ ...tab, webData: resp.data }));
      })
      .catch((err) => {
        console.error(err);
        setActiveTabState((tab) => ({ ...tab, error: 'Something went wrong while fetching web results.' }));
      })
      .finally(() => {
        setActiveTabState((tab) => ({ ...tab, webLoading: false }));
      });

    // 2) AI answer in background
    axios
      .post<SearchResponse>('http://localhost:8000/search', {
        query: effectiveQuery,
        mode: currentMode,
        max_results: 6,
      })
      .then((resp) => {
        setActiveTabState((tab) => ({ ...tab, aiData: resp.data }));
      })
      .catch((err) => {
        console.error(err);
        setActiveTabState((tab) => ({ ...tab, error: 'Something went wrong while generating AI answer.' }));
      })
      .finally(() => {
        setActiveTabState((tab) => ({ ...tab, aiLoading: false }));
      });

    // 3) Image search in background
    axios
      .post<ImageSearchResponse>('http://localhost:8000/image_search', {
        query: effectiveQuery,
        mode: currentMode,
        max_results: 12,
      })
      .then((resp) => {
        setActiveTabState((tab) => ({ ...tab, imageData: resp.data }));
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setActiveTabState((tab) => ({ ...tab, imageLoading: false }));
      });
  };

  const showLanding =
    !hasResults &&
    !activeTab.webLoading &&
    !activeTab.aiLoading &&
    !activeTab.imageLoading &&
    !activeTab.webData &&
    !activeTab.aiData &&
    !activeTab.imageData;

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900">
      {/* Top nav bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-semibold">
            N
          </div>
          <span className="font-semibold text-lg tracking-tight">NovaSearch</span>
        </div>
        <div className="text-xs text-gray-500">Local AI + Web</div>
      </header>

      {/* Browser-like tab strip */}
      <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-gray-50 space-x-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`px-3 py-1 rounded-t-md text-xs border-b-2 transition-colors whitespace-nowrap ${
              tab.id === activeTab.id
                ? 'bg-white border-primary text-primary'
                : 'bg-gray-100 border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.title || 'New Tab'}
          </button>
        ))}
        <button
          onClick={() => {
            const newId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const newTab: BrowserTabState = {
              ...createInitialTab(),
              id: newId,
            };
            setTabs((prev) => [...prev, newTab]);
            setActiveTabId(newId);
          }}
          className="ml-2 px-2 py-1 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-100"
        >
          + New Tab
        </button>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center">
        {showLanding ? (
          <div className="flex-1 flex flex-col items-center justify-center w-full px-4">
            {/* Google-like centered logo + search bar */}
            <div className="mb-8 text-center">
              <div className="text-5xl sm:text-6xl font-semibold tracking-tight mb-1">
                <span className="text-primary">N</span>
                <span className="text-red-500">o</span>
                <span className="text-yellow-500">v</span>
                <span className="text-primary">a</span>
                <span className="text-green-600">S</span>
                <span className="text-red-500">e</span>
                <span className="text-yellow-500">a</span>
                <span className="text-primary">r</span>
                <span className="text-green-600">c</span>
                <span className="text-red-500">h</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">Local AI + DuckDuckGo · Reflexive agent</p>
            </div>

            <form
              onSubmit={handleSearch}
              className="w-full max-w-xl flex flex-col items-stretch space-y-4"
            >
              <div className="flex items-center bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm hover:shadow-md transition-shadow">
                <span className="material-icons text-gray-400 text-base mr-2">search</span>
                <input
                  autoFocus
                  className="flex-1 outline-none text-sm bg-transparent"
                  placeholder="Search with NovaSearch or type a URL"
                  value={activeTab.query}
                  onChange={(e) =>
                    setActiveTabState((tab) => ({
                      ...tab,
                      query: e.target.value,
                    }))
                  }
                />
                <button
                  type="submit"
                  className="ml-2 text-xs px-3 py-1 rounded-full bg-primary text-white font-medium hover:bg-blue-600 transition-colors"
                >
                  Search
                </button>
              </div>

              <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
                <span className="px-2 py-1 rounded-full bg-gray-100">All</span>
                <span className="px-2 py-1 rounded-full bg-gray-100">Web</span>
                <span className="px-2 py-1 rounded-full bg-gray-100">AI</span>
                <span className="px-2 py-1 rounded-full bg-gray-100">Insights</span>
              </div>
            </form>
          </div>
        ) : (
          <div className="w-full max-w-5xl px-4 py-4">
            {/* Search bar condensed at top */}
            <form onSubmit={handleSearch} className="flex items-center mb-3">
              <div className="flex items-center flex-1 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm">
                <input
                  className="flex-1 outline-none text-sm bg-transparent"
                  value={activeTab.query}
                  onChange={(e) =>
                    setActiveTabState((tab) => ({
                      ...tab,
                      query: e.target.value,
                    }))
                  }
                />
                <button
                  type="submit"
                  className="ml-2 text-xs px-3 py-1 rounded-full bg-primary text-white font-medium hover:bg-blue-600 transition-colors"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Tabs */}
            <div className="flex space-x-4 border-b border-gray-200 mb-4 text-sm">
              {SUB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    setActiveTabState((t) => ({
                      ...t,
                      activeSubTab: tab.id,
                    }))
                  }
                  className={`pb-2 border-b-2 -mb-px transition-colors ${
                    activeTab.activeSubTab === tab.id
                      ? 'border-primary text-primary font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab.error && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {activeTab.error}
              </div>
            )}

            {(activeTab.webLoading || activeTab.aiLoading) && (
              <div className="text-xs text-gray-500 mb-2 flex items-center justify-between">
                <span>
                  Searching the web{activeTab.aiLoading ? ' and local AI…' : '…'}
                </span>
                {activeTab.webData && (
                  <span>
                    About {activeTab.webData.results.length} results in ~
                    {Math.round((activeTab.webData.latency_ms || 0) / 1000)}s
                  </span>
                )}
              </div>
            )}

            {(activeTab.webData || activeTab.aiData || activeTab.imageData) && (
              <div className="flex flex-col md:flex-row md:space-x-6">
                {/* Left: results / summary depending on tab */}
                <div className="flex-1 space-y-4 mb-6 md:mb-0">
                  {/* Image strip */}
                  {(activeTab.activeSubTab === 'all' || activeTab.activeSubTab === 'web') &&
                    activeTab.imageData &&
                    activeTab.imageData.images.length > 0 && (
                    <section className="mb-2">
                      <div className="text-xs text-gray-500 mb-1 flex items-center justify-between">
                        <span>Images</span>
                        {activeTab.imageLoading && <span>Loading images…</span>}
                      </div>
                      <div className="flex space-x-2 overflow-x-auto pb-1">
                        {activeTab.imageData.images.slice(0, 12).map((img, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              setActiveTabState((tab) => ({
                                ...tab,
                                openUrl: img.url,
                              }))
                            }
                            className="block w-24 h-16 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 border border-gray-200"
                          >
                            <img
                              src={img.thumbnail || img.url}
                              alt={img.title || activeTab.query}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {activeTab.activeSubTab === 'ai' || activeTab.activeSubTab === 'all' ? (
                    <section className="bg-gray-50 border border-gray-100 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                        <span>AI answer</span>
                        <span>
                          {activeTab.aiData
                            ? `~${Math.round((activeTab.aiData.latency_ms || 0) / 1000)}s · Local model`
                            : activeTab.aiLoading
                            ? 'Loading…'
                            : ''}
                        </span>
                      </div>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {activeTab.aiLoading && !activeTab.aiData && 'Thinking…'}
                        {!activeTab.aiLoading && activeTab.aiData && activeTab.aiData.ai_summary}
                      </div>
                    </section>
                  ) : null}

                  {/* In-tab page view */}
                  {activeTab.openUrl && (
                    <section className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
                        <button
                          type="button"
                          className="px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-100"
                          onClick={() =>
                            setActiveTabState((tab) => ({
                              ...tab,
                              openUrl: null,
                            }))
                          }
                        >
                          ◀ Back to results
                        </button>
                        <span className="truncate flex-1 mx-2">{activeTab.openUrl}</span>
                        <a
                          href={activeTab.openUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Open externally
                        </a>
                      </div>
                      <iframe
                        src={activeTab.openUrl}
                        title="Page preview"
                        className="w-full h-[480px] bg-white"
                      />
                    </section>
                  )}

                  {(activeTab.activeSubTab === 'web' || activeTab.activeSubTab === 'all') &&
                    hasResults &&
                    !activeTab.openUrl && (
                    <section>
                      <div className="text-xs text-gray-500 mb-2">
                        Web results from DuckDuckGo
                      </div>
                      <div className="space-y-4">
                        {activeTab.webData?.results.map((r, idx) => {
                          const displayUrl =
                            r.url ||
                            `https://duckduckgo.com/?q=${encodeURIComponent(r.title || activeTab.query)}`;
                          return (
                          <article key={idx} className="text-sm">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveTabState((tab) => ({
                                  ...tab,
                                  openUrl: displayUrl,
                                }))
                              }
                              className="block text-left text-xs text-green-700 truncate w-full hover:underline"
                            >
                              {displayUrl}
                            </button>
                            <h2 className="text-base text-blue-700 hover:underline">
                              {r.title}
                            </h2>
                            <p className="text-sm text-gray-700 mt-1">{r.snippet}</p>
                          </article>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {activeTab.activeSubTab === 'web' && !hasResults && !activeTab.webLoading && (
                    <p className="text-sm text-gray-500">No web results extracted.</p>
                  )}
                </div>

                {/* Right: insights panel */}
                <aside className="w-full md:w-64 md:flex-shrink-0">
                  <section className="bg-gray-50 border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
                    <h3 className="text-xs font-semibold text-gray-600 mb-2">
                      Key takeaways
                    </h3>
                    {activeTab.aiData && activeTab.aiData.key_takeaways && activeTab.aiData.key_takeaways.length > 0 ? (
                      <ul className="list-disc list-inside text-xs text-gray-700 space-y-1">
                        {activeTab.aiData.key_takeaways.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-500">No takeaways generated.</p>
                    )}
                  </section>

                  <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <h3 className="text-xs font-semibold text-gray-600 mb-2">
                      Suggested follow-ups
                    </h3>
                    {activeTab.aiData &&
                    activeTab.aiData.followup_questions &&
                    activeTab.aiData.followup_questions.length > 0 ? (
                      <ul className="space-y-1">
                        {activeTab.aiData.followup_questions.map((q, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTabState((tab) => ({
                                  ...tab,
                                  query: q,
                                  activeSubTab: 'all',
                                }));
                                handleSearch(undefined, q);
                              }}
                              className="text-xs text-primary hover:underline text-left"
                            >
                              {q}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-500">No follow-ups generated.</p>
                    )}
                  </section>
                </aside>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 text-xs text-gray-500 px-4 py-3 flex items-center justify-between">
        <span>NovaSearch · Local AI Search Engine</span>
        <span>LM Studio + DuckDuckGo · Reflexive agent</span>
      </footer>
    </div>
  );
};

export default App;
