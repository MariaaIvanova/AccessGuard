import { useEffect, useRef } from 'react'
import { BRAND_LOADER_PONY } from '../branding'
import { useTheme } from './Layout'

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
    <div
      style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <style>{`
        @keyframes loader-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes loader-pony-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes loader-pony-counter {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }

        @keyframes loader-pony-bounce {
          0%, 100% { transform: translateX(-50%) translateY(0px) scale(1); }
          50% { transform: translateX(-50%) translateY(-11px) scale(1.03); }
        }

        @keyframes loader-pony-shadow {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.18; }
          50% { transform: translateX(-50%) scale(0.72); opacity: 0.1; }
        }
      `}</style>

        <div
          style={{
          width: isPinkTheme ? 248 : 170,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          textAlign: 'center',
        }}
      >
        <div style={{ position: 'relative', width: isPinkTheme ? 132 : 108, height: isPinkTheme ? 132 : 108 }}>
          <div
            style={{
              position: 'absolute',
              inset: isPinkTheme ? 24 : 18,
              borderRadius: '50%',
              border: isPinkTheme ? '4px solid rgba(221, 127, 162, 0.18)' : '4px solid rgba(136, 136, 128, 0.18)',
              borderTopColor: isPinkTheme ? '#d86b95' : 'var(--text)',
              animation: 'loader-spin 0.9s linear infinite',
              boxShadow: isPinkTheme ? '0 10px 28px rgba(201, 99, 139, 0.14)' : 'none',
            }}
          />

          {isPinkTheme && (
            <>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  animation: 'loader-pony-orbit 2.6s linear infinite',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: -6,
                    width: 58,
                    height: 88,
                    marginLeft: -29,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      bottom: 10,
                      width: 34,
                      height: 8,
                      borderRadius: '50%',
                      background: 'rgba(201, 99, 139, 0.24)',
                      animation: 'loader-pony-shadow 0.72s ease-in-out infinite',
                    }}
                  />

                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: -8,
                      width: 58,
                      height: 88,
                      marginLeft: -29,
                      animation: 'loader-pony-bounce 0.72s ease-in-out infinite',
                      filter: 'drop-shadow(0 10px 14px rgba(201, 99, 139, 0.2))',
                    }}
                  >
                    <div style={{ width: '100%', height: '100%', animation: 'loader-pony-counter 2.6s linear infinite' }}>
                      <img src={BRAND_LOADER_PONY} alt="RozovoPony loader" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div>
          <div style={{ fontSize: isPinkTheme ? 15 : 13, fontWeight: 600, color: 'var(--text)', letterSpacing: isPinkTheme ? -0.2 : 0 }}>
            {isPinkTheme ? 'Понито подготвя всичко...' : message}
          </div>
          {isPinkTheme && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
