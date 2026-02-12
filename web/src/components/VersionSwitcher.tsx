import { useState } from "react";

const SNAPSHOT_URL = "https://web-h2gi4fi41-remix-1f516f57.vercel.app";
const GITHUB_SNAPSHOT = "https://github.com/a-sumo/eywa/tree/060a6dc";

export function VersionSwitcher() {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="version-switcher">
      <div className="version-switcher-inner">
        <button
          className="version-info-btn"
          onClick={() => setShowInfo(!showInfo)}
          aria-label="Why is this here?"
        >
          ?
        </button>

        <div className="version-tabs">
          <a
            href={SNAPSHOT_URL}
            className="version-tab"
          >
            Submitted Feb 10
          </a>
          <span className="version-tab version-tab-active">
            Latest
          </span>
        </div>

        <a
          href={GITHUB_SNAPSHOT}
          target="_blank"
          rel="noopener noreferrer"
          className="version-github-link"
          title="View submitted source on GitHub"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </div>

      {showInfo && (
        <div className="version-info-panel">
          <p>
            This project was submitted to the <strong>Gemini 3 Hackathon</strong> with
            a deadline of Feb 10, 2026 at 2:00 AM CET. The "Submitted" tab shows the
            exact version that was live at the deadline. "Latest" is the current build
            with ongoing improvements.
          </p>
          <button
            className="version-info-close"
            onClick={() => setShowInfo(false)}
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
