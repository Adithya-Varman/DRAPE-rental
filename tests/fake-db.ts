// Minimal chainable stand-in for the supabase-js query builder. Records every call so tests can assert on the
// query that a route built, and resolves to whatever `result` the test set.
export type Call = [method: string, ...args: unknown[]]

export function fakeDb(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const calls: Call[] = []
  const builder: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return builder }
  for (const m of ['from', 'select', 'eq', 'order', 'limit', 'contains', 'insert', 'rpc']) builder[m] = chain(m)
  builder.maybeSingle = (...args: unknown[]) => { calls.push(['maybeSingle', ...args]); return Promise.resolve(state.result) }
  builder.single = (...args: unknown[]) => { calls.push(['single', ...args]); return Promise.resolve(state.result) }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(state.result).then(resolve, reject)
  const state = { result, calls, client: builder }
  return state
}
