import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, type Room } from "../lib/supabase";

export function CLIAuth() {
  const [searchParams] = useSearchParams();
  const callbackPort = searchParams.get("port");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [newSlug, setNewSlug] = useState("");
  const [status, setStatus] = useState<"picking" | "sending" | "done" | "error">("picking");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("rooms")
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

    // Create new room if requested
    if (selected === "__new" && newSlug.trim()) {
      roomSlug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const name = roomSlug.split("-").slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

      const { error } = await supabase.from("rooms").insert({
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

      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  if (!callbackPort) {
    return (
      <div className="cli-auth">
        <div className="cli-auth-card">
          <h1>CLI Auth</h1>
          <p>This page is opened by <code>eywa login</code>. Run it from your terminal first.</p>
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
          <p>You can close this tab and return to your terminal.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="cli-auth">
        <div className="cli-auth-card">
          <h1>Something went wrong</h1>
          <p>Make sure <code>eywa login</code> is still running in your terminal, then try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cli-auth">
      <div className="cli-auth-card">
        <h1>Authorize Eywa CLI</h1>
        <p>Select a room to connect your terminal to:</p>

        <div className="cli-auth-rooms">
          {loading && <p className="cli-auth-loading">Loading rooms...</p>}
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
            + Create new room
          </button>
        </div>

        {selected === "__new" && (
          <input
            className="cli-auth-input"
            placeholder="room-slug"
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
