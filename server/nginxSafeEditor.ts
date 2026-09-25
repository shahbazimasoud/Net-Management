import { RemoteServer, NginxConfigFileBackup, NginxEditorSaveResult, NginxEditorTestResult } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverNginxInstallation } from './nginxDiscovery';

/**
 * Validates that requested file path is a legitimate Nginx configuration file
 * and strictly prevents path traversal or system file manipulation.
 */
function assertSafeNginxPath(filePath: string): string {
  const clean = filePath.trim();
  if (
    clean.includes('..') ||
    clean.includes('/etc/shadow') ||
    clean.includes('/etc/passwd') ||
    clean.includes('/etc/sudoers') ||
    clean.includes('.ssh') ||
    clean.includes('.env') ||
    clean.includes('/proc') ||
    clean.includes('/sys')
  ) {
    throw new Error('Access denied: Unauthorized file path requested.');
  }

  // Must end in .conf or contain nginx in path
  if (!clean.endsWith('.conf') && !clean.includes('nginx') && !clean.includes('sites-')) {
    throw new Error('Access denied: Target file must be an Nginx configuration file.');
  }

  return clean;
}

/**
 * Reads raw configuration file content directly from the remote server
 */
export async function readNginxConfigFile(
  server: RemoteServer,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; content: string; sizeBytes: number; lastModified?: string; error?: string }> {
  const safePath = assertSafeNginxPath(filePath);

  const script = `python3 - << 'PYEOF'
import os, sys, json, base64, datetime

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
    res = {
        "success": True,
        "contentB64": b64_content,
        "sizeBytes": st.st_size,
        "lastModified": datetime.datetime.fromtimestamp(st.st_mtime).isoformat()
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
      };
    }
  } catch (err: any) {
    return { success: false, content: '', sizeBytes: 0, error: err?.message || 'Failed to read file' };
  }

  return { success: false, content: '', sizeBytes: 0, error: 'Failed to read file from remote server' };
}

/**
 * Tests candidate configuration content in an isolated standalone test context
 */
export async function testNginxConfigFileCandidate(
  server: RemoteServer,
  filePath: string,
  candidateContent: string,
  ephemeralPassword?: string
): Promise<NginxEditorTestResult> {
  const safePath = assertSafeNginxPath(filePath);
  const discovery = await discoverNginxInstallation(server, ephemeralPassword);
  const nginxBinary = discovery.binaryPath || '/usr/sbin/nginx';

  const base64Candidate = Buffer.from(candidateContent, 'utf-8').toString('base64');
  const timestamp = Date.now();
  const candidatePath = `/tmp/cand_edit_${timestamp}.conf`;
  const wrapperPath = `/tmp/wrap_edit_${timestamp}.conf`;

  const isMainConfig = safePath.endsWith('nginx.conf');

  const testScript = `python3 - << 'PYEOF'
import os, sys, subprocess, base64, json

binary = "${nginxBinary}"
candidate_path = "${candidatePath}"
wrapper_path = "${wrapperPath}"
target_path = "${safePath}"
is_main = ${isMainConfig ? 'True' : 'False'}
b64_data = """${base64Candidate}"""

result = {"isValid": False, "output": "", "error": None}

try:
    content = base64.b64decode(b64_data.encode('ascii')).decode('utf-8')
    with open(candidate_path, 'w', encoding='utf-8') as f:
        f.write(content)

    if is_main:
        # If it's the main nginx.conf, test directly with -t -c
        cmd = [binary, "-t", "-c", candidate_path]
    else:
        # Wrap in standalone context
        wrapper_content = f"""
events {{
    worker_connections 1024;
}}
http {{
    include {candidate_path};
}}
"""
        with open(wrapper_path, 'w', encoding='utf-8') as f:
            f.write(wrapper_content)
        cmd = [binary, "-t", "-c", wrapper_path]

    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=12)
    output = (proc.stdout or '') + "\\n" + (proc.stderr or '')
    is_ok = (proc.returncode == 0) and ("syntax is ok" in output.lower())
    result["isValid"] = is_ok
    result["output"] = output.strip()
except Exception as ex:
    result["error"] = str(ex)
    result["output"] = f"Execution error: {str(ex)}"
finally:
    for p in [candidate_path, wrapper_path]:
        if os.path.exists(p):
            try:
                os.remove(p)
            except:
                pass

print("===TEST_JSON_START===")
print(json.dumps(result))
print("===TEST_JSON_END===")
PYEOF
`;

  try {
    const rawOut = await runAdaptiveSshCommand(server, testScript, ephemeralPassword, 15000);
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
 */
export async function saveNginxConfigFileSafe(
  server: RemoteServer,
  filePath: string,
  newContent: string,
  autoReload: boolean = true,
  ephemeralPassword?: string
): Promise<NginxEditorSaveResult> {
  const safePath = assertSafeNginxPath(filePath);
  const discovery = await discoverNginxInstallation(server, ephemeralPassword);
  const nginxBinary = discovery.binaryPath || '/usr/sbin/nginx';

  const base64Content = Buffer.from(newContent, 'utf-8').toString('base64');
  const timestamp = Date.now();

  const saveScript = `python3 - << 'PYEOF'
