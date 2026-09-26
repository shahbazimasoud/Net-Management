import {
  RemoteServer,
  ApacheConfigFileBackup,
  ApacheEditorSaveResult,
  ApacheEditorTestResult,
  ApacheServiceAction,
  ApacheServiceActionResult,
} from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverApacheInstallation, isLikelyApacheBinary } from './apacheDiscovery';

/**
 * Validates that requested file path is a legitimate Apache configuration file
 * and strictly prevents path traversal or sensitive system file manipulation.
 */
export function assertSafeApachePath(filePath: string): string {
  const clean = filePath.trim();
  if (
    clean.includes('..') ||
    clean.includes('/etc/shadow') ||
    clean.includes('/etc/passwd') ||
    clean.includes('/etc/sudoers') ||
    clean.includes('.ssh') ||
    clean.includes('.env') ||
    clean.includes('/proc') ||
    clean.includes('/sys') ||
    clean.includes('/dev')
  ) {
    throw new Error('Access denied: Unauthorized or unsafe file path requested.');
  }

  // Must end in .conf, .load, .htaccess or contain apache/httpd/sites-/conf-/mods- in path
  const isApachePath =
    clean.endsWith('.conf') ||
    clean.endsWith('.load') ||
    clean.endsWith('.default') ||
    clean.endsWith('.htaccess') ||
    clean.includes('apache') ||
    clean.includes('httpd') ||
    clean.includes('sites-available') ||
    clean.includes('sites-enabled') ||
    clean.includes('conf-available') ||
    clean.includes('conf-enabled') ||
    clean.includes('mods-available') ||
    clean.includes('mods-enabled') ||
    clean.includes('conf.d');

  if (!isApachePath) {
    throw new Error('Access denied: Target file must be an Apache configuration file or within Apache paths.');
  }

  return clean;
}

/**
 * Reads raw configuration file content directly from the remote server
 */
export async function readApacheConfigFile(
  server: RemoteServer,
  filePath: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  content: string;
  sizeBytes: number;
  lastModified?: string;
  permissions?: string;
  error?: string;
}> {
  const safePath = assertSafeApachePath(filePath);

  const script = `python3 - << 'PYEOF'
import os, sys, json, base64, datetime, stat

path = """${safePath}"""
if not os.path.exists(path):
    print(json.dumps({"error": f"File does not exist: {path}"}))
    sys.exit(0)

if not os.access(path, os.R_OK):
    print(json.dumps({"error": f"Permission denied reading file: {path}"}))
    sys.exit(0)

try:
    st = os.stat(path)
    with open(path, 'rb') as f:
        data = f.read()
    
    b64_content = base64.b64encode(data).decode('ascii')
    perms = stat.filemode(st.st_mode)
    res = {
        "success": True,
        "contentB64": b64_content,
        "sizeBytes": st.st_size,
        "lastModified": datetime.datetime.fromtimestamp(st.st_mtime).isoformat(),
        "permissions": perms
    }
except Exception as e:
    res = {"error": str(e)}

print("===JSON_START===")
print(json.dumps(res))
print("===JSON_END===")
PYEOF
`;

  try {
    const rawOut = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);
    if (rawOut.includes('===JSON_START===') && rawOut.includes('===JSON_END===')) {
      const jsonStr = rawOut.split('===JSON_START===')[1].split('===JSON_END===')[0].trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed.error) {
        return { success: false, content: '', sizeBytes: 0, error: parsed.error };
      }
      const text = Buffer.from(parsed.contentB64, 'base64').toString('utf-8');
      return {
        success: true,
        content: text,
        sizeBytes: parsed.sizeBytes,
        lastModified: parsed.lastModified,
        permissions: parsed.permissions,
      };
    }
  } catch (err: any) {
    return { success: false, content: '', sizeBytes: 0, error: err?.message || 'Failed to read file' };
  }

  return { success: false, content: '', sizeBytes: 0, error: 'Failed to read file from remote server' };
}

