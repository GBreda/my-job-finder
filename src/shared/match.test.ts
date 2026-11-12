import assert from "node:assert/strict";
import test from "node:test";
import { MAX_REMOTE_QUERIES } from "./constants";
import { buildSearchQueries, matchJob } from "./match";
import type { JobContent } from "./types";

function job(partial: Partial<JobContent>): JobContent {
  return {
    title: "",
    company: "Empresa",
    location: "",
    workplace: "",
    description: "",
    ...partial,
  };
}

const frontend = {
  acceptedSkills: ["React", "Angular", "Vue.js"],
  requiredTerms: [],
  excludedTerms: [],
  locations: [],
};

test("casa React, React.js e ReactJS como a mesma habilidade", () => {
  for (const title of ["Desenvolvedor React", "Frontend React.js", "Pessoa ReactJS"]) {
    const result = matchJob(job({ title }), frontend);
    assert.equal(result.matched, true);
    assert.deepEqual(result.matchedSkills, ["React"]);
  }
});

test("Vue.js aceita uma vaga que só escreve Vue", () => {
  const result = matchJob(job({ description: "Buscamos alguém com Vue e TypeScript." }), frontend);
  assert.equal(result.matched, true);
  assert.deepEqual(result.matchedSkills, ["Vue.js"]);
});

test("Angular casa com AngularJS", () => {
  const result = matchJob(job({ title: "Dev AngularJS" }), frontend);
  assert.deepEqual(result.matchedSkills, ["Angular"]);
});

test("não confunde React com reactive nem Java com JavaScript", () => {
  assert.equal(
    matchJob(job({ description: "Coordinate reactive maintenance" }), frontend).matched,
    false,
  );
  assert.equal(
    matchJob(job({ title: "Desenvolvedor Java", description: "JavaScript é diferencial" }), {
      ...frontend,
      acceptedSkills: ["Java"],
    }).matched,
    true,
  );
  assert.equal(
    matchJob(job({ title: "Desenvolvedor JavaScript" }), {
      ...frontend,
      acceptedSkills: ["Java"],
    }).matched,
    false,
  );
});

test("Node.js casa com Node e o contrário também", () => {
  const criteria = { ...frontend, acceptedSkills: ["Node.js"] };
  assert.equal(matchJob(job({ title: "Backend Node" }), criteria).matched, true);
  assert.equal(
    matchJob(job({ title: "Backend", description: "Node.js" }), { ...frontend, acceptedSkills: ["Node"] }).matched,
    true,
  );
});

test("reconhece C# e C++ como tokens inteiros", () => {
  assert.equal(matchJob(job({ title: "Dev C#" }), { ...frontend, acceptedSkills: ["C#"] }).matched, true);
  assert.equal(matchJob(job({ title: "Dev C" }), { ...frontend, acceptedSkills: ["C#"] }).matched, false);
  assert.equal(matchJob(job({ description: "rotinas em C++" }), { ...frontend, acceptedSkills: ["C++"] }).matched, true);
});

test("qualquer habilidade do grupo serve e a exclusão ganha", () => {
  const angularOnly = matchJob(job({ title: "Frontend Angular" }), frontend);
  assert.deepEqual(angularOnly.matchedSkills, ["Angular"]);

  const internship = matchJob(job({ title: "Estágio React" }), {
    ...frontend,
    excludedTerms: ["estágio"],
  });
  assert.equal(internship.matched, false);
});

test("termos obrigatórios e lugar precisam fechar juntos", () => {
  const criteria = {
    ...frontend,
    requiredTerms: ["pleno"],
    locations: ["São Paulo"],
  };
  assert.equal(
    matchJob(job({ title: "React pleno", location: "Sao Paulo" }), criteria).matched,
    true,
  );
  assert.equal(matchJob(job({ title: "React sênior", location: "Sao Paulo" }), criteria).matched, false);
  assert.equal(matchJob(job({ title: "React pleno", location: "Recife" }), criteria).matched, false);
});

test("remoto também casa com remote e home office", () => {
  const criteria = { ...frontend, locations: ["remoto"] };
  assert.equal(matchJob(job({ title: "React", workplace: "remote" }), criteria).matched, true);
  assert.equal(
    matchJob(job({ title: "React", description: "Modelo: home office" }), criteria).matched,
    true,
  );
  assert.equal(matchJob(job({ title: "React", location: "Recife", workplace: "Presencial" }), criteria).matched, false);
});

test("full stack ignora hífen", () => {
  const result = matchJob(job({ title: "Pessoa full-stack" }), {
    ...frontend,
    acceptedSkills: ["full stack"],
  });
  assert.equal(result.matched, true);
});

test("sem habilidade aceita não há match", () => {
  assert.equal(matchJob(job({ title: "React" }), { ...frontend, acceptedSkills: [] }).matched, false);
});

test("busca remota deduplica, ignora termo curto e respeita o teto", () => {
  const queries = buildSearchQueries({
    acceptedSkills: ["React", "react.js", "C", "Vue", "Angular", "Svelte", "Next", "Node", "TypeScript", "Java"],
    requiredTerms: ["desenvolvedor"],
  });
  assert.equal(queries[0], "React");
  assert.equal(queries.includes("react.js"), false);
  assert.equal(queries.includes("C"), false);
  assert.equal(queries.length, MAX_REMOTE_QUERIES);
  assert.equal(queries.at(-1), "Java");
  assert.equal(queries.includes("desenvolvedor"), false);
});
