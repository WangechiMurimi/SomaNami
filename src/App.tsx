import { BrowserRouter, Link, Route, Routes } from 'react-router'
import AppShell from './app/AppShell.tsx'
import LibraryProvider from './features/library/LibraryProvider.tsx'
import ChatPage from './pages/ChatPage.tsx'
import ComingSoonPage from './pages/ComingSoonPage.tsx'
import ConversationsPage from './pages/ConversationsPage.tsx'
import HelpPage from './pages/HelpPage.tsx'
import HomePage from './pages/HomePage.tsx'
import LibraryPage from './pages/LibraryPage.tsx'
import { H1, LEDE } from './pages/page-heading.ts'

function NotFoundPage() {
  return (
    <div>
      <h1 className={H1}>Page not found</h1>
      <p className={LEDE}>
        <Link to="/" className="font-semibold text-accent underline">
          Go home
        </Link>
      </p>
    </div>
  )
}

/** Routes for every screen; all share the app shell and the stored library. */
export function AppRoutes() {
  return (
    <LibraryProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="chat/:documentId" element={<ChatPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="help" element={<HelpPage />} />
          {/* TODO(#90): replace with the workspaces grid and creation flow. */}
          <Route
            path="workspaces"
            element={
              <ComingSoonPage
                title="Workspaces"
                description="Keep each topic’s materials and chats together in its own workspace."
              />
            }
          />
          <Route
            path="workspaces/new"
            element={
              <ComingSoonPage
                title="New workspace"
                description="Name a topic, add its materials and start asking questions."
              />
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </LibraryProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
