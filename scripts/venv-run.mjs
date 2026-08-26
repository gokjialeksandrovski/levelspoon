// Resolves the project's .venv Python explicitly, so `npm run` scripts work
// regardless of whether the venv is activated or what else sits on PATH -
// a system Python with none of the project's dependencies was resolving
// first on this machine.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const VENV_PYTHON_CANDIDATES = [".venv/Scripts/python.exe", ".venv/bin/python"];

const pythonPath = VENV_PYTHON_CANDIDATES.find(existsSync);
if (!pythonPath) {
  console.error("No .venv found - see README Setup (python -m venv .venv).");
  process.exit(1);
}

const result = spawnSync(pythonPath, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);
