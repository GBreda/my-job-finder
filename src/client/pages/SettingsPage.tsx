import { Button, Select, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { SCAN_INTERVAL_OPTIONS } from "../../shared/constants";
import type { AppStatus, ScanSummary } from "../../shared/types";
import { ApiError, fetchScans, saveSettings, sendTestEmail } from "../api";
import { formatDateTime, scanReasonLabel } from "../format";

type Props = {
  status: AppStatus | null;
  onSaved: () => void;
};

export function SettingsPage({ status, onSaved }: Props) {
  const [email, setEmail] = useState("");
  const [interval, setInterval] = useState(String(SCAN_INTERVAL_OPTIONS[0].minutes));
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!status) {
      return;
    }
    setEmail(status.notifyEmail);
    setInterval(String(status.scanIntervalMinutes));
  }, [status]);

  useEffect(() => {
    void fetchScans()
      .then(setScans)
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : "Não foi possível carregar o histórico.";
        notifications.show({ color: "red", message });
      });
  }, [status?.lastScan?.id]);

  async function save() {
    setSaving(true);
    try {
      await saveSettings({ notifyEmail: email, scanIntervalMinutes: Number(interval) });
      notifications.show({ color: "pine", message: "Ajustes salvos." });
      onSaved();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Não foi possível salvar.";
      notifications.show({ color: "red", message });
    } finally {
      setSaving(false);
    }
  }

  async function testEmail() {
    setTesting(true);
    try {
      await sendTestEmail();
      notifications.show({ color: "pine", message: "E-mail de teste enviado." });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "O teste falhou.";
      notifications.show({ color: "red", message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Ajustes</p>
          <h1>Para onde avisar</h1>
          <p className="lede">
            O aviso sai por e-mail. WhatsApp pediria uma API de empresa; com SMTP basta uma caixa de saída, inclusive uma senha de app do Gmail.
          </p>
        </div>
      </div>

      <div className="panel settings-panel">
        <p>
          SMTP:{" "}
          <span className={status?.smtpConfigured ? "badge ok" : "badge warn"}>
            {status?.smtpConfigured ? `Pronto, enviando como ${status.smtpFrom}` : "Ainda não configurado"}
          </span>
        </p>
        <p className="helper">
          Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM no ambiente e reinicie o servidor. O destinatário fica aqui, separado da caixa que envia.
        </p>
        <TextInput label="E-mail que recebe os avisos" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="voce@email.com" />
        <Select
          label="Busca automática"
          data={SCAN_INTERVAL_OPTIONS.map((option) => ({ value: String(option.minutes), label: option.label }))}
          value={interval}
          onChange={(value) => setInterval(value ?? String(SCAN_INTERVAL_OPTIONS[0].minutes))}
          allowDeselect={false}
        />
        <div className="card-actions">
          <Button loading={saving} onClick={() => void save()}>Salvar</Button>
          <Button variant="default" loading={testing} onClick={() => void testEmail()}>Enviar e-mail de teste</Button>
        </div>
      </div>

      <h2 className="section-title">Últimas buscas</h2>
      {scans.length === 0 ? <p className="muted">Nenhuma busca ainda.</p> : null}
      <div className="history">
        {scans.map((scan) => (
          <article key={scan.id} className="history-item">
            <strong>
              {scanReasonLabel(scan.reason)} · {formatDateTime(scan.finishedAt)}
            </strong>
            <span className="muted">
              {scan.fetchedCount} registros lidos · {scan.newMatchCount} para avisar · {scan.baselineCount} já estavam no ar · {scan.emailedCount} e-mails
              {scan.emailSkipped ? " · e-mail não enviado" : ""}
            </span>
            {scan.errors.length > 0 ? (
              <ul className="error-list">
                {scan.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
