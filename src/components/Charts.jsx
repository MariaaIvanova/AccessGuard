// Custom SVG charts без external dependencies. Реактивни на CSS променливите.

const CHART_COLORS = {
  primary: '#dd7fa2',
  granted: '#16a34a',
  denied: '#ef4444',
  methods: {
    pin: '#3b82f6',
    nfc: '#8b5cf6',
    fingerprint: '#16a34a',
    qr: '#f59e0b',
    remote: '#6b7280',
  },
}

const METHOD_LABELS = {
  pin: 'ПИН',
  nfc: 'NFC',
  fingerprint: 'Отпечатък',
  qr: 'QR',
  remote: 'Дистанционно',
}

// Bar Chart — достъп по часове
export function HourlyBarChart({ logs }) {
  const W = 720, H = 260
  const margin = { top: 24, right: 16, bottom: 36, left: 36 }
  const innerW = W - margin.left - margin.right
  const innerH = H - margin.top - margin.bottom

  const counts = Array(24).fill(0)
  logs.forEach(l => {
    const h = new Date(l.timestamp).getHours()
    if (h >= 0 && h < 24) counts[h]++
  })
  const max = Math.max(...counts, 1)
  const barW = innerW / 24 - 2

  const yTicks = 4
  const yStep = Math.ceil(max / yTicks)

  return (
    <div style={{ width: '100%', overflow: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        {/* Y-ос линии */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = margin.top + innerH - (i / yTicks) * innerH
          const value = i * yStep
          return (
            <g key={i}>
              <line x1={margin.left} y1={y} x2={margin.left + innerW} y2={y}
                stroke="var(--border)" strokeDasharray={i === 0 ? '' : '2,4'} strokeWidth={1} />
              <text x={margin.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{value}</text>
            </g>
          )
        })}
        {/* Колоните */}
        {counts.map((c, i) => {
          const h = (c / max) * innerH
          const x = margin.left + i * (innerW / 24) + 1
          const y = margin.top + innerH - h
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} rx="2"
                fill={`url(#barGrad)`} opacity={c === 0 ? 0.15 : 0.85}>
                <title>{i}:00 — {c} {c === 1 ? 'влизане' : 'влизания'}</title>
              </rect>
              {/* Час етикет на всеки 3-ти */}
              {i % 3 === 0 && (
                <text x={x + barW / 2} y={H - 18} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
                  {String(i).padStart(2, '0')}
                </text>
              )}
            </g>
          )
        })}
        {/* Градиент */}
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity="0.95" />
            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {/* X-ос label */}
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--text-muted)">час</text>
      </svg>
    </div>
  )
}