import os, sys, subprocess, base64, json, shutil, datetime

binary = "${nginxBinary}"
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

backup_dir = "/var/backups/nettopology_nginx"
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

    # 1. Create timestamped backup of current file
    if os.path.exists(target_path):
        shutil.copy2(target_path, backup_file)
        result["backupCreated"] = backup_file

    # 2. Write new content to target file
    with open(target_path, 'w', encoding='utf-8') as f:
        f.write(content)

    # 3. Test entire system with nginx -t
    test_proc = subprocess.run([binary, "-t"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=12)
    test_out = (test_proc.stdout or '') + "\\n" + (test_proc.stderr or '')
    result["syntaxOutput"] = test_out.strip()
    is_ok = (test_proc.returncode == 0) and ("syntax is ok" in test_out.lower())
    result["syntaxTestPassed"] = is_ok

    if not is_ok:
        # ATOMIC ROLLBACK! Restore original file
        if backup_file and os.path.exists(backup_file):
            shutil.copy2(backup_file, target_path)
        result["error"] = "Nginx syntax verification failed. Changes were automatically reverted to previous state."
    else:
        # Success!
        result["success"] = True

        # Reload service if requested
        if auto_reload:
            reload_cmd = ["systemctl", "reload", "nginx"]
            if not shutil.which("systemctl"):
                reload_cmd = [binary, "-s", "reload"]

            try:
                rel_proc = subprocess.run(reload_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
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
 * Lists all existing timestamped backups for a specific configuration file
 */
export async function listNginxFileBackups(
  server: RemoteServer,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; backups: NginxConfigFileBackup[]; error?: string }> {
  const safePath = assertSafeNginxPath(filePath);

  const script = `python3 - << 'PYEOF'
import os, sys, glob, json, datetime

target_path = """${safePath}"""
filename = os.path.basename(target_path)
backup_dir = "/var/backups/nettopology_nginx"

def format_size(bytes_val):
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.1f} KB"
    else:
        return f"{bytes_val / (1024 * 1024):.1f} MB"

found = []

# 1. Search in backup_dir
if os.path.isdir(backup_dir):
    pattern = os.path.join(backup_dir, f"{filename}.bak_*")
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

# 2. Search adjacent backups
parent_dir = os.path.dirname(target_path)
adj_pattern = os.path.join(parent_dir, f"{filename}.bak*")
for bp in glob.glob(adj_pattern):
    # Avoid duplicate if already added
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
export async function restoreNginxFileBackup(
  server: RemoteServer,
  filePath: string,
  backupPath: string,
  autoReload: boolean = true,
  ephemeralPassword?: string
): Promise<NginxEditorSaveResult> {
  const safePath = assertSafeNginxPath(filePath);
  const discovery = await discoverNginxInstallation(server, ephemeralPassword);
  const nginxBinary = discovery.binaryPath || '/usr/sbin/nginx';

  const script = `python3 - << 'PYEOF'
import os, sys, subprocess, shutil, json

binary = "${nginxBinary}"
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

temp_safety = target_path + ".safety_pre_restore"

try:
    # 1. Create temporary safety copy of target
    if os.path.exists(target_path):
        shutil.copy2(target_path, temp_safety)

    # 2. Copy backup into target
    shutil.copy2(backup_path, target_path)

    # 3. Test with nginx -t
    test_proc = subprocess.run([binary, "-t"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=12)
    test_out = (test_proc.stdout or '') + "\\n" + (test_proc.stderr or '')
    result["syntaxOutput"] = test_out.strip()
    is_ok = (test_proc.returncode == 0) and ("syntax is ok" in test_out.lower())
    result["syntaxTestPassed"] = is_ok

    if not is_ok:
        # Revert
        if os.path.exists(temp_safety):
            shutil.copy2(temp_safety, target_path)
        result["error"] = "Restored backup failed Nginx syntax test. Target restored to original state."
    else:
        result["success"] = True
        if os.path.exists(temp_safety):
            try:
                os.remove(temp_safety)
            except:
                pass

        if auto_reload:
            reload_cmd = ["systemctl", "reload", "nginx"]
            if not shutil.which("systemctl"):
                reload_cmd = [binary, "-s", "reload"]

            try:
                rel_proc = subprocess.run(reload_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
                rel_out = (rel_proc.stdout or '') + "\\n" + (rel_proc.stderr or '')
                result["serviceReloaded"] = (rel_proc.returncode == 0)
                result["reloadOutput"] = rel_out.strip()
            except Exception as e_rel:
                result["serviceReloaded"] = False
                result["reloadOutput"] = str(e_rel)

except Exception as ex:
    if os.path.exists(temp_safety):
        try:
            shutil.copy2(temp_safety, target_path)
        except:
            pass
    result["error"] = str(ex)

print("===RESTORE_JSON_START===")
print(json.dumps(result))
print("===RESTORE_JSON_END===")
PYEOF
`;

  try {
    const rawOut = await runAdaptiveSshCommand(server, script, ephemeralPassword, 20000);
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
    syntaxOutput: 'No restore output',
    serviceReloaded: false,
    error: 'Failed to restore backup',
  };
}
