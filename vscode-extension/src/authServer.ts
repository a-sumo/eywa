/**
 * Localhost HTTP server for browser-based login.
 * Opens eywa-ai.dev/cli-auth, which POSTs credentials back to a /callback endpoint.
 * Server binds to 127.0.0.1 on a random port and auto-closes after receiving
 * the callback or after a 60-second timeout.
 */
import * as http from "http";

export interface AuthResult {
  supabaseUrl: string;
  supabaseKey: string;
  fold: string;
}

/**
 * Start a temporary localhost server, open the browser to the login page,
 * and wait for credentials to come back via POST /callback.
 * Returns the auth result, or null if the user cancelled / timed out.
 */
export function startLoginFlow(
  openUrl: (url: string) => void,
): Promise<AuthResult | null> {
  return new Promise((resolve) => {
    let settled = false;

    const server = http.createServer((req, res) => {
      // CORS preflight for cross-origin POST from eywa-ai.dev
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        });
        res.end();
        return;
      }

      if (req.method === "POST" && req.url === "/callback") {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          res.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
          });
          res.end(JSON.stringify({ ok: true }));

          try {
            const data = JSON.parse(body) as AuthResult;
            if (data.supabaseUrl && data.supabaseKey && data.fold) {
              finish(data);
            } else {
              finish(null);
            }
          } catch {
            finish(null);
          }
        });
        return;
      }

      // Anything else: 404
      res.writeHead(404);
      res.end();
    });

    function finish(result: AuthResult | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      resolve(result);
    }

    // Timeout after 60 seconds
    const timeout = setTimeout(() => finish(null), 60_000);

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        finish(null);
        return;
      }
      const port = addr.port;
      openUrl(`https://eywa-ai.dev/cli-auth?port=${port}`);
    });
  });
}
