import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverNginxConfigTopology } from './nginxConfigParser';

export interface NginxCertificateAssociatedSite {
  siteId: string;
  serverName: string;
  definedInFile: string;
  ports: number[];
}

export interface NginxCertificateDetails {
  id: string;
  primaryDomain: string;
  allDomains: string[];
  certPath: string;
  keyPath?: string;
  keyExists: boolean;
  certExists: boolean;
  certReadable: boolean;
  keyReadable: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  status: 'valid' | 'expiring_soon' | 'expired' | 'unreadable' | 'missing';
  isSelfSigned: boolean;
  isWildcard: boolean;
  signatureAlgorithm?: string;
  serialNumber?: string;
  fingerprintSha256?: string;
  associatedSites: NginxCertificateAssociatedSite[];
}

export interface NginxSslSummary {
  totalCertificates: number;
  validCertificates: number;
  expiringSoonCertificates: number;
  expiredCertificates: number;
  selfSignedCertificates: number;
  missingOrUnreadableCertificates: number;
  certificates: NginxCertificateDetails[];
  warnings: string[];
}

/**
 * Robust Python-based extractor that scans Nginx configurations, discovers
 * all SSL/TLS certificate directives, and inspects real X.509 metadata via OpenSSL.
 * Strictly guarantees that private key contents are NEVER read or leaked.
 */
