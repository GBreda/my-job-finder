import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import type { AppStatus } from "../shared/types";
import { ApiError, fetchStatus, runScan } from "./api";
import { AlertsPage } from "./pages/AlertsPage";
import { JobsPage } from "./pages/JobsPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await fetchStatus());
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Não foi possível carregar o painel.";
      notifications.show({ color: "red", message });
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function scan() {
    setScanning(true);
    try {
      const result = await runScan();
      const emailNote = result.emailSkipped
        ? " O aviso por e-mail ainda não está configurado."
        : result.emailedCount > 0
          ? ` ${result.emailedCount} aviso(s) enviado(s).`
          : "";
      notifications.show({
        color: "pine",
        message: `Busca concluída. ${result.newMatchCount} para avisar e ${result.baselineCount} que já estavam no ar.${emailNote}`,
      });
      if (result.errors.length > 0) {
        notifications.show({ color: "yellow", message: result.errors[0] });
      }
      await refreshStatus();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "A busca falhou.";
      notifications.show({ color: "red", message });
    } finally {
      setScanning(false);
    }
  }

  const pending = status?.pendingNotificationCount ?? 0;

  return (
    <div className="shell">
      {navOpen ? <button className="backdrop" aria-label="Fechar menu" onClick={() => setNavOpen(false)} /> : null}
      <aside className={navOpen ? "nav open" : "nav"}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <i />
          </div>
          <div>
            <strong>Radar de vagas</strong>
            <small>um aviso quando surgir</small>
          </div>
        </div>
        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={() => setNavOpen(false)}>
            Vagas
            {pending > 0 ? <span className="nav-count">{pending}</span> : null}
          </NavLink>
          <NavLink to="/alertas" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={() => setNavOpen(false)}>
            Alertas
          </NavLink>
          <NavLink to="/ajustes" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={() => setNavOpen(false)}>
            Ajustes
          </NavLink>
        </nav>
        <p className="nav-note">Cada card aponta para a vaga original e cita a fonte.</p>
      </aside>
      <div className="shell-main">
        <header className="mobile-bar">
          <button className="menu-button" type="button" onClick={() => setNavOpen(true)}>
            Menu
          </button>
          <strong>Radar de vagas</strong>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<JobsPage scanning={scanning} onScan={() => void scan()} />} />
            <Route path="/alertas" element={<AlertsPage onChanged={() => void refreshStatus()} />} />
            <Route path="/ajustes" element={<SettingsPage status={status} onSaved={() => void refreshStatus()} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
