import { BrowserRouter, Link, Route, Routes } from 'react-router'
import AppShell from './app/AppShell.tsx'
import AuthProvider from './features/auth/AuthProvider.tsx'
import RequireAuth from './features/auth/RequireAuth.tsx'
import UserStoreGate from './features/auth/UserStoreGate.tsx'
import LibraryProvider from './features/library/LibraryProvider.tsx'
import ChatPage from './pages/ChatPage.tsx'
import ConversationPage from './pages/ConversationPage.tsx'
import ConversationsPage from './pages/ConversationsPage.tsx'
import HelpPage from './pages/HelpPage.tsx'
import HomePage from './pages/HomePage.tsx'
import LibraryPage from './pages/LibraryPage.tsx'
import NewChatPage from './pages/NewChatPage.tsx'
import NewWorkspacePage from './pages/NewWorkspacePage.tsx'
import WorkspacePage from './pages/WorkspacePage.tsx'
import WorkspacesPage from './pages/WorkspacesPage.tsx'
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

// Storage is per user, so the library loads only once that user's store is open.
function SignedInLayout() {
  return (
    <UserStoreGate>
      <LibraryProvider>
        <AppShell />
      </LibraryProvider>
    </UserStoreGate>
  )
}

/** Routes for every screen; signed-in screens share the app shell and library. */
export function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        {/* TODO(#114): WS-B adds the public routes here: sign-in, sign-up,
            password reset, /sign-in/verify, privacy and terms. */}
        <Route element={<RequireAuth />}>
          <Route element={<SignedInLayout />}>
            <Route index element={<HomePage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="chat/:documentId" element={<ChatPage />} />
            <Route path="conversations" element={<ConversationsPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="workspaces" element={<WorkspacesPage />} />
            <Route path="workspaces/new" element={<NewWorkspacePage />} />
            <Route path="workspaces/:workspaceId" element={<WorkspacePage />} />
            <Route
              path="workspaces/:workspaceId/chats/new"
              element={<NewChatPage />}
            />
            <Route
              path="chats/:conversationId"
              element={<ConversationPage />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
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
