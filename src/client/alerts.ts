import type { Alert, AlertInput } from "../shared/types";

export const emptyAlert = (): AlertInput => ({
  name: "",
  acceptedSkills: [],
  requiredTerms: [],
  excludedTerms: [],
  locations: [],
  sources: ["gupy", "himalayas", "jobicy"],
  active: true,
  notifyExisting: false,
});

export const frontendAlertExample = (): AlertInput => ({
  ...emptyAlert(),
  name: "Frontend",
  acceptedSkills: ["React", "Angular", "Vue.js"],
  excludedTerms: ["estágio"],
});

export function toAlertInput(alert: Alert): AlertInput {
  return {
    name: alert.name,
    acceptedSkills: alert.acceptedSkills,
    requiredTerms: alert.requiredTerms,
    excludedTerms: alert.excludedTerms,
    locations: alert.locations,
    sources: alert.sources,
    active: alert.active,
    notifyExisting: alert.notifyExisting,
  };
}
