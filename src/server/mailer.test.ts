import assert from "node:assert/strict";
import test from "node:test";
import { buildDigest } from "./mailer";

test("o e-mail aponta a vaga de origem e não interpreta o título como HTML", () => {
  const message = buildDigest({
    alertName: "Frontend",
    totalCount: 2,
    jobs: [
      {
        title: "<script>alert(1)</script>",
        company: "Oficina",
        location: "São Paulo",
        url: "https://oficina.gupy.io/job/1",
        matchedSkills: ["React"],
      },
      {
        title: "Dev Angular",
        company: "Farol",
        location: "",
        url: "javascript:alert(1)",
        matchedSkills: ["Angular"],
      },
    ],
  });

  assert.match(message.subject, /2 vagas novas/);
  assert.match(message.text, /https:\/\/oficina\.gupy\.io\/job\/1/);
  assert.match(message.text, /Link indisponível/);
  assert.equal(message.html.includes("<script>alert"), false);
  assert.match(message.html, /&lt;script&gt;/);
  assert.equal(message.html.includes("javascript:"), false);
});

test("uma vaga nova fica no singular", () => {
  const message = buildDigest({
    alertName: "Frontend",
    totalCount: 1,
    jobs: [
      {
        title: "Dev Vue",
        company: "Oficina",
        location: "",
        url: "https://oficina.gupy.io/job/2",
        matchedSkills: ["Vue.js"],
      },
    ],
  });
  assert.match(message.subject, /1 vaga nova/);
});
