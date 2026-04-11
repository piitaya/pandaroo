import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
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
          <Route index element={<Dashboard />} />
          <Route path="printers" element={<Printers />} />
          <Route path="spools" element={<Spools />} />
          <Route path="sync" element={<Sync />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
