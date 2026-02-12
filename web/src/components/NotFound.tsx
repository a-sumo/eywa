import { Link, useLocation } from "react-router-dom";

export function NotFound() {
  const { pathname } = useLocation();

  return (
    <div style={{
      maxWidth: 480,
      margin: "120px auto",
      textAlign: "center",
      padding: "0 24px",
    }}>
      <h1 style={{
        fontSize: "3rem",
        fontFamily: "var(--font-display)",
        color: "var(--text-primary)",
        marginBottom: 8,
      }}>
        404
      </h1>
      <p style={{
        color: "var(--text-secondary)",
        fontSize: "1.1rem",
        marginBottom: 8,
      }}>
        Nothing here at <code style={{ color: "var(--text-tertiary)" }}>{pathname}</code>
      </p>
      <p style={{
        color: "var(--text-tertiary)",
        fontSize: "0.9rem",
        marginBottom: 32,
      }}>
        The page might have moved, or the URL could be wrong.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Link
          to="/"
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            background: "var(--surface-secondary)",
            color: "var(--text-primary)",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          Home
        </Link>
        <Link
          to="/rooms"
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            background: "var(--surface-secondary)",
            color: "var(--text-primary)",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          Rooms
        </Link>
        <Link
          to="/docs"
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            background: "var(--surface-secondary)",
            color: "var(--text-primary)",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          Docs
        </Link>
      </div>
    </div>
  );
}
