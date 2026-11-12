import { APP_TIME_ZONE } from "../shared/constants";
import type { NotifyStatus, ScanReason } from "../shared/types";

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: APP_TIME_ZONE,
});

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "Sem data";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }
  return dateTimeFormat.format(date);
}

export function notifyLabel(status: NotifyStatus): string {
  switch (status) {
    case "pending":
      return "Nova";
    case "sent":
      return "Avisada";
    case "baseline":
      return "Já estava no ar";
    case "error":
      return "Falha no e-mail";
  }
}

export function scanReasonLabel(reason: ScanReason): string {
  return reason === "manual" ? "Manual" : "Agendada";
}
