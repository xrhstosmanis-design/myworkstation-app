import {authenticateErganiTrial, listErganiTrialEmployerServices} from "../src/services/ergani-trial-work-card.js";

try {
  const {username, password} = JSON.parse(process.env.ERGANI_TRIAL_CLOCK_CONFIG || "{}");
  const token = await authenticateErganiTrial({username, password});
  const services = await listErganiTrialEmployerServices({token});
  console.log(JSON.stringify(services.map(({name, description, parameters}) => ({
    name,
    description,
    parameters:parameters.map(({name, isRequired, type}) => ({name, isRequired, type}))
  })), null, 2));
} catch {
  console.error("Η ανάγνωση των διαθέσιμων υπηρεσιών του δοκιμαστικού ΕΡΓΑΝΗ δεν επιβεβαιώθηκε. Έλεγξε τη ρύθμιση του δοκιμαστικού εργοδότη.");
  process.exitCode = 1;
}
