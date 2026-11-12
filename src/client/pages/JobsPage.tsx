import { Button } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import type { Alert, JobMatch } from "../../shared/types";
import { ApiError, createAlert, fetchAlerts, fetchMatches } from "../api";
import { frontendAlertExample } from "../alerts";
import { formatDateTime, notifyLabel } from "../format";

type Props = {
  scanning: boolean;
  onScan: () => void;
};

type Filter = "all" | "new" | "baseline";

export function JobsPage({ scanning, onScan }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [alertId, setAlertId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  async function load(nextAlertId = alertId) {
    setLoading(true);
    try {
      const [nextAlerts, nextMatches] = await Promise.all([fetchAlerts(), fetchMatches(nextAlertId)]);
      setAlerts(nextAlerts);
      setMatches(nextMatches);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Não foi possível carregar as vagas.";
      notifications.show({ color: "red", message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  useEffect(() => {
    if (!scanning) {
      void load(alertId);
    }
  }, [scanning]);

  const visible = matches.filter((match) => {
    if (filter === "new") {
      return match.notifyStatus !== "baseline";
    }
    if (filter === "baseline") {
      return match.notifyStatus === "baseline";
    }
    return true;
  });

  async function createExample() {
    try {
      await createAlert(frontendAlertExample());
      notifications.show({ color: "pine", message: "Alerta de frontend criado. A primeira busca memoriza as vagas que já existem." });
      await load(alertId);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Não foi possível criar o alerta.";
      notifications.show({ color: "red", message });
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Entrada</p>
          <h1>Vagas que combinam com você</h1>
          <p className="lede">
            O radar olha título e descrição. Se a vaga pede React, Angular ou Vue.js, ela entra no mesmo alerta.
            A primeira busca só memoriza o que já está no ar; o e-mail avisa das próximas.
          </p>
        </div>
        <Button loading={scanning} onClick={onScan}>
          Buscar agora
        </Button>
      </div>

      {alerts.length > 0 ? (
        <div className="filters">
          <button className={alertId === "" ? "chip active" : "chip"} type="button" onClick={() => { setAlertId(""); void load(""); }}>
            Todos os alertas
          </button>
          {alerts.map((alert) => (
            <button
              key={alert.id}
              className={alertId === alert.id ? "chip active" : "chip"}
              type="button"
              onClick={() => { setAlertId(alert.id); void load(alert.id); }}
            >
              {alert.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="filters">
        <button className={filter === "all" ? "chip active" : "chip"} type="button" onClick={() => setFilter("all")}>Todas</button>
        <button className={filter === "new" ? "chip active" : "chip"} type="button" onClick={() => setFilter("new")}>Novas</button>
        <button className={filter === "baseline" ? "chip active" : "chip"} type="button" onClick={() => setFilter("baseline")}>Já estavam no ar</button>
      </div>

      {loading ? <p className="muted">Carregando vagas…</p> : null}

      {!loading && alerts.length === 0 ? (
        <div className="empty">
          <h2>Nenhum alerta ainda</h2>
          <p className="lede">Comece com um grupo de habilidades equivalentes: React, Angular e Vue.js.</p>
          <Button onClick={() => void createExample()}>Criar alerta de frontend</Button>
        </div>
      ) : null}

      {!loading && alerts.length > 0 && visible.length === 0 ? (
        <div className="empty">
          <h2>Nada nesta lista</h2>
          <p className="lede">Rode uma busca ou alargue as habilidades do alerta. As vagas novas ficam em Novas.</p>
          <Link to="/alertas">Editar alertas</Link>
        </div>
      ) : null}

      <div className="job-list">
        {visible.map((match) => {
          const isNew = match.notifyStatus !== "baseline";
          return (
            <article key={match.id} className={isNew ? "job-card is-new" : "job-card"}>
              <div className="job-meta">
                <span className={isNew ? "badge new" : "badge"}>{notifyLabel(match.notifyStatus)}</span>
                <span className="badge">{match.sourceLabel}</span>
                {match.workplace ? <span className="badge">{match.workplace}</span> : null}
                <span className="badge">{match.alertName}</span>
              </div>
              <h2>{match.title}</h2>
              <p className="company">
                {match.company || "Empresa não informada"}
                {match.location ? ` · ${match.location}` : ""}
              </p>
              <div className="job-meta">
                {match.matchedSkills.map((skill) => (
                  <span key={skill} className="skill">{skill}</span>
                ))}
              </div>
              {match.excerpt ? <p className="excerpt">{match.excerpt}</p> : null}
              {match.notifyError ? <p className="error-list">{match.notifyError}</p> : null}
              <div className="card-actions">
                <a className="job-link" href={match.url} target="_blank" rel="noopener">
                  Abrir na {match.sourceLabel}
                </a>
                <span className="muted">
                  Publicada {formatDateTime(match.publishedAt)} · encontrada {formatDateTime(match.foundAt)}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
