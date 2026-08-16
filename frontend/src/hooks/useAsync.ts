import { useCallback, useEffect, useRef, useState } from 'react'

import { parseApiError } from '@/services/api'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Runs an async loader, tracking loading/error state and skipping the state
 * update if the component unmounted or a newer call superseded this one.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)
  const callId = useRef(0)

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    const current = ++callId.current
    setState((previous) => ({ ...previous, loading: true, error: null }))

    loader()
      .then((data) => {
        if (current === callId.current) {
          setState({ data, loading: false, error: null })
        }
      })
      .catch((error: unknown) => {
        if (current === callId.current) {
          setState({ data: null, loading: false, error: parseApiError(error).detail })
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { ...state, reload }
}

/** Debounces a fast changing value - used for the search inputs. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}