/**
 * Tests candidate configuration content against the real Apache engine
 * by performing a safe non-destructive in-place trial with instant restoration.
 */
export async function testApacheConfigFileCandidate(
  server: RemoteServer,
  filePath: string,
  candidateContent: string,
  ephemeralPassword?: string
): Promise<ApacheEditorTestResult> {
  const safePath = assertSafeApachePath(filePath);
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  
  const chosenControl = discovery.controlBinaryPath || (discovery.binaryPath && isLikelyApacheBinary(discovery.binaryPath) ? discovery.binaryPath : 'apachectl');
  const base64Candidate = Buffer.from(candidateContent, 'utf-8').toString('base64');
  const timestamp = Date.now();

  const testScript = `python3 - << 'PYEOF'
import os, sys, subprocess, base64, json, shutil

control_bin = "${chosenControl}"
target_path = "${safePath}"
b64_data = """${base64Candidate}"""
ts = ${timestamp}
backup_temp = f"/tmp/cand_orig_{ts}.bak"

result = {"isValid": False, "output": "", "error": None, "warnings": []}

def run_apache_test():
    # Sourcing envvars if present on Debian/Ubuntu
    cmd = f"if [ -f /etc/apache2/envvars ]; then . /etc/apache2/envvars; fi; {control_bin} -t 2>&1"
    proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=12)
    output = (proc.stdout or '') + "\\n" + (proc.stderr or '')
    return proc.returncode, output.strip()

file_existed = os.path.exists(target_path)

try:
    # 1. Back up original file if it exists
    if file_existed:
        shutil.copy2(target_path, backup_temp)

    # 2. Write candidate content
    content = base64.b64decode(b64_data.encode('ascii')).decode('utf-8')
    with open(target_path, 'w', encoding='utf-8') as f:
        f.write(content)

    # 3. Execute syntax test
    retcode, out = run_apache_test()
    is_ok = (retcode == 0) and ("syntax ok" in out.lower())
    result["isValid"] = is_ok
    result["output"] = out

    # Collect any warning lines
    for line in out.splitlines():
        if "warn" in line.lower() or "ah" in line.lower():
            result["warnings"].append(line.strip())

except Exception as ex:
    result["error"] = str(ex)
    result["output"] = f"Execution error: {str(ex)}"
finally:
    # 4. GUARANTEED IMMEDIATE RESTORATION: Always restore the original state!
    if file_existed and os.path.exists(backup_temp):
        try:
            shutil.copy2(backup_temp, target_path)
            os.remove(backup_temp)
        except:
            pass
    elif not file_existed and os.path.exists(target_path):
        try:
            os.remove(target_path)
        except:
            pass

print("===TEST_JSON_START===")
print(json.dumps(result))
print("===TEST_JSON_END===")
PYEOF
`;

  try {
    const rawOut = await runAdaptiveSshCommand(server, testScript, ephemeralPassword, 18000);
    if (rawOut.includes('===TEST_JSON_START===') && rawOut.includes('===TEST_JSON_END===')) {
      const jsonStr = rawOut.split('===TEST_JSON_START===')[1].split('===TEST_JSON_END===')[0].trim();
      return JSON.parse(jsonStr);
    }
  } catch (err: any) {
    return {
      isValid: false,
      output: err?.message || 'Remote test exception',
      error: err?.message || 'Failed to test candidate configuration',
    };
  }

  return { isValid: false, output: 'No test output returned', error: 'Verification failed' };
}

/**
 * Safely saves edited configuration file with automatic timestamped backup and atomic rollback
 * upon any syntax test failure. Also performs graceful service reload if requested.
 */
