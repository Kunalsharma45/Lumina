import { useEffect, useState } from 'react'

import { getTickets } from '../api/apiClient'

export function useTickets(pollIntervalMs = 5000) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshTickets = async () => {
    try {
      setError('')
      const response = await getTickets()
      setTickets(response.tickets || [])
      setLoading(false)
      return response
    } catch (requestError) {
      setError(requestError.message || 'Failed to load tickets')
      setLoading(false)
      throw requestError
    }
  }

  useEffect(() => {
    let mounted = true

    async function initialFetch() {
      try {
        setError('')
        const response = await getTickets()
        if (mounted) {
          setTickets(response.tickets || [])
          setLoading(false)
        }
      } catch (requestError) {
        if (mounted) {
          setError(requestError.message || 'Failed to load tickets')
          setLoading(false)
        }
      }
    }

    initialFetch()
    const intervalId = window.setInterval(initialFetch, pollIntervalMs)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
    }
  }, [pollIntervalMs])

  return { error, loading, tickets, refresh: refreshTickets }
}
