import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import SettingsLayout from "./components/SettingsLayout";
import Dashboard from "./pages/Dashboard";
import Printers from "./pages/Printers";
import Spools from "./pages/Spools";
import Settings from "./pages/Settings";
import Sync from "./pages/Sync";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/live" replace />} />
          <Route path="live" element={<Dashboard />} />
          <Route path="inventory" element={<Spools />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Settings />} />
            <Route path="printers" element={<Printers />} />
            <Route path="sync" element={<Sync />} />
          </Route>
          <Route path="spools" element={<Navigate to="/inventory" replace />} />
          <Route path="printers" element={<Navigate to="/settings/printers" replace />} />
          <Route path="sync" element={<Navigate to="/settings/sync" replace />} />
          <Route path="*" element={<Navigate to="/live" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