// Pie Chart — методи на достъп
export function MethodPieChart({ logs }) {
  const W = 320, H = 260
  const cx = 110, cy = H / 2, r = 85, rInner = 50

  const counts = {}
  logs.forEach(l => { counts[l.method] = (counts[l.method] || 0) + 1 })
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1

  let angle = -Math.PI / 2
  const slices = Object.entries(counts).map(([method, count]) => {
    const sliceAngle = (count / total) * Math.PI * 2
    const slice = {
      method,
      count,
      percent: (count / total) * 100,
      startAngle: angle,
      endAngle: angle + sliceAngle,
      color: CHART_COLORS.methods[method] || '#94a3b8',
    }
    angle += sliceAngle
    return slice
  }).sort((a, b) => b.count - a.count)

  function arcPath(startA, endA) {
    const x1 = cx + r * Math.cos(startA), y1 = cy + r * Math.sin(startA)
    const x2 = cx + r * Math.cos(endA),   y2 = cy + r * Math.sin(endA)
    const x3 = cx + rInner * Math.cos(endA),   y3 = cy + rInner * Math.sin(endA)
    const x4 = cx + rInner * Math.cos(startA), y4 = cy + rInner * Math.sin(startA)
    const large = endA - startA > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`
  }

  return (
    <div style={{ width: '100%', overflow: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        {slices.length === 0 ? (
          <>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="20" />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fill="var(--text-muted)">Няма данни</text>
          </>
        ) : (
          <>
            {slices.map((s, i) => (
              <path key={i} d={arcPath(s.startAngle, s.endAngle)} fill={s.color} opacity="0.9">
                <title>{METHOD_LABELS[s.method] || s.method}: {s.count} ({s.percent.toFixed(0)}%)</title>
              </path>
            ))}
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text)">{total}</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="var(--text-muted)">общо</text>
          </>
        )}
        {/* Легенда */}
        <g transform={`translate(${W - 130}, 30)`}>
          {slices.map((s, i) => (
            <g key={i} transform={`translate(0, ${i * 22})`}>
              <rect width="12" height="12" rx="2" fill={s.color} />
              <text x="20" y="10" fontSize="11" fill="var(--text)">
                {METHOD_LABELS[s.method] || s.method}
              </text>
              <text x="20" y="22" fontSize="10" fill="var(--text-muted)">
                {s.count} ({s.percent.toFixed(0)}%)
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

// Line Chart — granted vs denied за последните 30 дни
export function GrantedDeniedLineChart({ logs }) {
  const W = 720, H = 260
  const margin = { top: 24, right: 80, bottom: 36, left: 36 }
  const innerW = W - margin.left - margin.right
  const innerH = H - margin.top - margin.bottom

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    days.push({ date: d, key: d.toISOString().slice(0, 10), granted: 0, denied: 0 })
  }

  logs.forEach(l => {
    const k = (l.timestamp || '').slice(0, 10)
    const day = days.find(d => d.key === k)
    if (!day) return
    if (l.result === 'granted') day.granted++
    else if (l.result === 'denied') day.denied++
  })

  const max = Math.max(...days.flatMap(d => [d.granted, d.denied]), 1)
  const stepX = innerW / (days.length - 1)

  const pathFor = (key) =>
    days.map((d, i) => {
      const x = margin.left + i * stepX
      const y = margin.top + innerH - (d[key] / max) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')

  const areaFor = (key, color) => {
    const top = pathFor(key)
    const baseY = margin.top + innerH
    return `${top} L ${margin.left + (days.length - 1) * stepX} ${baseY} L ${margin.left} ${baseY} Z`
  }

  const yTicks = 4
  const yStep = Math.ceil(max / yTicks)

  return (
    <div style={{ width: '100%', overflow: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="grantedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.granted} stopOpacity="0.3" />
            <stop offset="100%" stopColor={CHART_COLORS.granted} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="deniedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.denied} stopOpacity="0.3" />
            <stop offset="100%" stopColor={CHART_COLORS.denied} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Y-ос мрежа */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = margin.top + innerH - (i / yTicks) * innerH
          return (
            <g key={i}>
              <line x1={margin.left} y1={y} x2={margin.left + innerW} y2={y}
                stroke="var(--border)" strokeDasharray={i === 0 ? '' : '2,4'} strokeWidth={1} />
              <text x={margin.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{i * yStep}</text>
            </g>
          )
        })}
        {/* Granted area + line */}
        <path d={areaFor('granted')} fill="url(#grantedGrad)" />
        <path d={pathFor('granted')} fill="none" stroke={CHART_COLORS.granted} strokeWidth="2" />
        {/* Denied area + line */}
        <path d={areaFor('denied')} fill="url(#deniedGrad)" />
        <path d={pathFor('denied')} fill="none" stroke={CHART_COLORS.denied} strokeWidth="2" strokeDasharray="3,3" />
        {/* Точки на последния ден */}
        {days.length > 0 && (() => {
          const last = days[days.length - 1]
          const x = margin.left + (days.length - 1) * stepX
          return (
            <>
              <circle cx={x} cy={margin.top + innerH - (last.granted / max) * innerH} r="4" fill={CHART_COLORS.granted}>
                <title>Днес: {last.granted} разрешени</title>
              </circle>
              <circle cx={x} cy={margin.top + innerH - (last.denied / max) * innerH} r="4" fill={CHART_COLORS.denied}>
                <title>Днес: {last.denied} отказани</title>
              </circle>
            </>
          )
        })()}
        {/* X-ос — дати на всеки 5-ти ден */}
        {days.map((d, i) => i % 5 === 0 && (
          <text key={i} x={margin.left + i * stepX} y={H - 18} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
            {d.date.getDate()}.{d.date.getMonth() + 1}
          </text>
        ))}
        {/* Легенда */}
        <g transform={`translate(${W - 75}, 30)`}>
          <line x1="0" y1="6" x2="14" y2="6" stroke={CHART_COLORS.granted} strokeWidth="2" />
          <text x="20" y="10" fontSize="11" fill="var(--text)">Разрешени</text>
          <line x1="0" y1="26" x2="14" y2="26" stroke={CHART_COLORS.denied} strokeWidth="2" strokeDasharray="3,3" />
          <text x="20" y="30" fontSize="11" fill="var(--text)">Отказани</text>
        </g>
      </svg>
    </div>
  )
}

// KPI карта за топ статистики
export function KpiCard({ label, value, sublabel, trend }) {
  const trendColor = trend > 0 ? '#16a34a' : trend < 0 ? '#ef4444' : 'var(--text-muted)'
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
      flex: '1 1 140px',
      minWidth: 140,
    }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        {sublabel}
        {trend !== undefined && (
          <span style={{ color: trendColor, marginLeft: 6, fontWeight: 500 }}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '·'} {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  )
}
