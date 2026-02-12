import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "../lib/i18n";

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = supportedLanguages.find((l) => l.code === i18n.language) ?? supportedLanguages[0];

  return (
    <div className="language-selector" ref={ref}>
      <button
        className="language-selector-trigger"
        onClick={() => setOpen(!open)}
        aria-label="Select language"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{current.native}</span>
      </button>
      {open && (
        <div className="language-selector-dropdown">
          {supportedLanguages.map((lang) => (
            <button
              key={lang.code}
              className={`language-selector-option${lang.code === i18n.language ? " active" : ""}`}
              onClick={() => {
                i18n.changeLanguage(lang.code);
                setOpen(false);
              }}
            >
              <span className="language-selector-native">{lang.native}</span>
              <span className="language-selector-name">{lang.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