export async function saveApacheConfigFileSafe(
  server: RemoteServer,
  filePath: string,
  newContent: string,
  autoReload: boolean = true,
  ephemeralPassword?: string
): Promise<ApacheEditorSaveResult> {
  const safePath = assertSafeApachePath(filePath);
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  
  const chosenControl = discovery.controlBinaryPath || (discovery.binaryPath && isLikelyApacheBinary(discovery.binaryPath) ? discovery.binaryPath : 'apachectl');
  const serviceName = discovery.serviceName || 'apache2';
  const serviceManager = discovery.serviceManager || 'systemd';
  
  const base64Content = Buffer.from(newContent, 'utf-8').toString('base64');
  const timestamp = Date.now();

  const saveScript = `python3 - << 'PYEOF'
import os, sys, subprocess, base64, json, shutil, datetime

control_bin = "${chosenControl}"
service_name = "${serviceName}"
service_manager = "${serviceManager}"
target_path = "${safePath}"
b64_data = """${base64Content}"""
auto_reload = ${autoReload ? 'True' : 'False'}
ts = ${timestamp}

result = {
    "success": False,
    "filePath": target_path,
    "backupCreated": None,
    "syntaxTestPassed": False,
    "syntaxOutput": "",
    "serviceReloaded": False,
    "reloadOutput": "",
    "error": None
}

backup_dir = "/var/backups/nettopology_apache"
try:
    os.makedirs(backup_dir, exist_ok=True)
except:
    backup_dir = None

# Determine backup location
clean_name = os.path.basename(target_path).replace('/', '_')
if backup_dir and os.path.isdir(backup_dir) and os.access(backup_dir, os.W_OK):
    backup_file = os.path.join(backup_dir, f"{clean_name}.bak_{ts}")
else:
    backup_file = f"{target_path}.bak_{ts}"

try:
    content = base64.b64decode(b64_data.encode('ascii')).decode('utf-8')

    # 1. Create timestamped backup of current file if it exists
    if os.path.exists(target_path):
        shutil.copy2(target_path, backup_file)
        result["backupCreated"] = backup_file

    # 2. Write new content to target file
    with open(target_path, 'w', encoding='utf-8') as f:
        f.write(content)

    # 3. Test Apache configuration with control binary and envvars
    cmd = f"if [ -f /etc/apache2/envvars ]; then . /etc/apache2/envvars; fi; {control_bin} -t 2>&1"
    test_proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=12)
    test_out = (test_proc.stdout or '') + "\\n" + (test_proc.stderr or '')
    result["syntaxOutput"] = test_out.strip()
    is_ok = (test_proc.returncode == 0) and ("syntax ok" in test_out.lower())
    result["syntaxTestPassed"] = is_ok

    if not is_ok:
        # ATOMIC ROLLBACK! Restore original file immediately
        if backup_file and os.path.exists(backup_file):
            shutil.copy2(backup_file, target_path)
        elif not os.path.exists(backup_file) and os.path.exists(target_path):
            os.remove(target_path)
        result["error"] = "Apache syntax verification failed. Changes were automatically reverted to previous state."
    else:
        # Configuration is valid!
        result["success"] = True

        # 4. Graceful Reload if requested
        if auto_reload:
            rel_cmd = f"systemctl reload {service_name}" if shutil.which("systemctl") else f"{control_bin} graceful"
            try:
                rel_proc = subprocess.run(rel_cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
                rel_out = (rel_proc.stdout or '') + "\\n" + (rel_proc.stderr or '')
                result["serviceReloaded"] = (rel_proc.returncode == 0)
                result["reloadOutput"] = rel_out.strip()
            except Exception as e_rel:
                result["serviceReloaded"] = False
                result["reloadOutput"] = str(e_rel)

except Exception as ex:
    # On exception, ensure restore if possible
    if backup_file and os.path.exists(backup_file) and os.path.exists(target_path):
        try:
            shutil.copy2(backup_file, target_path)
        except:
            pass
    result["error"] = str(ex)

print("===SAVE_JSON_START===")
print(json.dumps(result))
print("===SAVE_JSON_END===")
PYEOF
`;

  try {
    const rawOut = await runAdaptiveSshCommand(server, saveScript, ephemeralPassword, 20000);
    if (rawOut.includes('===SAVE_JSON_START===') && rawOut.includes('===SAVE_JSON_END===')) {
      const jsonStr = rawOut.split('===SAVE_JSON_START===')[1].split('===SAVE_JSON_END===')[0].trim();
      return JSON.parse(jsonStr);
    }
  } catch (err: any) {
    return {
      success: false,
      filePath: safePath,
      syntaxTestPassed: false,
      syntaxOutput: err?.message || 'Save execution exception',
      serviceReloaded: false,
      error: err?.message || 'Failed to save configuration file',
    };
  }

  return {
    success: false,
    filePath: safePath,
    syntaxTestPassed: false,
    syntaxOutput: 'No output from save process',
    serviceReloaded: false,
    error: 'Failed to save configuration',
  };
}

