import { useState } from "react";

const GITHUB_SNAPSHOT = "https://github.com/a-sumo/eywa/tree/060a6dc";
const SUBMITTED_DEPLOY = "https://www.eywa-ai.dev/f/demo-71wb";

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
            href={SUBMITTED_DEPLOY}
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
            a deadline of Feb 10, 2026 at 2:00 AM CET. The "Submitted" link shows the
            hackathon demo fold with the original agent data. "Latest" is the current live build.
            Source code at submission: <a href={GITHUB_SNAPSHOT} target="_blank" rel="noopener noreferrer">GitHub (060a6dc)</a>.
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
