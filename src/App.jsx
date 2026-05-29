import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import History from './pages/History'
import Schedule from './pages/Schedule'
import Admin from './pages/Admin'
import GuestAccess from './pages/GuestAccess'
import { DialogProvider } from './context/DialogContext'

function App() {
  return (
    <DialogProvider>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/history" element={<History />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/admin" element={<Admin />} />
        {/* Публичен route — гостове сканират QR и кацат тук */}
        <Route path="/guest/:token" element={<GuestAccess />} />
      </Routes>
    </DialogProvider>
  )
}

export default App
