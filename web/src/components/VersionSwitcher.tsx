import { useState } from "react";

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
            href={GITHUB_SNAPSHOT}
            target="_blank"
            rel="noopener noreferrer"
            className="version-tab"
          >
            Submitted Feb 10
          </a>
          <span className="version-tab version-tab-active">
            Latest
          </span>
        </div>
      </div>

      {showInfo && (
        <div className="version-info-panel">
          <p>
            This project was submitted to the <strong>Gemini 3 Hackathon</strong> with
            a deadline of Feb 10, 2026 at 2:00 AM CET. The "Submitted" link points to
            the exact source code on GitHub. "Latest" is the current live build.
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
