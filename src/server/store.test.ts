import assert from "node:assert/strict";
import test from "node:test";
import type { AlertInput } from "../shared/types";
import {
  deleteAlert,
  getAlert,
  insertAlert,
  listJobs,
  listMatches,
  markAlertsPrimed,
  openDatabase,
  syncAlertMatches,
  updateAlert,
  upsertJobs,
} from "./db";

const frontend: AlertInput = {
  name: "Frontend",
  acceptedSkills: ["React", "Angular", "Vue.js"],
  requiredTerms: [],
  excludedTerms: [],
  locations: [],
  sources: ["gupy"],
  active: true,
  notifyExisting: false,
};

test("a primeira sincronização só memoriza e a seguinte deixa a vaga pendente de aviso", () => {
  const db = openDatabase(":memory:");
  const alert = insertAlert(db, frontend);
  upsertJobs(db, [
    {
      source: "gupy",
      externalId: "1",
      title: "Pessoa frontend React",
      company: "Nuvem",
      location: "São Paulo",
      workplace: "Híbrido",
      url: "https://exemplo.gupy.io/job/1",
      description: "React ou Vue.",
      publishedAt: null,
    },
    {
      source: "gupy",
      externalId: "2",
      title: "Analista de dados",
      company: "Nuvem",
      location: "São Paulo",
      workplace: "Remoto",
      url: "https://exemplo.gupy.io/job/2",
      description: "SQL e Python.",
      publishedAt: null,
    },
  ]);

  const created = syncAlertMatches(db, alert, listJobs(db));
  assert.deepEqual(created, { pending: 0, baseline: 1 });
  assert.equal(listMatches(db, alert.id)[0]?.notifyStatus, "baseline");
  assert.deepEqual(syncAlertMatches(db, alert, listJobs(db)), { pending: 0, baseline: 0 });

  markAlertsPrimed(db, [alert.id]);
  const primed = getAlert(db, alert.id);
  assert.equal(primed?.primed, true);
  upsertJobs(db, [
    {
      source: "gupy",
      externalId: "3",
      title: "Frontend Angular",
      company: "Farol",
      location: "Recife",
      workplace: "Remoto",
      url: "https://exemplo.gupy.io/job/3",
      description: "Angular.",
      publishedAt: null,
    },
  ]);
  assert.ok(primed);
  assert.deepEqual(syncAlertMatches(db, primed, listJobs(db)), { pending: 1, baseline: 0 });
  const statuses = listMatches(db, alert.id).map((match) => match.notifyStatus).sort();
  assert.deepEqual(statuses, ["baseline", "pending"]);
});

test("tira do painel a vaga que deixou de casar e apaga os casamentos com o alerta", () => {
  const db = openDatabase(":memory:");
  const alert = insertAlert(db, { ...frontend, notifyExisting: true });
  upsertJobs(db, [
    {
      source: "gupy",
      externalId: "9",
      title: "Dev Vue",
      company: "Oficina",
      location: "",
      workplace: "",
      url: "https://exemplo.gupy.io/job/9",
      description: "Vue.js",
      publishedAt: null,
    },
  ]);
  syncAlertMatches(db, alert, listJobs(db));
  const narrowed = updateAlert(db, alert.id, { ...frontend, acceptedSkills: ["Kotlin"] });
  assert.ok(narrowed);
  syncAlertMatches(db, narrowed, listJobs(db));
  assert.equal(listMatches(db, alert.id).length, 0);

  const restored = updateAlert(db, alert.id, frontend);
  assert.ok(restored);
  syncAlertMatches(db, restored, listJobs(db));
  assert.equal(deleteAlert(db, alert.id), true);
  assert.equal(listMatches(db, "").length, 0);
  assert.equal(listJobs(db).length, 1);
});
