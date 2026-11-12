import { Button, Checkbox, Modal, Switch, TagsInput, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { JOB_SOURCES, type JobSourceId } from "../../shared/constants";
import { isJobSourceId } from "../../shared/sources";
import type { Alert, AlertInput } from "../../shared/types";
import { ApiError, createAlert, fetchAlerts, removeAlert, updateAlert } from "../api";
import { emptyAlert, frontendAlertExample, toAlertInput } from "../alerts";

type Props = {
  onChanged: () => void;
};

export function AlertsPage({ onChanged }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [draft, setDraft] = useState<AlertInput>(emptyAlert());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setAlerts(await fetchAlerts());
    } catch (loadError) {
      const message = loadError instanceof ApiError ? loadError.message : "Não foi possível carregar os alertas.";
      notifications.show({ color: "red", message });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyAlert());
    setError("");
    setOpened(true);
  }

  function openEdit(alert: Alert) {
    setEditingId(alert.id);
    setDraft(toAlertInput(alert));
    setError("");
    setOpened(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await updateAlert(editingId, draft);
      } else {
        await createAlert(draft);
      }
      setOpened(false);
      await load();
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : "Não foi possível salvar o alerta.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(alert: Alert) {
    try {
      await updateAlert(alert.id, { ...toAlertInput(alert), active: !alert.active });
      await load();
      onChanged();
    } catch (toggleError) {
      const message = toggleError instanceof ApiError ? toggleError.message : "Não foi possível atualizar o alerta.";
      notifications.show({ color: "red", message });
    }
  }

  async function destroy(alert: Alert) {
    if (!window.confirm(`Apagar o alerta “${alert.name}”?`)) {
      return;
    }
    try {
      await removeAlert(alert.id);
      await load();
      onChanged();
    } catch (destroyError) {
      const message = destroyError instanceof ApiError ? destroyError.message : "Não foi possível apagar o alerta.";
      notifications.show({ color: "red", message });
    }
  }

  const editing = alerts.find((alert) => alert.id === editingId) ?? null;

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Alertas</p>
          <h1>O que você aceita fazer</h1>
          <p className="lede">
            Coloque no mesmo alerta as tecnologias equivalentes. Uma vaga que pede React entra também se você listou Angular e Vue.js.
          </p>
        </div>
        <Button onClick={openCreate}>Novo alerta</Button>
      </div>

      {alerts.length === 0 ? (
        <div className="empty">
          <p>Nenhum alerta. O exemplo de frontend já traz React, Angular e Vue.js.</p>
          <Button variant="default" onClick={() => { setDraft(frontendAlertExample()); setEditingId(null); setError(""); setOpened(true); }}>
            Usar exemplo de frontend
          </Button>
        </div>
      ) : (
        <div className="alert-list">
          {alerts.map((alert) => (
            <article key={alert.id} className="alert-card">
              <header>
                <div>
                  <h2>{alert.name}</h2>
                  <p className="muted">{alert.matchCount} vaga(s) no painel{alert.primed ? "" : " · primeira busca ainda não rodou"}</p>
                </div>
                <Switch checked={alert.active} label={alert.active ? "Ativo" : "Pausado"} onChange={() => void toggleActive(alert)} />
              </header>
              <div className="job-meta">
                {alert.acceptedSkills.map((skill) => (
                  <span key={skill} className="skill">{skill}</span>
                ))}
              </div>
              <p className="helper">
                Fontes: {alert.sources.map((source) => JOB_SOURCES.find((item) => item.id === source)?.label ?? source).join(", ")}
                {alert.locations.length > 0 ? ` · Lugares: ${alert.locations.join(", ")}` : ""}
                {alert.excludedTerms.length > 0 ? ` · Ignora: ${alert.excludedTerms.join(", ")}` : ""}
              </p>
              <div className="card-actions">
                <Button variant="default" onClick={() => openEdit(alert)}>Editar</Button>
                <Button variant="subtle" color="red" onClick={() => void destroy(alert)}>Apagar</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal opened={opened} onClose={() => setOpened(false)} title={editingId ? "Editar alerta" : "Novo alerta"} size="lg">
        <div className="form-grid">
          <TextInput label="Nome" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} />
          <div>
            <TagsInput
              label="Habilidades aceitas"
              description="Qualquer uma serve. Exemplo: a vaga pede React, mas você também aceita Angular e Vue.js."
              value={draft.acceptedSkills}
              onChange={(acceptedSkills) => setDraft({ ...draft, acceptedSkills })}
              placeholder="React"
            />
            <Button variant="subtle" mt="xs" onClick={() => setDraft(frontendAlertExample())}>
              Preencher exemplo de frontend
            </Button>
          </div>
          <TagsInput
            label="Também exigir"
            description="Opcional. A vaga precisa ter todos estes termos, além de uma habilidade. Um cargo como desenvolvedor ajuda a achar vagas em que a tecnologia só aparece na descrição."
            value={draft.requiredTerms}
            onChange={(requiredTerms) => setDraft({ ...draft, requiredTerms })}
          />
          <TagsInput
            label="Ignorar se aparecer"
            description="Estágio, por exemplo."
            value={draft.excludedTerms}
            onChange={(excludedTerms) => setDraft({ ...draft, excludedTerms })}
          />
          <TagsInput
            label="Lugares"
            description="Vazio aceita qualquer lugar. Remoto também casa com remote e home office."
            value={draft.locations}
            onChange={(locations) => setDraft({ ...draft, locations })}
          />
          <Checkbox.Group
            label="Fontes"
            value={draft.sources}
            onChange={(values) => setDraft({ ...draft, sources: values.filter(isJobSourceId) satisfies JobSourceId[] })}
          >
            <div className="form-grid">
              {JOB_SOURCES.map((source) => (
                <Checkbox key={source.id} value={source.id} label={`${source.label} — ${source.description}`} />
              ))}
            </div>
          </Checkbox.Group>
          <Switch checked={draft.active} label="Alerta ativo" onChange={(event) => setDraft({ ...draft, active: event.currentTarget.checked })} />
          {!editing?.primed ? (
            <Switch
              checked={draft.notifyExisting}
              label="Na primeira busca, avisar também as vagas que já estão abertas"
              onChange={(event) => setDraft({ ...draft, notifyExisting: event.currentTarget.checked })}
            />
          ) : (
            <p className="helper">A primeira busca deste alerta já foi feita. As próximas vagas entram como novas.</p>
          )}
          {error ? <p className="error-list">{error}</p> : null}
          <Button loading={saving} onClick={() => void save()}>Salvar alerta</Button>
        </div>
      </Modal>
    </section>
  );
}
