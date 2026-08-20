import { Link, Route, Routes } from "react-router";
import { Logo } from "./components/Logo.js";
import { NewRunPage } from "./pages/NewRunPage.js";
import { RunOverviewPage } from "./pages/RunOverviewPage.js";
import { TargetDetailPage } from "./pages/TargetDetailPage.js";
import { AllReportsPage } from "./pages/AllReportsPage.js";

export function App() {
  return (
    <div className="app">
      <header className="app__nav">
        <Link to="/" className="app__brand">
          <Logo />
          <span>CrossCheck</span>
        </Link>
      </header>
      <main className="app__main">
        <Routes>
          <Route path="/" element={<NewRunPage />} />
          <Route path="/runs/:runId" element={<RunOverviewPage />} />
          <Route path="/runs/:runId/report" element={<AllReportsPage />} />
          <Route path="/runs/:runId/targets/:targetIndex" element={<TargetDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
