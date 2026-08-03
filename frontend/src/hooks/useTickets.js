import { useEffect, useState } from 'react'

import { getTickets } from '../api/apiClient'

export function useTickets(pollIntervalMs = 5000) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function refreshTickets() {
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

    refreshTickets()
    const intervalId = window.setInterval(refreshTickets, pollIntervalMs)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
    }
  }, [pollIntervalMs])

  return { error, loading, tickets, refresh: getTickets }
}
