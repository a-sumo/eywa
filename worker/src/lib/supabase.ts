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
   * @param filters PostgREST filter params (e.g. { id: "eq.abc", fold_id: "eq.xyz" })
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

  /**
   * UPDATE rows matching PostgREST filters.
   * @param table   Table name
   * @param filters PostgREST filter params
   * @param updates Object with column values to update
   * @returns       Updated row(s)
   */
  async update<T = Record<string, unknown>>(
    table: string,
    filters: Record<string, string>,
    updates: Record<string, unknown>,
  ): Promise<T[]> {
    const qs = new URLSearchParams(filters).toString();
    const res = await fetch(`${this.baseUrl}/${table}?${qs}`, {
      method: "PATCH",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase update ${table} failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<T[]>;
  }

  /**
   * UPSERT a row (insert or update on conflict).
   * @param table      Table name
   * @param row        Object to upsert
   * @param onConflict Comma-separated column names for conflict resolution
   * @returns          Upserted row(s)
   */
  /**
   * INSERT multiple rows into a table.
   * @param table Table name
   * @param rows  Array of objects to insert
   * @returns     Inserted rows
   */
  async insertMany<T = Record<string, unknown>>(
    table: string,
    rows: Record<string, unknown>[],
  ): Promise<T[]> {
    const res = await fetch(`${this.baseUrl}/${table}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase insertMany ${table} failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<T[]>;
  }

  /**
   * COUNT rows matching filters using HEAD + Prefer: count=exact.
   * Returns the count from the Content-Range header.
   */
  async count(
    table: string,
    filters: Record<string, string>,
  ): Promise<number> {
    const qs = new URLSearchParams({ select: "id", ...filters }).toString();
    const res = await fetch(`${this.baseUrl}/${table}?${qs}`, {
      method: "HEAD",
      headers: this.headers({ Prefer: "count=exact" }),
    });
    // Content-Range: 0-N/TOTAL or */TOTAL
    const range = res.headers.get("content-range") || "";
    const match = range.match(/\/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async upsert<T = Record<string, unknown>>(
    table: string,
    row: Record<string, unknown>,
    onConflict: string,
  ): Promise<T[]> {
    const res = await fetch(`${this.baseUrl}/${table}`, {
      method: "POST",
      headers: this.headers({
        Prefer: `return=representation,resolution=merge-duplicates`,
        "on-conflict": onConflict,
      }),
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase upsert ${table} failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<T[]>;
  }
}
