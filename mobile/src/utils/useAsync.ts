import { useCallback, useEffect, useState } from 'react'

interface State<T> {
  data: T | null
  loading: boolean
  error: unknown
}

/**
 * Runs an async loader, exposing refresh for pull-to-refresh. `deps` behaves
 * like a `useEffect` dependency list: change them and the loader re-runs.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null })
  const [refreshing, setRefreshing] = useState(false)

  // The loader closure is rebuilt on every render; deps decide when to re-run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true)
      else setState((prev) => ({ ...prev, loading: true }))
      try {
        const data = await run()
        setState({ data, loading: false, error: null })
      } catch (error) {
        setState({ data: null, loading: false, error })
      } finally {
        setRefreshing(false)
      }
    },
    [run],
  )

  useEffect(() => {
    void load()
  }, [load])

  return {
    ...state,
    refreshing,
    refresh: useCallback(() => load(true), [load]),
    reload: useCallback(() => load(false), [load]),
  }
}
