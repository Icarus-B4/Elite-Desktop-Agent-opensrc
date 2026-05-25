const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

function getPaiRoot() {
  const override = process.env.PAI_HOME || process.env.ELITE_PAI_HOME;
  if (override && override.trim()) {
    return override.trim();
  }
  return path.join(os.homedir(), '.claude', 'PAI');
}

function getPulseManagerScript() {
  return path.join(getPaiRoot(), 'Pulse', 'manage.ps1');
}

function buildPulseCommand(action) {
  const script = getPulseManagerScript();
  return {
    cmd: 'powershell.exe',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, action],
  };
}

function createPulseProcess(action, options = {}) {
  const { cmd, args } = buildPulseCommand(action);
  return spawn(cmd, args, {
    ...options,
    shell: false,
    windowsHide: true,
  });
}

const hermesRuntime = require('./hermes-runtime');

module.exports = {
  getPaiRoot,
  getPulseManagerScript,
  buildPulseCommand,
  createPulseProcess,
  ...hermesRuntime,
};
