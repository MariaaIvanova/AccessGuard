import { createContext, useContext } from 'react'

export const ThemeContext = createContext({ dark: false, theme: 'light', toggle: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}
