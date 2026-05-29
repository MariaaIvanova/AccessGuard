export const appLoaderStyles = {
  container: {
    minHeight: 'calc(100vh - 56px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  textWrap: {
    textAlign: 'center',
  },
  pinkMessage: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 6,
  },
}

export function getContentStyle(isPinkTheme) {
  return {
    width: isPinkTheme ? 248 : 170,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    textAlign: 'center',
  }
}

export function getOrbitWrapStyle(isPinkTheme) {
  return {
    position: 'relative',
    width: isPinkTheme ? 132 : 108,
    height: isPinkTheme ? 132 : 108,
  }
}

export function getSpinnerStyle(isPinkTheme) {
  return {
    position: 'absolute',
    inset: isPinkTheme ? 24 : 18,
    borderRadius: '50%',
    border: isPinkTheme ? '4px solid rgba(221, 127, 162, 0.18)' : '4px solid rgba(136, 136, 128, 0.18)',
    borderTopColor: isPinkTheme ? '#d86b95' : 'var(--text)',
    animation: 'loader-spin 0.9s linear infinite',
    boxShadow: isPinkTheme ? '0 10px 28px rgba(201, 99, 139, 0.14)' : 'none',
  }
}

export const orbitTrackStyle = {
  position: 'absolute',
  inset: 0,
  animation: 'loader-pony-orbit 2.6s linear infinite',
}

export const orbitAnchorStyle = {
  position: 'absolute',
  left: '50%',
  top: -6,
  width: 58,
  height: 88,
  marginLeft: -29,
}

export const shadowStyle = {
  position: 'absolute',
  left: '50%',
  bottom: 10,
  width: 34,
  height: 8,
  borderRadius: '50%',
  background: 'rgba(201, 99, 139, 0.24)',
  animation: 'loader-pony-shadow 0.72s ease-in-out infinite',
}

export const ponyWrapStyle = {
  position: 'absolute',
  left: '50%',
  top: -8,
  width: 58,
  height: 88,
  marginLeft: -29,
  animation: 'loader-pony-bounce 0.72s ease-in-out infinite',
  filter: 'drop-shadow(0 10px 14px rgba(201, 99, 139, 0.2))',
}

export const ponyCounterStyle = {
  width: '100%',
  height: '100%',
  animation: 'loader-pony-counter 2.6s linear infinite',
}

export const ponyImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
}

export function getPrimaryMessageStyle(isPinkTheme) {
  return {
    fontSize: isPinkTheme ? 15 : 13,
    fontWeight: 600,
    color: 'var(--text)',
    letterSpacing: isPinkTheme ? -0.2 : 0,
  }
}
