const PAGE_SIZE = 1000

/**
 * PostgREST caps unbounded selects at 1000 rows by default. Anything that
 * needs a full table (or full sport-scoped slice) client-side — the game
 * engine builds its graph from the whole `players`/`memberships` set — must
 * page through explicitly rather than relying on a single unbounded select.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}
