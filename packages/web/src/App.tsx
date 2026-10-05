import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SessionProvider } from './lib/session';
import { Account } from './pages/Account';
import { AuthCallback } from './pages/AuthCallback';
import { CommunitySettings } from './pages/CommunitySettings';
import { InvitePage } from './pages/InvitePage';
import { NotFound } from './pages/NotFound';
import { Landing } from './pages/Landing';
import { Planner } from './pages/Planner';
import { PrivacyPage, TermsPage } from './pages/Legal';
import { RecipeBook } from './pages/RecipeBook';
import { RecipeDetail } from './pages/RecipeDetail';
import { Shopping } from './pages/Shopping';
import { Library } from './pages/Library';
import { ThisWeek } from './pages/ThisWeek';
import { Circles } from './pages/Circles';

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route element={<Layout />}>
            <Route path="/week" element={<ThisWeek />} />
            <Route path="/library" element={<Library />} />
            <Route path="/circles" element={<Circles />} />
            <Route path="/book" element={<RecipeBook />} />
            <Route path="/book/:rid" element={<RecipeDetail />} />
            <Route path="/plan" element={<Planner />} />
            <Route path="/shop" element={<Shopping />} />
            <Route path="/community" element={<CommunitySettings />} />
            <Route path="/account" element={<Account />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
