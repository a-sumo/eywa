/**
 * Thin fetch wrapper for Supabase PostgREST API.
 * No SDK dependency — just HTTP calls with the service key.
 */

export class SupabaseClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(url: string, key: string) {
    // PostgREST endpoint is at /rest/v1
    this.baseUrl = `${url}/rest/v1`;
    this.apiKey = key;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  /**
   * SELECT query against a table.
   * @param table  Table name
   * @param params PostgREST query params (select, order, limit, and filters like agent=eq.alpha)
   * @returns      Parsed JSON array of rows
   */
  async select<T = Record<string, unknown>>(
    table: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${this.baseUrl}/${table}?${qs}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase select ${table} failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<T[]>;
  }

  /**
   * INSERT one row into a table.
   * @param table Table name
   * @param row   Object to insert
   * @returns     Inserted row(s)
   */
  async insert<T = Record<string, unknown>>(
    table: string,
    row: Record<string, unknown>,
  ): Promise<T[]> {
    const res = await fetch(`${this.baseUrl}/${table}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase insert ${table} failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<T[]>;
  }

  /**
   * DELETE rows matching PostgREST filters.
   * @param table   Table name
   * @param filters PostgREST filter params (e.g. { id: "eq.abc", room_id: "eq.xyz" })
   */
  async delete(
    table: string,
    filters: Record<string, string>,
  ): Promise<void> {
    const qs = new URLSearchParams(filters).toString();
    const res = await fetch(`${this.baseUrl}/${table}?${qs}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase delete ${table} failed (${res.status}): ${body}`);
    }
  }
}
