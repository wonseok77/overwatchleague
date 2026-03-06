import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import type { ReactNode } from 'react'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import MatchListPage from '@/pages/MatchListPage'
import MatchDetailPage from '@/pages/MatchDetailPage'
import TeamCompositionPage from '@/pages/TeamCompositionPage'
import LeaderboardPage from '@/pages/LeaderboardPage'
import ProfilePage from '@/pages/ProfilePage'
import HighlightsPage from '@/pages/HighlightsPage'
import AdminPage from '@/pages/AdminPage'
import SessionDetailPage from '@/pages/SessionDetailPage'

function PrivateRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdminOrManager, isLoading } = useAuth()
  if (isLoading) return null
  if (!isAdminOrManager) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/leaderboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/matches" element={<MatchListPage />} />
          <Route path="/matches/:id" element={<MatchDetailPage />} />
          <Route path="/matches/:id/teams" element={<AdminRoute><TeamCompositionPage /></AdminRoute>} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/highlights" element={<HighlightsPage />} />
          <Route path="/profile/:id" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="/sessions/:id" element={<PrivateRoute><SessionDetailPage /></PrivateRoute>} />
          <Route path="/admin/*" element={<AdminRoute><AdminPage /></AdminRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
