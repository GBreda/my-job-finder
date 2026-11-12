import { INITIAL_SCAN_DELAY_MS, MINUTE_MS } from "../shared/constants";
import { getSettings, type AppDatabase } from "./db";
import { runScan } from "./scanner";

let timer: ReturnType<typeof setInterval> | null = null;
let initialTimer: ReturnType<typeof setTimeout> | null = null;

export function reschedule(db: AppDatabase): void {
  if (timer) {
    clearInterval(timer);
  }
  const minutes = getSettings(db).scanIntervalMinutes;
  timer = setInterval(() => {
    void runScan(db, "schedule").catch((error: unknown) => {
      console.error("[radar] busca agendada falhou", error);
    });
  }, minutes * MINUTE_MS);
  timer.unref();
}

export function startScheduler(db: AppDatabase): void {
  reschedule(db);
  initialTimer = setTimeout(() => {
    void runScan(db, "schedule").catch((error: unknown) => {
      console.error("[radar] busca inicial falhou", error);
    });
  }, INITIAL_SCAN_DELAY_MS);
  initialTimer.unref();
}