const PYTHON_CERT_INSPECTOR = (fileListJson: string) => `python3 - << 'PYEOF'
import sys, os, re, json, subprocess, datetime

try:
    files_to_scan = json.loads('''${fileListJson}''')
except Exception as e:
    files_to_scan = []

warnings = []
cert_map = {} # cert_path -> dict
global_cert = None
global_key = None

def strip_quotes(s):
    if not s:
        return ""
    return s.strip().strip("'\\"").strip()

def scan_file_for_ssl(filepath):
    global global_cert, global_key
    if not os.path.exists(filepath):
        return
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        warnings.append(f"Failed to read file {filepath}: {str(e)}")
        return

    # Check for global ssl_certificate in http block
    # Remove comments
    clean_lines = []
    for line in content.splitlines():
        line_no_comment = re.sub(r'#.*$', '', line)
        clean_lines.append(line_no_comment)
    clean_content = "\\n".join(clean_lines)

    # 1. Scan server blocks
    # Match server { ... } blocks
    start_pos = 0
    server_idx = 0
    while True:
        match = re.search(r'(?:^|\\s)server\\s*\\{', clean_content[start_pos:])
        if not match:
            break
        
        block_start = start_pos + match.end() - 1
        brace_depth = 1
        i = block_start + 1
        n = len(clean_content)
        while i < n and brace_depth > 0:
            char = clean_content[i]
            if char == '{':
                brace_depth += 1
            elif char == '}':
                brace_depth -= 1
            i += 1
            
        block_body = clean_content[block_start + 1 : i - 1]
        start_pos = i
        server_idx += 1

        # Extract server_name
        server_names = []
        sn_matches = re.finditer(r'(?:^|\\s)server_name\\s+([^;]+);', block_body)
        for snm in sn_matches:
            names = snm.group(1).strip().split()
            for n_item in names:
                clean_n = strip_quotes(n_item)
                if clean_n and clean_n not in server_names:
                    server_names.append(clean_n)
        primary_name = server_names[0] if server_names else "_ (catch-all)"

        # Extract listen ports
        ports = []
        l_matches = re.finditer(r'(?:^|\\s)listen\\s+([^;]+);', block_body)
        for lm in l_matches:
            l_parts = lm.group(1).strip().split()
            first = l_parts[0]
            if '[' in first:
                p_m = re.search(r'\\]:(\\d+)', first)
                if p_m:
                    ports.append(int(p_m.group(1)))
                else:
                    ports.append(80)
            elif ':' in first:
                p_str = first.split(':', 1)[1]
                if p_str.isdigit():
                    ports.append(int(p_str))
            elif first.isdigit():
                ports.append(int(first))
            else:
                ports.append(80)
        if not ports:
            ports = [80]

        # Extract ssl_certificate and ssl_certificate_key
        cert_m = re.search(r'(?:^|\\s)ssl_certificate\\s+([^;]+);', block_body)
        key_m = re.search(r'(?:^|\\s)ssl_certificate_key\\s+([^;]+);', block_body)

        cert_p = strip_quotes(cert_m.group(1)) if cert_m else None
        key_p = strip_quotes(key_m.group(1)) if key_m else None

        if cert_p:
            if cert_p not in cert_map:
                cert_map[cert_p] = {
                    "certPath": cert_p,
                    "keyPath": key_p,
                    "associatedSites": []
                }
            elif key_p and not cert_map[cert_p].get("keyPath"):
                cert_map[cert_p]["keyPath"] = key_p

            site_id = f"{os.path.basename(filepath)}-srv-{server_idx}"
            cert_map[cert_p]["associatedSites"].append({
                "siteId": site_id,
                "serverName": primary_name,
                "definedInFile": filepath,
                "ports": list(set(ports))
            })

    # Also detect top-level ssl_certificate in http block
    top_cert_m = re.search(r'(?:^|\\s)ssl_certificate\\s+([^;]+);', clean_content)
    top_key_m = re.search(r'(?:^|\\s)ssl_certificate_key\\s+([^;]+);', clean_content)
    if top_cert_m:
        top_c = strip_quotes(top_cert_m.group(1))
        top_k = strip_quotes(top_key_m.group(1)) if top_key_m else None
        if top_c not in cert_map:
            cert_map[top_c] = {
                "certPath": top_c,
                "keyPath": top_k,
                "associatedSites": [{
                    "siteId": "http-global",
                    "serverName": "Global (http context)",
                    "definedInFile": filepath,
                    "ports": [443]
                }]
            }

for fpath in files_to_scan:
    scan_file_for_ssl(fpath)

# Inspect each certificate with OpenSSL
certificates = []

now_utc = datetime.datetime.utcnow()

for cert_path, data in cert_map.items():
    key_path = data.get("keyPath")
    associated_sites = data.get("associatedSites", [])
    
    cert_exists = os.path.exists(cert_path)
    cert_readable = os.access(cert_path, os.R_OK) if cert_exists else False
    
    key_exists = os.path.exists(key_path) if key_path else False
    # CRITICAL: We only test readability flag; WE NEVER READ OR RETURN KEY CONTENTS
    key_readable = os.access(key_path, os.R_OK) if key_exists else False

    primary_domain = os.path.basename(cert_path)
    all_domains = []
    issuer = "Unknown"
    subject = "Unknown"
    valid_from = ""
    valid_to = ""
    days_remaining = 0
    status = "missing"
    is_self_signed = False
    is_wildcard = False
    sig_algo = ""
    serial = ""
    fingerprint = ""

    if not cert_exists:
        status = "missing"
        warnings.append(f"Certificate file not found: {cert_path}")
    elif not cert_readable:
        status = "unreadable"
        warnings.append(f"Permission denied reading certificate: {cert_path}")
    else:
        # Run openssl command
        try:
            cmd = [
                "openssl", "x509", "-in", cert_path, "-noout",
                "-subject", "-issuer", "-dates", "-ext", "subjectAltName",
                "-serial", "-fingerprint", "-sha256"
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=8)
            openssl_out = res.stdout
            
            if res.returncode != 0:
                # Malformed certificate or non-x509 file
                status = "unreadable"
                warnings.append(f"OpenSSL failed to parse {cert_path}: {res.stderr.strip()[:100]}")
            else:
                # Parse lines
                for line in openssl_out.splitlines():
                    line = line.strip()
                    if line.startswith("subject="):
                        subject = line[len("subject="):].strip()
                    elif line.startswith("issuer="):
                        issuer = line[len("issuer="):].strip()
                    elif line.startswith("notBefore="):
                        raw_nb = line[len("notBefore="):].strip()
                        raw_nb_clean = re.sub(r'\\s+', ' ', raw_nb)
                        valid_from = raw_nb_clean
                    elif line.startswith("notAfter="):
                        raw_na = line[len("notAfter="):].strip()
                        raw_na_clean = re.sub(r'\\s+', ' ', raw_na)
                        valid_to = raw_na_clean
                        try:
                            # Usually "%b %d %H:%M:%S %Y GMT"
                            dt = datetime.datetime.strptime(raw_na_clean, "%b %d %H:%M:%S %Y GMT")
                            days_remaining = int((dt - now_utc).total_seconds() / 86400)
                        except Exception:
                            days_remaining = 0
                    elif line.startswith("serial="):
                        serial = line[len("serial="):].strip()
                    elif "Fingerprint=" in line:
                        fingerprint = line.split("Fingerprint=", 1)[1].strip()

                # Extract Subject Alternative Names (SANs)
                sans = re.findall(r'DNS:([^\\s,;]+)', openssl_out)
                ips = re.findall(r'IP Address:([^\\s,;]+)', openssl_out)
                all_domains = sans + ips

                # Subject CN extraction
                cn_match = re.search(r'CN\\s*=\\s*([^,/]+)', subject)
                if cn_match:
                    cn_val = cn_match.group(1).strip()
                    if cn_val not in all_domains:
                        all_domains.insert(0, cn_val)

                if all_domains:
                    primary_domain = all_domains[0]
                elif cn_match:
                    primary_domain = cn_match.group(1).strip()

                # Wildcard check
                is_wildcard = any(d.startswith("*.") for d in all_domains)

                # Self-Signed check
                # If subject == issuer or issuer has same CN/O
                if subject == issuer:
                    is_self_signed = True
                else:
                    sub_cn = cn_match.group(1).strip() if cn_match else ""
                    iss_cn_match = re.search(r'CN\\s*=\\s*([^,/]+)', issuer)
                    iss_cn = iss_cn_match.group(1).strip() if iss_cn_match else ""
                    if sub_cn and iss_cn and sub_cn == iss_cn:
                        is_self_signed = True

                # Determine status
                if days_remaining < 0:
                    status = "expired"
                elif days_remaining <= 30:
                    status = "expiring_soon"
                else:
                    status = "valid"

        except Exception as e:
            status = "unreadable"
            warnings.append(f"Inspection error on {cert_path}: {str(e)}")

    cert_id = f"cert-{abs(hash(cert_path)) % 1000000}"
    certificates.append({
        "id": cert_id,
        "primaryDomain": primary_domain,
        "allDomains": all_domains,
        "certPath": cert_path,
        "keyPath": key_path,
        "keyExists": key_exists,
        "certExists": cert_exists,
        "certReadable": cert_readable,
        "keyReadable": key_readable,
        "issuer": issuer,
        "subject": subject,
        "validFrom": valid_from,
        "validTo": valid_to,
        "daysRemaining": days_remaining,
        "status": status,
        "isSelfSigned": is_self_signed,
        "isWildcard": is_wildcard,
        "signatureAlgorithm": sig_algo,
        "serialNumber": serial,
        "fingerprintSha256": fingerprint,
        "associatedSites": associated_sites
    })

# Compute summary stats
total_certs = len(certificates)
valid_certs = sum(1 for c in certificates if c["status"] == "valid")
expiring_soon = sum(1 for c in certificates if c["status"] == "expiring_soon")
expired_certs = sum(1 for c in certificates if c["status"] == "expired")
self_signed = sum(1 for c in certificates if c["isSelfSigned"])
missing_or_bad = sum(1 for c in certificates if c["status"] in ("missing", "unreadable"))

output = {
    "totalCertificates": total_certs,
    "validCertificates": valid_certs,
    "expiringSoonCertificates": expiring_soon,
    "expiredCertificates": expired_certs,
    "selfSignedCertificates": self_signed,
    "missingOrUnreadableCertificates": missing_or_bad,
    "certificates": certificates,
    "warnings": warnings
}

print("===JSON_START===")
print(json.dumps(output))
print("===JSON_END===")
PYEOF
`;

