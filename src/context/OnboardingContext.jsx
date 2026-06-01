import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const OnboardingContext = createContext({
  showTour: false,
  start: () => {},
  close: () => {},
  resetAndStart: () => {},
  userId: null,
  role: 'user',
})

const KEY_PREFIX = 'onboarding_completed_v2_'

function getKey(userId) {
  return userId ? KEY_PREFIX + userId : null
}

export function hasCompletedOnboarding(userId) {
  if (typeof localStorage === 'undefined' || !userId) return true
  return localStorage.getItem(getKey(userId)) === 'true'
}

export function markCompleted(userId) {
  if (!userId) return
  localStorage.setItem(getKey(userId), 'true')
}

export function clearCompleted(userId) {
  if (!userId) return
  localStorage.removeItem(getKey(userId))
}

export function useOnboarding() {
  return useContext(OnboardingContext)
}

export function OnboardingProvider({ children }) {
  const [showTour, setShowTour] = useState(false)
  const [userId, setUserId] = useState(null)
  const [role, setRole] = useState('user')

  // Слуша за промени в auth — при login зарежда профила, при logout чисти
  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        setUserId(null)
        setRole('user')
        setShowTour(false)
        return
      }
      setUserId(user.id)
      const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (cancelled) return
      setRole(prof?.role || 'user')

      // Auto-trigger ако новият потребител още не е минал tour-а
      if (!hasCompletedOnboarding(user.id)) {
        window.setTimeout(() => {
          if (!cancelled) setShowTour(true)
        }, 800)
      }
    }

    loadProfile()

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUserId(null)
        setRole('user')
        setShowTour(false)
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        loadProfile()
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  function start() {
    setShowTour(true)
  }
  function close() {
    if (userId) markCompleted(userId)
    setShowTour(false)
  }
  function resetAndStart() {
    if (userId) clearCompleted(userId)
    setShowTour(true)
  }

  return (
    <OnboardingContext.Provider value={{ showTour, start, close, resetAndStart, userId, role }}>
      {children}
    </OnboardingContext.Provider>
  )
}
