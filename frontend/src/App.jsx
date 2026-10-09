import { useState } from "react";
import axios from "axios";
import QRCode from "qrcode";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "")
).replace(/\/$/, "");

const toLocalDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Never";

const getError = (error, fallback) =>
  error.response?.data?.error || fallback;

function App() {
  const [url, setUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [shortLink, setShortLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [publicSearchId, setPublicSearchId] = useState("");
  const [publicStats, setPublicStats] = useState(null);
  const [publicStatsLoading, setPublicStatsLoading] = useState(false);
  const [publicStatsError, setPublicStatsError] = useState("");

  const refreshShortLinkStats = async () => {
    if (!shortLink?.shortId) return;
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/urls/${shortLink.shortId}/stats`);
      setShortLink((prev) => (prev ? { ...prev, ...data } : null));
    } catch {
      // Keep existing shortLink if refresh fails silently
    }
  };

  const fetchPublicStats = async (event) => {
    event?.preventDefault();
    if (!publicSearchId.trim()) return;

    setPublicStatsLoading(true);
    setPublicStatsError("");
    setPublicStats(null);

    const rawInput = publicSearchId.trim();
    const shortId = rawInput.includes("/") ? rawInput.split("/").filter(Boolean).pop() : rawInput;

    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/urls/${shortId}/stats`);
      setPublicStats(data);
    } catch (requestError) {
      setPublicStatsError(getError(requestError, "Short link not found. Check the URL or ID and try again."));
    } finally {
      setPublicStatsLoading(false);
    }
  };

  const shortenUrl = async (event) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setNotice("");
    setShortLink(null);
    setCopied(false);
    setLoading(true);

    try {
      const expiration = expiresAt ? new Date(expiresAt).toISOString() : null;
      const { data } = await axios.post(`${API_BASE_URL}/api/urls`, {
        originalUrl: url.trim(),
        expiresAt: expiration,
      });
      const qrImage = await QRCode.toDataURL(data.shortUrl, {
        width: 220,
        margin: 1,
        color: { dark: "#10213a", light: "#ffffff" },
      });
      setShortLink({ ...data, qrImage });
      setUrl("");
      setExpiresAt("");
      setNotice("Your short link is ready.");
    } catch (requestError) {
      setError(getError(requestError, "Could not create the short link. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy is unavailable in this browser. Select and copy the link instead.");
    }
  };

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="site-brand" href="/" aria-label="Linkdrop home">
          <span className="brand-mark"><img src="/url.svg" alt="" /></span>
          <span>linkdrop</span>
        </a>
        <span className="header-note">Simple links. Clear stats.</span>
      </header>

      <section className="shortener-card" aria-labelledby="page-title">
        <p className="eyebrow">SHORT LINKS, MADE SIMPLE</p>
        <h1 id="page-title">Make your link <span>shareable.</span></h1>
        <p className="intro">Paste a long URL and get a short link with a ready-to-scan QR code.</p>

        <form className="url-form" onSubmit={shortenUrl}>
          <label className="sr-only" htmlFor="long-url">Long URL</label>
          <input
            id="long-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com/your-long-link"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
            }}
            required
            maxLength={2048}
          />
          <button type="submit" disabled={loading || !url.trim()}>
            {loading ? <><span className="spinner" aria-hidden="true" /> Creating…</> : "Shorten URL"}
          </button>
        </form>

        <div className="expiry-input">
          <label htmlFor="expiry">Expiration <span>Optional</span></label>
          <input
            id="expiry"
            type="datetime-local"
            min={toLocalDateTime(Date.now() + 60000)}
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
          <small>Leave blank for a link that never expires.</small>
        </div>

        {error && <p className="message error-message" role="alert">{error}</p>}
        {notice && <p className="message success-message" role="status">{notice}</p>}

        {shortLink && (
          <section className="result" aria-live="polite" aria-label="Your short link">
            <div className="result-copy">
              <p className="result-label">YOUR SHORT LINK</p>
              <a href={shortLink.shortUrl} target="_blank" rel="noopener noreferrer">{shortLink.shortUrl}</a>
              <div className="result-actions">
                <button className="copy-button" type="button" onClick={() => copyText(shortLink.shortUrl)}>
                  {copied ? "Copied" : "Copy link"}
                </button>
                <button className="small-secondary" type="button" onClick={refreshShortLinkStats}>
                  🔄 Refresh Clicks ({shortLink.clicks ?? 0})
                </button>
              </div>
              <p className="result-expiration">
                {shortLink.expiresAt ? `Expires ${formatDate(shortLink.expiresAt)}` : "Never expires"}
              </p>
            </div>
            <div className="qr-panel">
              <img src={shortLink.qrImage} alt={`QR code for ${shortLink.shortUrl}`} width="160" height="160" />
              <a href={shortLink.qrImage} download="short-link-qr.png">Download QR</a>
            </div>
          </section>
        )}
      </section>

      <section className="stats-lookup-card" aria-labelledby="stats-lookup-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PUBLIC LINK CHECKER</p>
            <h2 id="stats-lookup-title">Check Link Stats</h2>
          </div>
        </div>
        <p className="lookup-intro">No password required. Enter any short link or short code to view its click analytics.</p>
        <form className="lookup-form" onSubmit={fetchPublicStats}>
          <input
            type="text"
            placeholder="e.g. http://localhost:5000/AbCd123 or AbCd123"
            value={publicSearchId}
            onChange={(e) => setPublicSearchId(e.target.value)}
            required
          />
          <button type="submit" disabled={publicStatsLoading || !publicSearchId.trim()}>
            {publicStatsLoading ? "Checking…" : "Check Stats"}
          </button>
        </form>

        {publicStatsError && <p className="message error-message">{publicStatsError}</p>}

        {publicStats && (
          <div className="public-stats-result">
            <div className="public-stats-header">
              <div>
                <a href={publicStats.shortUrl} target="_blank" rel="noopener noreferrer" className="managed-short-url">
                  {publicStats.shortUrl}
                </a>
                <p className="destination-url" title={publicStats.originalUrl}>{publicStats.originalUrl}</p>
              </div>
              <span className={`status-pill ${publicStats.status}`}>{publicStats.status}</span>
            </div>
            <div className="stats-badge-grid">
              <div className="stat-badge">
                <span>Total Clicks</span>
                <strong>{publicStats.clicks}</strong>
              </div>
              <div className="stat-badge">
                <span>Created</span>
                <strong>{formatDate(publicStats.createdAt)}</strong>
              </div>
              <div className="stat-badge">
                <span>Expiration</span>
                <strong>{publicStats.expiresAt ? formatDate(publicStats.expiresAt) : "Never"}</strong>
              </div>
            </div>
          </div>
        )}
      </section>

      <footer className="page-caption">Links are saved securely in your MongoDB database.</footer>
    </main>
  );
}

export default App;
