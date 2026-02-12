import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "../lib/i18n";

const FLAG_BASE = "https://flagcdn.com/w40";
const flagMap: Record<string, string> = {
  en: `${FLAG_BASE}/us.png`,
  ja: `${FLAG_BASE}/jp.png`,
  zh: `${FLAG_BASE}/cn.png`,
  hi: `${FLAG_BASE}/in.png`,
  es: `${FLAG_BASE}/es.png`,
  fr: `${FLAG_BASE}/fr.png`,
  ar: `${FLAG_BASE}/sa.png`,
};

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
        <img
          src={flagMap[current.code]}
          alt={current.name}
          className="language-flag"
          width={24}
          height={16}
        />
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
              <img
                src={flagMap[lang.code]}
                alt={lang.name}
                className="language-flag"
                width={24}
                height={16}
              />
              <span className="language-selector-native">{lang.native}</span>
              <span className="language-selector-name">{lang.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