/**
 * Discovers and inspects all SSL/TLS certificates configured in Nginx on the target Linux server.
 */
export async function discoverNginxCertificates(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<NginxSslSummary> {
  const configTree = await discoverNginxConfigTopology(server, ephemeralPassword);
  const filePaths = configTree.files.map((f) => f.filePath);

  if (filePaths.length === 0) {
    return {
      totalCertificates: 0,
      validCertificates: 0,
      expiringSoonCertificates: 0,
      expiredCertificates: 0,
      selfSignedCertificates: 0,
      missingOrUnreadableCertificates: 0,
      certificates: [],
      warnings: ['No Nginx configuration files found to inspect SSL certificates.'],
    };
  }

  const jsonFileList = JSON.stringify(filePaths).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const pythonCmd = PYTHON_CERT_INSPECTOR(jsonFileList);

  try {
    const rawOut = await runAdaptiveSshCommand(server, pythonCmd, ephemeralPassword, 15000);
    if (rawOut.includes('===JSON_START===') && rawOut.includes('===JSON_END===')) {
      const jsonStr = rawOut.split('===JSON_START===')[1].split('===JSON_END===')[0].trim();
      const parsed: NginxSslSummary = JSON.parse(jsonStr);
      return parsed;
    }
  } catch (err: any) {
    console.warn(`[NginxCertDiscovery] SSH OpenSSL execution failed on server ${server.id}:`, err?.message || err);
  }

  return {
    totalCertificates: 0,
    validCertificates: 0,
    expiringSoonCertificates: 0,
    expiredCertificates: 0,
    selfSignedCertificates: 0,
    missingOrUnreadableCertificates: 0,
    certificates: [],
    warnings: ['Unable to inspect SSL certificates via SSH OpenSSL command.'],
  };
}
