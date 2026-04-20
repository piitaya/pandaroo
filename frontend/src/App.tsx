import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import SettingsLayout from "./components/SettingsLayout";
import Dashboard from "./pages/Dashboard";
import Printers from "./pages/Printers";
import Spools from "./pages/Spools";
import SpoolDetail from "./pages/SpoolDetail";
import Settings from "./pages/Settings";
import Sync from "./pages/Sync";
import { useEventStream } from "./hooks";

function RedirectSpoolDetail() {
  const { tagId } = useParams<{ tagId: string }>();
  return <Navigate to={`/inventory/${encodeURIComponent(tagId ?? "")}`} replace />;
}

export default function App() {
  useEventStream();
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/live" replace />} />
          <Route path="live" element={<Dashboard />} />
          <Route path="inventory" element={<Spools />} />
          <Route path="inventory/:tagId" element={<SpoolDetail />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Settings />} />
            <Route path="printers" element={<Printers />} />
            <Route path="sync" element={<Sync />} />
          </Route>
          <Route path="spools" element={<Navigate to="/inventory" replace />} />
          <Route path="spools/:tagId" element={<RedirectSpoolDetail />} />
          <Route path="printers" element={<Navigate to="/settings/printers" replace />} />
          <Route path="sync" element={<Navigate to="/settings/sync" replace />} />
          <Route path="*" element={<Navigate to="/live" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