/**
 * Lists all existing timestamped backups for a specific Apache configuration file
 */
export async function listApacheFileBackups(
  server: RemoteServer,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; backups: ApacheConfigFileBackup[]; error?: string }> {
  const safePath = assertSafeApachePath(filePath);

  const script = `python3 - << 'PYEOF'
import os, sys, glob, json, datetime

target_path = """${safePath}"""
filename = os.path.basename(target_path)
backup_dir = "/var/backups/nettopology_apache"

def format_size(bytes_val):
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.1f} KB"
    else:
        return f"{bytes_val / (1024 * 1024):.1f} MB"

found = []

# 1. Search in central backup directory
if os.path.isdir(backup_dir):
    clean_name = filename.replace('/', '_')
    pattern = os.path.join(backup_dir, f"{clean_name}.bak_*")
    for bp in glob.glob(pattern):
        try:
            st = os.stat(bp)
            found.append({
                "id": os.path.basename(bp),
                "backupPath": bp,
                "originalPath": target_path,
                "timestamp": datetime.datetime.fromtimestamp(st.st_mtime).isoformat(),
                "sizeBytes": st.st_size,
                "sizeHuman": format_size(st.st_size)
            })
        except:
            pass

# 2. Search adjacent backup files in the same directory
parent_dir = os.path.dirname(target_path)
if os.path.isdir(parent_dir):
    adj_pattern = os.path.join(parent_dir, f"{filename}.bak*")
    for bp in glob.glob(adj_pattern):
        if any(item["backupPath"] == bp for item in found):
            continue
        try:
            st = os.stat(bp)
            found.append({
                "id": os.path.basename(bp),
                "backupPath": bp,
                "originalPath": target_path,
                "timestamp": datetime.datetime.fromtimestamp(st.st_mtime).isoformat(),
                "sizeBytes": st.st_size,
                "sizeHuman": format_size(st.st_size)
            })
        except:
            pass

# Sort newest first
found.sort(key=lambda x: x["timestamp"], reverse=True)

print("===BACKUPS_JSON_START===")
print(json.dumps({"success": True, "backups": found}))
print("===BACKUPS_JSON_END===")
PYEOF
`;

  try {
    const rawOut = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);
    if (rawOut.includes('===BACKUPS_JSON_START===') && rawOut.includes('===BACKUPS_JSON_END===')) {
      const jsonStr = rawOut.split('===BACKUPS_JSON_START===')[1].split('===BACKUPS_JSON_END===')[0].trim();
      return JSON.parse(jsonStr);
    }
  } catch (err: any) {
    return { success: false, backups: [], error: err?.message || 'Failed to list backups' };
  }

  return { success: false, backups: [], error: 'Failed to retrieve backups list' };
}

/**
 * Restores a specific backup file to the target configuration path with automatic validation
 */
