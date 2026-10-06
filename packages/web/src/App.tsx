import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import { Spinner } from './components/loading';
import { SessionProvider } from './lib/session';
import { AuthCallback } from './pages/AuthCallback';
import { NotFound } from './pages/NotFound';
import { Landing } from './pages/Landing';

// Signed-in screens and long public pages load on demand; the landing page and shell stay in the main bundle.
const Layout = lazy(() => import('./components/Layout').then((m) => ({ default: m.Layout })));
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const CommunitySettings = lazy(() => import('./pages/CommunitySettings').then((m) => ({ default: m.CommunitySettings })));
const InvitePage = lazy(() => import('./pages/InvitePage').then((m) => ({ default: m.InvitePage })));
const Planner = lazy(() => import('./pages/Planner').then((m) => ({ default: m.Planner })));
const RecipeBook = lazy(() => import('./pages/RecipeBook').then((m) => ({ default: m.RecipeBook })));
const RecipeDetail = lazy(() => import('./pages/RecipeDetail').then((m) => ({ default: m.RecipeDetail })));
const Shopping = lazy(() => import('./pages/Shopping').then((m) => ({ default: m.Shopping })));
const Library = lazy(() => import('./pages/Library').then((m) => ({ default: m.Library })));
const ThisWeek = lazy(() => import('./pages/ThisWeek').then((m) => ({ default: m.ThisWeek })));
const Circles = lazy(() => import('./pages/Circles').then((m) => ({ default: m.Circles })));
const PrivacyPage = lazy(() => import('./pages/Legal').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/Legal').then((m) => ({ default: m.TermsPage })));

// Dev-only component gallery; the import is dropped from production builds.
const UiGallery = import.meta.env.DEV ? lazy(() => import('./pages/UiGallery')) : null;

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
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
            {UiGallery && <Route path="/__ui" element={<UiGallery />} />}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster />
      </BrowserRouter>
    </SessionProvider>
  );
}
