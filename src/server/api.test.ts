import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { AlertInput } from "../shared/types";
import { createApp, registerErrorHandler } from "./app";
import { ensureSettings, openDatabase } from "./db";

const EPHEMERAL_PORT = 0;

const frontend: AlertInput = {
  name: "Frontend",
  acceptedSkills: ["React", "Angular", "Vue.js"],
  requiredTerms: [],
  excludedTerms: ["estágio"],
  locations: [],
  sources: ["gupy"],
  active: true,
  notifyExisting: false,
};

async function listen(app: ReturnType<typeof createApp>): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(EPHEMERAL_PORT, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("a API grava o alerta, recusa dado inválido e busca sem vazar HTML de erro", async () => {
  const db = openDatabase(":memory:");
  ensureSettings(db);
  const app = createApp(db);
  registerErrorHandler(app);
  const server = await listen(app);

  try {
    const invalid = await fetch(`${server.baseUrl}/api/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Frontend" }),
    });
    const invalidBody = (await invalid.json()) as { error?: string };
    assert.equal(invalid.status, 400);
    assert.match(invalidBody.error ?? "", /habilidade/i);

    const created = await fetch(`${server.baseUrl}/api/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...frontend, active: false }),
    });
    assert.equal(created.status, 201);
    const alert = (await created.json()) as { acceptedSkills: string[]; primed: boolean };
    assert.deepEqual(alert.acceptedSkills, ["React", "Angular", "Vue.js"]);
    assert.equal(alert.primed, false);

    const scanResponse = await fetch(`${server.baseUrl}/api/scan`, { method: "POST" });
    assert.equal(scanResponse.status, 200);
    const scanBody = (await scanResponse.json()) as { scan: { newMatchCount: number } };
    assert.equal(typeof scanBody.scan.newMatchCount, "number");

    const status = await fetch(`${server.baseUrl}/api/status`);
    const statusBody = (await status.json()) as { smtpConfigured: boolean; lastScan: { id: string } | null };
    assert.equal(status.ok, true);
    assert.equal(statusBody.smtpConfigured, false);
    assert.ok(statusBody.lastScan?.id);
  } finally {
    await server.close();
  }
});
