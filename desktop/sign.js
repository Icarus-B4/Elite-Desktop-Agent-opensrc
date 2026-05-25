const { execSync } = require('child_process');
const path = require('path');

module.exports = async function(configuration) {
  const { path: filePath, hash, isAppx } = configuration;
  
  // Pfad zur System-Signtool.exe (von Windows SDK)
  const signtool = "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\signtool.exe";
  
  // Zertifikat Details
  const certPath = path.resolve(__dirname, '..', 'devcert.pfx');
  const certPassword = 'jarvis123';
  
  console.log(`[Sign] Signiere ${filePath} mit System-SignTool...`);
  
  try {
    // Grundbefehl: sign /f <cert> /p <password> /fd sha256
    let command = `"${signtool}" sign /f "${certPath}" /p ${certPassword} /fd sha256`;
    
    if (isAppx) {
      // Für Appx nutzen wir oft einen anderen Zeitstempel-Ansatz oder RFC3161
      command += ` /tr http://timestamp.digicert.com /td sha256`;
    } else {
      // Für normale EXEs
      command += ` /t http://timestamp.digicert.com`;
    }
    
    command += ` "${filePath}"`;
    
    console.log(`[Sign] Befehl: ${command}`);
    execSync(command, { stdio: 'inherit' });
    console.log(`[Sign] Erfolgreich signiert: ${filePath}`);
  } catch (error) {
    console.error(`[Sign] Fehler beim Signieren von ${filePath}:`, error.message);
    // Wir werfen den Fehler nicht, damit der Build ggf. weitergeht (oder wir werfen ihn, wenn es kritisch ist)
    throw error;
  }
};
