
const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, "data");
const EMP_FILE = path.join(DATA_DIR, "employees.json");
const SCHEDULE_FILE = path.join(DATA_DIR, "schedule.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

const shifts = {
  morning: { label: "Πρωί", start: "06:00", end: "14:00", required: 6 },
  middle: { label: "Ενδιάμεση", start: "11:00", end: "19:00", required: 1 },
  afternoon: { label: "Απόγευμα", start: "14:00", end: "22:00", required: 2 },
  night: { label: "Βράδυ", start: "22:00", end: "06:00", required: 1 },
  delivery: { label: "Delivery", start: "06:00", end: "14:00", required: 1, weekdaysOnly: true },
  manager: { label: "Υπεύθυνος", start: "07:00", end: "15:00", required: 1, weekdaysOnly: true }
};

app.get("/api/config", (req, res) => res.json({ shifts }));

app.get("/api/employees", (req, res) => {
  res.json(readJson(EMP_FILE, []));
});

app.post("/api/employees", (req, res) => {
  const employees = readJson(EMP_FILE, []);
  const employee = {
    id: nanoid(8),
    name: String(req.body.name || "").trim(),
    role: String(req.body.role || "Προσωπικό"),
    type: req.body.type === "temporary" ? "temporary" : "permanent",
    allowedShifts: Array.isArray(req.body.allowedShifts) ? req.body.allowedShifts : ["morning"],
    weeklyRules: {},
    fixedDays: [],
    active: true
  };
  if (!employee.name) return res.status(400).json({ error: "Το όνομα είναι υποχρεωτικό." });
  employees.push(employee);
  writeJson(EMP_FILE, employees);
  res.status(201).json(employee);
});

app.patch("/api/employees/:id", (req, res) => {
  const employees = readJson(EMP_FILE, []);
  const idx = employees.findIndex(e => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Δεν βρέθηκε εργαζόμενος." });
  employees[idx] = { ...employees[idx], ...req.body, id: employees[idx].id };
  writeJson(EMP_FILE, employees);
  res.json(employees[idx]);
});

app.delete("/api/employees/:id", (req, res) => {
  const employees = readJson(EMP_FILE, []);
  const idx = employees.findIndex(e => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Δεν βρέθηκε εργαζόμενος." });
  employees[idx].active = false;
  writeJson(EMP_FILE, employees);
  res.json({ ok: true });
});

function nextMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 1 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12,0,0,0);
  return d;
}
function isoDate(d) {
  return d.toISOString().slice(0,10);
}
function scoreCandidate(emp, shiftKey, counts, assignedToday, isWeekend) {
  if (!emp.active || assignedToday.has(emp.id)) return -9999;
  if (!emp.allowedShifts.includes(shiftKey)) return -9999;
  const total = counts[emp.id]?.total || 0;
  if (total >= 6) return -9999;
  let score = 100 - total * 8;
  if (emp.type === "temporary") score -= 25; // μόνιμοι πρώτα
  const target = emp.weeklyRules?.[shiftKey];
  const currentShiftCount = counts[emp.id]?.[shiftKey] || 0;
  if (typeof target === "number" && currentShiftCount < target) score += 35;
  if (typeof target === "number" && currentShiftCount >= target) score -= 20;
  if (emp.fixedDays?.length) {
    const dayKey = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][isWeekend.day];
    if (emp.fixedDays.includes(dayKey)) score += 45;
    else score -= 60;
  }
  return score;
}

app.post("/api/schedule/generate", (req, res) => {
  const employees = readJson(EMP_FILE, []).filter(e => e.active);
  const start = req.body.startDate ? new Date(req.body.startDate + "T12:00:00") : nextMonday();
  const days = [];
  const counts = Object.fromEntries(employees.map(e => [e.id, { total: 0 }]));
  const warnings = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const assignedToday = new Set();
    const assignments = [];

    for (const [shiftKey, shift] of Object.entries(shifts)) {
      if (shift.weekdaysOnly && isWeekend) continue;
      for (let slot = 0; slot < shift.required; slot++) {
        const ranked = employees
          .map(emp => ({ emp, score: scoreCandidate(emp, shiftKey, counts, assignedToday, { day: weekday }) }))
          .filter(x => x.score > -9000)
          .sort((a,b) => b.score - a.score);

        if (!ranked.length) {
          assignments.push({ shiftKey, employeeId: null, employeeName: "ΑΚΑΛΥΠΤΟ" });
          warnings.push(`${isoDate(date)} – ${shift.label}: δεν βρέθηκε διαθέσιμο άτομο.`);
          continue;
        }
        const chosen = ranked[0].emp;
        assignedToday.add(chosen.id);
        counts[chosen.id].total += 1;
        counts[chosen.id][shiftKey] = (counts[chosen.id][shiftKey] || 0) + 1;
        assignments.push({ shiftKey, employeeId: chosen.id, employeeName: chosen.name });
      }
    }
    days.push({ date: isoDate(date), assignments });
  }

  const result = { startDate: isoDate(start), days, warnings, generatedAt: new Date().toISOString() };
  writeJson(SCHEDULE_FILE, result);
  res.json(result);
});

app.get("/api/schedule", (req, res) => {
  res.json(readJson(SCHEDULE_FILE, {}));
});

app.listen(PORT, () => console.log(`MyWorkStation App: http://localhost:${PORT}`));