export async function restoreApacheFileBackup(
  server: RemoteServer,
  filePath: string,
  backupPath: string,
  autoReload: boolean = true,
  ephemeralPassword?: string
): Promise<ApacheEditorSaveResult> {
  const safePath = assertSafeApachePath(filePath);
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  
  const chosenControl = discovery.controlBinaryPath || (discovery.binaryPath && isLikelyApacheBinary(discovery.binaryPath) ? discovery.binaryPath : 'apachectl');
  const serviceName = discovery.serviceName || 'apache2';

  const script = `python3 - << 'PYEOF'
import os, sys, subprocess, shutil, json

control_bin = "${chosenControl}"
service_name = "${serviceName}"
target_path = "${safePath}"
backup_path = """${backupPath.trim()}"""
auto_reload = ${autoReload ? 'True' : 'False'}

result = {
    "success": False,
    "filePath": target_path,
    "syntaxTestPassed": False,
    "syntaxOutput": "",
    "serviceReloaded": False,
    "reloadOutput": "",
    "error": None
}

if not os.path.exists(backup_path):
    result["error"] = f"Backup file does not exist: {backup_path}"
    print("===RESTORE_JSON_START===")
    print(json.dumps(result))
    print("===RESTORE_JSON_END===")
    sys.exit(0)

# Safety backup of current file before overwriting with historical version
temp_safety = f"{target_path}.temp_pre_restore"
has_current = os.path.exists(target_path)
if has_current:
    shutil.copy2(target_path, temp_safety)

try:
    # 1. Restore from backup
    shutil.copy2(backup_path, target_path)

    # 2. Syntax verification test
    cmd = f"if [ -f /etc/apache2/envvars ]; then . /etc/apache2/envvars; fi; {control_bin} -t 2>&1"
    test_proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=12)
    test_out = (test_proc.stdout or '') + "\\n" + (test_proc.stderr or '')
    result["syntaxOutput"] = test_out.strip()
    is_ok = (test_proc.returncode == 0) and ("syntax ok" in test_out.lower())
    result["syntaxTestPassed"] = is_ok

    if not is_ok:
        # Revert to safety backup
        if has_current and os.path.exists(temp_safety):
            shutil.copy2(temp_safety, target_path)
        result["error"] = "Restored configuration failed syntax test. Reverted to previous state."
    else:
        result["success"] = True
        if auto_reload:
            rel_cmd = f"systemctl reload {service_name}" if shutil.which("systemctl") else f"{control_bin} graceful"
            try:
                rel_proc = subprocess.run(rel_cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
                rel_out = (rel_proc.stdout or '') + "\\n" + (rel_proc.stderr or '')
                result["serviceReloaded"] = (rel_proc.returncode == 0)
                result["reloadOutput"] = rel_out.strip()
            except Exception as e_rel:
                result["serviceReloaded"] = False
                result["reloadOutput"] = str(e_rel)

finally:
    if os.path.exists(temp_safety):
        try:
            os.remove(temp_safety)
        except:
            pass

print("===RESTORE_JSON_START===")
print(json.dumps(result))
print("===RESTORE_JSON_END===")
PYEOF
`;

  try {
    const rawOut = await runAdaptiveSshCommand(server, script, ephemeralPassword, 18000);
    if (rawOut.includes('===RESTORE_JSON_START===') && rawOut.includes('===RESTORE_JSON_END===')) {
      const jsonStr = rawOut.split('===RESTORE_JSON_START===')[1].split('===RESTORE_JSON_END===')[0].trim();
      return JSON.parse(jsonStr);
    }
  } catch (err: any) {
    return {
      success: false,
      filePath: safePath,
      syntaxTestPassed: false,
      syntaxOutput: err?.message || 'Restore exception',
      serviceReloaded: false,
      error: err?.message || 'Failed to restore backup',
    };
  }

  return {
    success: false,
    filePath: safePath,
    syntaxTestPassed: false,
    syntaxOutput: 'No output from restore process',
    serviceReloaded: false,
    error: 'Failed to restore configuration',
  };
}

/**
 * Executes service actions (start, stop, restart, reload, graceful, enable, disable, status)
 * using the real detected service manager and service name on the remote Linux host.
 */
