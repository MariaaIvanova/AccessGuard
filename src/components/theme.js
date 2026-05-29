// Споделена логика за темата — ползва се от Layout.jsx (за защитените страници)
// и от Login.jsx (за Login екрана), за да са в синхрон.

export const THEME_ORDER = ['light', 'dark', 'pink']

export function getInitialTheme() {
  const savedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null
  return THEME_ORDER.includes(savedTheme) ? savedTheme : 'light'
}

export function nextTheme(current) {
  const idx = THEME_ORDER.indexOf(current)
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length]
}

export function nextThemeLabel(current) {
  return current === 'light' ? 'Тъмен режим'
    : current === 'dark' ? 'Розов режим'
    : 'Светъл режим'
}

const PINK_BG = 'radial-gradient(circle at 0% 0%, rgba(255, 208, 225, 0.82), transparent 26%), radial-gradient(circle at 100% 10%, rgba(247, 191, 209, 0.72), transparent 22%), radial-gradient(circle at 80% 100%, rgba(255, 224, 234, 0.86), transparent 26%), linear-gradient(180deg, #fffafd 0%, #fff7fa 52%, #fff1f5 100%)'

export function applyTheme(themeName) {
  const r = document.documentElement
  const s = (k, v) => r.style.setProperty(k, v)

  if (themeName === 'dark') {
    s('--bg', '#111')
    s('--surface', '#1a1a1a')
    s('--card-bg', '#1a1a1a')
    s('--border', '#2a2a2a')
    s('--text', '#f0f0f0')
    s('--text-muted', '#777770')
    s('--text-light', '#444')
    s('--input-bg', '#222')
    s('--table-head', '#1f1f1f')
    s('--btn-bg', '#f0f0f0')
    s('--btn-color', '#111')
    s('--accent', '#f0f0f0')
  } else if (themeName === 'pink') {
    s('--bg', PINK_BG)
    s('--surface', 'rgba(255, 255, 255, 0.52)')
    s('--card-bg', 'rgba(255, 255, 255, 0.82)')
    s('--border', 'rgba(223, 150, 176, 0.34)')
    s('--text', '#2b2025')
    s('--text-muted', '#8e7881')
    s('--text-light', '#c3a7b1')
    s('--input-bg', 'rgba(255, 255, 255, 0.72)')
    s('--table-head', 'rgba(255, 244, 248, 0.94)')
    s('--btn-bg', 'linear-gradient(135deg, #dd7fa2, #c9638b)')
    s('--btn-color', '#fffafc')
    s('--accent', '#c9638b')
  } else {
    s('--bg', '#f5f5f3')
    s('--surface', '#fff')
    s('--card-bg', '#fff')
    s('--border', '#e8e8e5')
    s('--text', '#1a1a1a')
    s('--text-muted', '#888880')
    s('--text-light', '#b0b0a8')
    s('--input-bg', '#f5f5f3')
    s('--table-head', '#fafaf9')
    s('--btn-bg', '#1a1a1a')
    s('--btn-color', '#fff')
    s('--accent', '#1a1a1a')
  }

  document.documentElement.dataset.theme = themeName
  document.body.dataset.theme = themeName
  document.body.style.background =
    themeName === 'dark' ? '#111' :
    themeName === 'pink' ? PINK_BG :
    '#f5f5f3'
  document.body.style.backgroundAttachment = themeName === 'pink' ? 'fixed' : 'scroll'
  document.body.style.backgroundRepeat = themeName === 'pink' ? 'no-repeat' : 'repeat'
  document.body.style.color =
    themeName === 'dark' ? '#f0f0f0' :
    themeName === 'pink' ? '#2b2025' :
    '#1a1a1a'
  document.body.style.fontFamily = "'Inter', sans-serif"
}

// Глобална CSS анимация за spinner — добавя се веднъж
if (typeof document !== 'undefined' && !document.getElementById('global-spin-keyframes')) {
  const style = document.createElement('style')
  style.id = 'global-spin-keyframes'
  style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'
  document.head.appendChild(style)
}

// Иконата за бутона за смяна на тема (използва се и в Layout, и в Login)
export function getThemeIconPath(theme) {
  if (theme === 'light') {
    return 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'
  }
  if (theme === 'dark') {
    return 'M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z'
  }
  return null // pink — използва SVG с няколко елемента
}
