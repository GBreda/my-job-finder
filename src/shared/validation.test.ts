import assert from "node:assert/strict";
import test from "node:test";
import { validateAlertInput } from "./validation";

const valid = {
  name: "Frontend",
  acceptedSkills: ["React", "Angular", "Vue.js"],
  requiredTerms: [],
  excludedTerms: ["estágio"],
  locations: [],
  sources: ["gupy", "himalayas"],
  active: true,
  notifyExisting: false,
};

test("aceita o alerta de frontend com habilidades equivalentes", () => {
  const result = validateAlertInput(valid);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.acceptedSkills, ["React", "Angular", "Vue.js"]);
  }
});

test("recusa alerta sem habilidade e termo aceito junto de ignorado", () => {
  const empty = validateAlertInput({ ...valid, acceptedSkills: [] });
  assert.equal(empty.ok, false);

  const clash = validateAlertInput({ ...valid, excludedTerms: ["React"] });
  assert.equal(clash.ok, false);
});

test("deduplica habilidades e recusa fonte desconhecida", () => {
  const duplicated = validateAlertInput({ ...valid, acceptedSkills: ["React", "react.js"] });
  assert.equal(duplicated.ok, true);
  if (duplicated.ok) {
    assert.deepEqual(duplicated.value.acceptedSkills, ["React"]);
  }

  const source = validateAlertInput({ ...valid, sources: ["linkedin"] });
  assert.equal(source.ok, false);
});
