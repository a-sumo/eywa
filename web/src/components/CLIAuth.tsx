import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { supabase, type Fold } from "../lib/supabase";

export function CLIAuth() {
  const { t } = useTranslation("fold");
  const [searchParams] = useSearchParams();
  const callbackPort = searchParams.get("port");
  const [rooms, setRooms] = useState<Fold[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [newSlug, setNewSlug] = useState("");
  const [status, setStatus] = useState<"picking" | "sending" | "done" | "error">("picking");
  const [authorizedRoom, setAuthorizedRoom] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("folds")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setRooms(data);
      setLoading(false);
    })();
  }, []);

  const authorize = async () => {
    if (!callbackPort) {
      setStatus("error");
      return;
    }

    let roomSlug = selected;

    // Create new fold if requested
    if (selected === "__new" && newSlug.trim()) {
      roomSlug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const name = roomSlug.split("-").slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

      const { error } = await supabase.from("folds").insert({
        slug: roomSlug,
        name,
        is_demo: false,
      });
      if (error && !error.message.includes("duplicate")) {
        setStatus("error");
        return;
      }
    }

    if (!roomSlug) return;

    setStatus("sending");

    try {
      const payload = {
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        room: roomSlug,
      };

      await fetch(`http://localhost:${callbackPort}/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setAuthorizedRoom(roomSlug);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  if (!callbackPort) {
    return (
      <div className="cli-auth">
        <div className="cli-auth-card">
          <h1>{t("cliAuth.title")}</h1>
          <p>{t("cliAuth.description")}</p>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="cli-auth">
        <div className="cli-auth-card">
          <div className="cli-auth-check">&#10003;</div>
          <h1>Logged in!</h1>
          <p>You can close this tab and return to your editor, or</p>
          <a className="cli-auth-btn" href={`/rooms/${authorizedRoom}`}>Open Dashboard</a>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="cli-auth">
        <div className="cli-auth-card">
          <h1>Something went wrong</h1>
          <p>Make sure <code>eywa login</code> or the VS Code login flow is still running, then try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cli-auth">
      <div className="cli-auth-card">
        <h1>{t("cliAuth.title")}</h1>
        <p>{t("cliAuth.description")}</p>

        <div className="cli-auth-rooms">
          {loading && <p className="cli-auth-loading">{t("folds.loading")}</p>}
          {rooms.map((r) => (
            <button
              key={r.id}
              className={`cli-auth-room ${selected === r.slug ? "selected" : ""}`}
              onClick={() => setSelected(r.slug)}
            >
              <span className="cli-auth-room-name">{r.name}</span>
              <span className="cli-auth-room-slug">/{r.slug}</span>
            </button>
          ))}
          <button
            className={`cli-auth-room cli-auth-new ${selected === "__new" ? "selected" : ""}`}
            onClick={() => setSelected("__new")}
          >
            + Create new fold
          </button>
        </div>

        {selected === "__new" && (
          <input
            className="cli-auth-input"
            placeholder="fold-slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            autoFocus
          />
        )}

        <button
          className="cli-auth-btn"
          disabled={!selected || (selected === "__new" && !newSlug.trim()) || status === "sending"}
          onClick={authorize}
        >
          {status === "sending" ? "Connecting..." : "Authorize"}
        </button>
      </div>
    </div>
  );
}
