import { useEffect, useRef } from 'react'
import { BRAND_LOADER_PONY } from '../branding'
import { useTheme } from './ThemeContext'
import './AppLoader.css'
import {
  appLoaderStyles,
  getContentStyle,
  getOrbitWrapStyle,
  getPrimaryMessageStyle,
  getSpinnerStyle,
  orbitAnchorStyle,
  orbitTrackStyle,
  ponyCounterStyle,
  ponyImageStyle,
  ponyWrapStyle,
  shadowStyle,
} from './AppLoader.styles'

function scheduleHoofbeat(audioContext) {
  const start = audioContext.currentTime + 0.03
  const beats = [0, 0.14, 0.42, 0.56]

  beats.forEach((offset, index) => {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(index % 2 === 0 ? 180 : 145, start + offset)
    oscillator.frequency.exponentialRampToValueAtTime(92, start + offset + 0.08)

    gain.gain.setValueAtTime(0.0001, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.02, start + offset + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.09)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)

    oscillator.start(start + offset)
    oscillator.stop(start + offset + 0.1)
  })
}

export default function AppLoader({ message = 'Зареждане...' }) {
  const { theme } = useTheme()
  const audioRef = useRef(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (theme !== 'pink') return undefined

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return undefined

    const audioContext = new AudioContextClass()
    audioRef.current = audioContext

    const playPattern = async () => {
      try {
        if (audioContext.state === 'suspended') {
          await audioContext.resume()
        }

        scheduleHoofbeat(audioContext)
      } catch {
        // Some browsers block autoplay audio until a user interaction.
      }
    }

    void playPattern()
    intervalRef.current = window.setInterval(() => {
      void playPattern()
    }, 1200)

    const retryPlayback = () => {
      void playPattern()
    }

    window.addEventListener('pointerdown', retryPlayback)
    window.addEventListener('keydown', retryPlayback)
    window.addEventListener('touchstart', retryPlayback, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', retryPlayback)
      window.removeEventListener('keydown', retryPlayback)
      window.removeEventListener('touchstart', retryPlayback)

      if (intervalRef.current) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      if (audioRef.current) {
        void audioRef.current.close()
        audioRef.current = null
      }
    }
  }, [theme])

  const isPinkTheme = theme === 'pink'

  return (
    <div style={appLoaderStyles.container}>
      <div style={getContentStyle(isPinkTheme)}>
        <div style={getOrbitWrapStyle(isPinkTheme)}>
          <div style={getSpinnerStyle(isPinkTheme)} />

          {isPinkTheme && (
            <>
              <div style={orbitTrackStyle}>
                <div style={orbitAnchorStyle}>
                  <div style={shadowStyle} />

                  <div style={ponyWrapStyle}>
                    <div style={ponyCounterStyle}>
                      <img src={BRAND_LOADER_PONY} alt="RozovoPony loader" style={ponyImageStyle} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={appLoaderStyles.textWrap}>
          <div style={getPrimaryMessageStyle(isPinkTheme)}>
            {isPinkTheme ? 'Понито подготвя всичко...' : message}
          </div>
          {isPinkTheme && (
            <div style={appLoaderStyles.pinkMessage}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
