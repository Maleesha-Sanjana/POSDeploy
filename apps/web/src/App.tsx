import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { DebugPage } from './pages/DebugPage';
import { DeployPage } from './pages/DeployPage';
import { HistoryPage } from './pages/HistoryPage';
import { PasteInstructionsPage } from './pages/PasteInstructionsPage';
import { PosPage } from './pages/PosPage';
import { SchemaPage } from './pages/SchemaPage';
import { ScriptsPage } from './pages/ScriptsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="debug" element={<DebugPage />} />
          <Route path="paste" element={<PasteInstructionsPage />} />
          <Route path="schema" element={<SchemaPage />} />
          <Route path="scripts" element={<ScriptsPage />} />
          <Route path="deploy" element={<DeployPage />} />
          <Route path="history" element={<HistoryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