export async function manageApacheService(
  server: RemoteServer,
  action: ApacheServiceAction,
  ephemeralPassword?: string
): Promise<ApacheServiceActionResult> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  
  const serviceName = discovery.serviceName || 'apache2';
  const serviceManager = discovery.serviceManager || 'systemd';
  const chosenControl = discovery.controlBinaryPath || (discovery.binaryPath && isLikelyApacheBinary(discovery.binaryPath) ? discovery.binaryPath : 'apachectl');

  let cmd = '';

  if (serviceManager === 'systemd') {
    switch (action) {
      case 'start':
        cmd = `systemctl start ${serviceName}`;
        break;
      case 'stop':
        cmd = `systemctl stop ${serviceName}`;
        break;
      case 'restart':
        cmd = `systemctl restart ${serviceName}`;
        break;
      case 'reload':
      case 'graceful':
        cmd = `systemctl reload ${serviceName} || ${chosenControl} graceful`;
        break;
      case 'enable':
        cmd = `systemctl enable ${serviceName}`;
        break;
      case 'disable':
        cmd = `systemctl disable ${serviceName}`;
        break;
      case 'status':
        cmd = `systemctl status ${serviceName} --no-pager -l`;
        break;
      default:
        throw new Error(`Unsupported service action: ${action}`);
    }
  } else if (serviceManager === 'openrc') {
    switch (action) {
      case 'start':
        cmd = `rc-service ${serviceName} start`;
        break;
      case 'stop':
        cmd = `rc-service ${serviceName} stop`;
        break;
      case 'restart':
        cmd = `rc-service ${serviceName} restart`;
        break;
      case 'reload':
      case 'graceful':
        cmd = `rc-service ${serviceName} reload || ${chosenControl} graceful`;
        break;
      case 'enable':
        cmd = `rc-update add ${serviceName} default`;
        break;
      case 'disable':
        cmd = `rc-update del ${serviceName} default`;
        break;
      case 'status':
        cmd = `rc-service ${serviceName} status`;
        break;
    }
  } else {
    // SysV init / direct control binary fallback
    switch (action) {
      case 'start':
        cmd = `service ${serviceName} start || ${chosenControl} start`;
        break;
      case 'stop':
        cmd = `service ${serviceName} stop || ${chosenControl} stop`;
        break;
      case 'restart':
        cmd = `service ${serviceName} restart || ${chosenControl} restart`;
        break;
      case 'reload':
      case 'graceful':
        cmd = `service ${serviceName} reload || ${chosenControl} graceful`;
        break;
      case 'enable':
        cmd = `chkconfig ${serviceName} on 2>/dev/null || update-rc.d ${serviceName} defaults 2>/dev/null || true`;
        break;
      case 'disable':
        cmd = `chkconfig ${serviceName} off 2>/dev/null || update-rc.d -f ${serviceName} remove 2>/dev/null || true`;
        break;
      case 'status':
        cmd = `service ${serviceName} status || ${chosenControl} status`;
        break;
    }
  }

  // Sourcing envvars prefix for Debian/Ubuntu
  const fullCmd = `if [ -f /etc/apache2/envvars ]; then . /etc/apache2/envvars; fi; ${cmd} 2>&1`;

  try {
    const rawOut = await runAdaptiveSshCommand(server, fullCmd, ephemeralPassword, 15000);
    const success =
      action === 'status'
        ? true
        : !rawOut.toLowerCase().includes('failed') && !rawOut.toLowerCase().includes('error:');

    // Query active state
    let activeState = 'unknown';
    try {
      const stateCmd = `systemctl is-active ${serviceName} 2>/dev/null || echo unknown`;
      const stOut = await runAdaptiveSshCommand(server, stateCmd, ephemeralPassword, 5000);
      activeState = stOut.trim();
    } catch {
      // Ignored
    }

    return {
      success,
      action,
      serviceName,
      serviceManager,
      output: rawOut.trim(),
      activeState,
    };
  } catch (err: any) {
    return {
      success: false,
      action,
      serviceName,
      serviceManager,
      output: err?.message || 'Failed to execute service action',
      error: err?.message || 'Remote command failed',
    };
  }
}
