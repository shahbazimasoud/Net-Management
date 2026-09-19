"""
ssh_compat.py - Bulletproof Adaptive Two-Tier SSH Negotiation Engine
Optimized for high-speed modern infrastructure and legacy enterprise hardware:
- Tier 1: Modern Fast Path (Zero latency penalty for modern Cisco IOS-XE, Nexus, MikroTik, Linux OpenSSH)
- Tier 2: Adaptive Legacy Fallback (Automatic negotiation for older Cisco Catalyst 2960/3560/3750, IOS 12/15)

Guarantees:
- Fully adaptive and automatic (zero manual configuration required)
- Tier 1 offers complete modern algorithms as top priority (Curve25519, ECDH, SHA-2 DH, CTR/GCM, Ed25519/RSA-SHA2)
- Tier 2 activates automatically ONLY when the remote device rejects modern algorithms during handshake
- NEVER raises "unknown cipher" (strictly inspects transport._cipher_info at runtime before assigning)
- Captures and logs exact negotiated algorithms (KEX, Cipher, Host Key, MAC)
- Shared universally across NetworkTerminal, SSHManager, HardwareDiscovery, BulkConfig, and Server Probe
"""

import socket
import time
import logging
from typing import Tuple, Optional, Any, List, Dict

logger = logging.getLogger("ssh_compat")

# ==============================================================================
# Tier 1: Modern Fast Path (Modern High-Security Algorithms)
# Default for all modern Cisco IOS-XE, Nexus, MikroTik RouterOS v7, Linux, etc.
# ==============================================================================
TIER1_MODERN_KEX = (
    'curve25519-sha256',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'diffie-hellman-group16-sha512',
    'diffie-hellman-group18-sha512',
    'diffie-hellman-group14-sha256',
)

TIER1_MODERN_KEYS = (
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256',
    'ssh-rsa',
)

TIER1_MODERN_CIPHERS = (
    'aes128-gcm@openssh.com',
    'aes256-gcm@openssh.com',
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
)

TIER1_MODERN_MACS = (
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1',
)

# ==============================================================================
# Tier 2: Adaptive Legacy Fallback (Cisco Catalyst 2960/3560/3750, IOS 12/15)
# Activated ONLY if the peer rejects modern algorithms or drops handshake
# ==============================================================================
TIER2_LEGACY_KEX = (
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group1-sha1',
    'diffie-hellman-group-exchange-sha1',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group16-sha512',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
)

TIER2_LEGACY_KEYS = (
    'ssh-rsa',
    'ssh-dss',
    'rsa-sha2-256',
    'rsa-sha2-512',
)

TIER2_LEGACY_CIPHERS = (
    'aes128-cbc',
    '3des-cbc',
    'aes256-cbc',
    'aes192-cbc',
    'aes128-ctr',
    'aes256-ctr',
)

TIER2_LEGACY_MACS = (
    'hmac-sha1',
    'hmac-sha1-96',
    'hmac-md5',
    'hmac-md5-96',
    'hmac-sha2-256',
)

_PATCHED = False


def ensure_paramiko_compatibility() -> bool:
    """
    Registers legacy KEX and host keys in Paramiko defaults and instruments
    _parse_kex_init to capture exact negotiated key exchange algorithm.
    CRITICAL: Does not touch _preferred_ciphers to prevent 'unknown cipher' errors.
    """
    global _PATCHED
    if _PATCHED:
        return True

    try:
        import paramiko
    except ImportError:
        return False

    try:
        # 1. Register legacy KEX if supported
        if hasattr(paramiko.Transport, '_preferred_kex'):
            existing_kex = list(paramiko.Transport._preferred_kex)
            for k in [
                'diffie-hellman-group14-sha1',
                'diffie-hellman-group-exchange-sha1',
                'diffie-hellman-group-exchange-sha256',
                'diffie-hellman-group1-sha1'
            ]:
                if k not in existing_kex:
                    existing_kex.append(k)
            paramiko.Transport._preferred_kex = tuple(existing_kex)

        # 2. Register legacy Host Keys (ssh-rsa, ssh-dss)
        if hasattr(paramiko.Transport, '_preferred_keys'):
            existing_keys = list(paramiko.Transport._preferred_keys)
            for k in ['ssh-rsa', 'ssh-dss', 'rsa-sha2-256', 'rsa-sha2-512']:
                if k not in existing_keys:
                    existing_keys.append(k)
            paramiko.Transport._preferred_keys = tuple(existing_keys)

        # 3. Instrument _parse_kex_init to record the exact negotiated KEX
        orig_parse_kex_init = paramiko.Transport._parse_kex_init
        if not getattr(paramiko.Transport, '_netmgmt_kex_instrumented', False):
            def instrumented_parse_kex_init(self, m):
                res = orig_parse_kex_init(self, m)
                try:
                    if hasattr(self, 'kex_engine') and self.kex_engine:
                        for name, cls in getattr(self, '_kex_info', {}).items():
                            if isinstance(self.kex_engine, cls):
                                self._agreed_kex = name
                                break
                except Exception:
                    pass
                return res
            paramiko.Transport._parse_kex_init = instrumented_parse_kex_init
            paramiko.Transport._netmgmt_kex_instrumented = True

        _PATCHED = True
        return True
    except Exception as e:
        logger.warning(f"Could not patch paramiko defaults: {e}")
        return False


# Automatically ensure compatibility on import
ensure_paramiko_compatibility()


def apply_security_options_safely(
    transport: Any,
    kex_candidates: Optional[Tuple[str, ...]] = None,
    key_candidates: Optional[Tuple[str, ...]] = None,
    cipher_candidates: Optional[Tuple[str, ...]] = None,
    mac_candidates: Optional[Tuple[str, ...]] = None
) -> None:
    """
    Safely applies security options to a live paramiko.Transport instance.
    Every candidate is strictly filtered against the transport's actual internal
    dictionaries (_cipher_info, _kex_info, _key_info, _mac_info).
    This completely eliminates 'unknown cipher' or 'unknown algorithm' ValueErrors.
    """
    try:
        sec = transport.get_security_options()
    except Exception:
        return

    # 1. Safely apply KEX
    if kex_candidates:
        valid_kex_dict = getattr(transport, '_kex_info', None)
        if valid_kex_dict and isinstance(valid_kex_dict, dict):
            filtered = tuple(k for k in kex_candidates if k in valid_kex_dict)
        else:
            filtered = tuple(k for k in kex_candidates if k in (sec.kex or ()))
        if filtered:
            try:
                sec.kex = filtered
            except Exception:
                pass

    # 2. Safely apply Host Keys
    if key_candidates:
        valid_key_dict = getattr(transport, '_key_info', None)
        if valid_key_dict and isinstance(valid_key_dict, dict):
            filtered = tuple(k for k in key_candidates if k in valid_key_dict)
        else:
            filtered = tuple(k for k in key_candidates if k in (sec.key_types or ()))
        if filtered:
            try:
                sec.key_types = filtered
            except Exception:
                pass

    # 3. Safely apply Ciphers (CRITICAL: only assign what strictly exists in transport._cipher_info)
    if cipher_candidates:
        valid_cipher_dict = getattr(transport, '_cipher_info', None)
        if valid_cipher_dict and isinstance(valid_cipher_dict, dict):
            filtered = tuple(c for c in cipher_candidates if c in valid_cipher_dict)
        else:
            filtered = tuple(c for c in cipher_candidates if c in (sec.ciphers or ()))
        if filtered:
            try:
                sec.ciphers = filtered
            except Exception:
                pass

    # 4. Safely apply MACs
    if mac_candidates:
        valid_mac_dict = getattr(transport, '_mac_info', None)
        if valid_mac_dict and isinstance(valid_mac_dict, dict):
            filtered = tuple(m for m in mac_candidates if m in valid_mac_dict)
        else:
            filtered = tuple(m for m in mac_candidates if m in (sec.digests or ()))
        if filtered:
            try:
                sec.digests = filtered
            except Exception:
                pass


def is_handshake_or_algo_mismatch(exc: Exception) -> bool:
    """
    Determines if an SSH connection failure was caused by algorithm incompatibility,
    KEX failure, or connection reset during key exchange (e.g. Cisco Catalyst 2960
    dropping packets when elliptic curve KEX is offered), rather than wrong password
    or network unreachability.
    """
    try:
        import paramiko
        if isinstance(exc, (paramiko.AuthenticationException, paramiko.BadAuthenticationType)):
            return False
    except ImportError:
        pass

    msg = str(exc).lower()

    # Definitive authentication rejections should NOT trigger legacy retry
    if any(auth_word in msg for auth_word in ["bad authentication", "denied", "userauth", "password refused"]):
        return False

    # Host unreachability or connection refused should NOT trigger legacy retry
    if any(net_word in msg for net_word in ["connection refused", "network is unreachable", "no route to host"]):
        return False

    # Indications of algorithm or handshake mismatch
    algo_indicators = [
        "kex",
        "incompatible",
        "no acceptable",
        "no matching",
        "cipher",
        "key exchange",
        "algorithm",
        "unknown cipher",
        "peer closed",
        "banner",
        "eof",
        "reset by peer",
        "closed by remote",
        "packet",
        "session closed",
    ]
    return any(ind in msg for ind in algo_indicators)


def authenticate_transport(transport: Any, username: str, password: str) -> Tuple[bool, Optional[str]]:
    """
    Authenticates an active transport using password authentication,
    falling back to keyboard-interactive (AAA / TACACS+ / RADIUS) if needed.
    """
    import paramiko
    auth_ok = False
    err_msg = None

    try:
        transport.auth_password(username=username, password=password)
        auth_ok = transport.is_authenticated()
    except (paramiko.BadAuthenticationType, paramiko.AuthenticationException) as e:
        err_msg = str(e)
        # Fallback to keyboard-interactive prompt
        def interactive_handler(title, instructions, prompt_list):
            return [password for _ in prompt_list]
        try:
            transport.auth_interactive(username=username, handler=interactive_handler)
            auth_ok = transport.is_authenticated()
            if auth_ok:
                err_msg = None
        except Exception as e_int:
            auth_ok = False
            err_msg = str(e_int)
    except Exception as e_other:
        auth_ok = False
        err_msg = str(e_other)

    return auth_ok, err_msg


def extract_negotiation_info(transport: Any, tier_name: str) -> Dict[str, Any]:
    """
    Inspects a connected transport and extracts the exact negotiated parameters.
    """
    kex_name = getattr(transport, '_agreed_kex', None)
    if not kex_name and hasattr(transport, 'kex_engine') and transport.kex_engine:
        kex_name = transport.kex_engine.__class__.__name__

    server_key_type = None
    try:
        remote_key = transport.get_remote_server_key()
        if remote_key:
            server_key_type = remote_key.get_name()
    except Exception:
        pass

    return {
        "tier": tier_name,
        "kex": kex_name or "negotiated",
        "cipher": getattr(transport, 'remote_cipher', None),
        "local_cipher": getattr(transport, 'local_cipher', None),
        "key_type": server_key_type,
        "mac": getattr(transport, 'remote_mac', None),
    }


# ==============================================================================
# MikroTik RouterOS Hardened Key & Cipher Suites
# RouterOS SSH (ROSSSH) in v6 & v7 has a known RFC 8332 bug where rsa-sha2-256
# and rsa-sha2-512 extensions cause immediate "Authentication failed."
# Restricting to standard ssh-rsa / ssh-ed25519 and disabling SHA2-RSA pubkeys
# allows RouterOS to authenticate cleanly via password or auth_none.
# ==============================================================================
MIKROTIK_KEX = (
    'curve25519-sha256',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group-exchange-sha1',
    'diffie-hellman-group1-sha1',
)

MIKROTIK_KEYS = (
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'ssh-rsa',
    'ssh-dss',
)

MIKROTIK_CIPHERS = (
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-gcm@openssh.com',
    'aes256-gcm@openssh.com',
    'chacha20-poly1305@openssh.com',
    'aes128-cbc',
    'aes192-cbc',
    'aes256-cbc',
    '3des-cbc',
)

MIKROTIK_MACS = (
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1',
    'hmac-sha1-96',
    'hmac-md5',
)


def connect_mikrotik_ssh(
    client: Any,
    hostname: str,
    port: int = 22,
    username: str = "admin",
    password: str = "",
    timeout: float = 6.0,
    banner_timeout: float = 6.0,
    auth_timeout: float = 6.0
) -> Tuple[bool, Optional[str]]:
    """
    Dedicated, hardened SSH connection engine for MikroTik RouterOS.
    Bypasses known ROSSSH bugs:
    1. RFC 8332 rsa-sha2-256 / rsa-sha2-512 incompatibilities in ROSSSH (disables SHA2-RSA pubkeys)
    2. Suppresses look_for_keys and allow_agent to prevent premature auth failures
    3. Handles empty/default admin passwords via auth_none fallback
    4. Supports RouterOS v6 and v7 across all modern and legacy ciphers
    """
    ensure_paramiko_compatibility()
    import paramiko
    import inspect

    last_error = None
    user_to_try = username or "admin"

    # --------------------------------------------------------------------------
    # Step 1: Standard client.connect with look_for_keys=False and disabled_algorithms
    # --------------------------------------------------------------------------
    try:
        connect_kwargs: Dict[str, Any] = {
            "hostname": hostname,
            "port": port,
            "username": user_to_try,
            "password": password if password else None,
            "timeout": timeout,
            "banner_timeout": banner_timeout,
            "auth_timeout": auth_timeout,
            "look_for_keys": False,
            "allow_agent": False,
        }
        # Disable rsa-sha2-256 / rsa-sha2-512 if paramiko supports disabled_algorithms
        try:
            sig = inspect.signature(client.connect)
            if "disabled_algorithms" in sig.parameters:
                connect_kwargs["disabled_algorithms"] = {
                    "pubkeys": ["rsa-sha2-256", "rsa-sha2-512"]
                }
        except Exception:
            pass

        client.connect(**connect_kwargs)
        trans = client.get_transport()
        if trans and trans.is_authenticated():
            client._transport = trans
            client._negotiation_info = extract_negotiation_info(trans, "mikrotik_ros_fast")
            logger.info(f"[MikroTik SSH] Connected successfully to {hostname}:{port} via standard fast path.")
            return True, None
    except Exception as e_fast:
        last_error = str(e_fast).strip()
        logger.debug(f"[MikroTik SSH Fast Path] Connect attempt failed: {e_fast}. Proceeding to transport-level negotiation...")

    # --------------------------------------------------------------------------
    # Step 2: Low-level Transport with MIKROTIK_KEYS (excluding rsa-sha2-256/512)
    # and multi-stage authentication (auth_none, auth_password, keyboard-interactive)
    # --------------------------------------------------------------------------
    sock = None
    transport = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((hostname, port))

        transport = paramiko.Transport(sock)
        apply_security_options_safely(
            transport,
            kex_candidates=MIKROTIK_KEX,
            key_candidates=MIKROTIK_KEYS,
            cipher_candidates=MIKROTIK_CIPHERS,
            mac_candidates=MIKROTIK_MACS
        )

        transport.start_client(timeout=banner_timeout)

        auth_ok = False
        auth_err = None

        # A: If password is empty or None, try auth_none first
        if not password:
            try:
                transport.auth_none(user_to_try)
                auth_ok = transport.is_authenticated()
            except Exception as e_none:
                auth_err = str(e_none)

        # B: Try standard password authentication
        if not auth_ok and password is not None:
            try:
                transport.auth_password(username=user_to_try, password=password)
                auth_ok = transport.is_authenticated()
            except Exception as e_pwd:
                auth_err = str(e_pwd)

        # C: Try trimmed password if there were leading/trailing spaces
        if not auth_ok and password and password.strip() != password:
            try:
                transport.auth_password(username=user_to_try, password=password.strip())
                auth_ok = transport.is_authenticated()
            except Exception as e_trim:
                auth_err = str(e_trim)

        # D: If still not authenticated and password was rejected, try auth_none
        # (RouterOS default admin has no password, but clients sending password string may be rejected)
        if not auth_ok:
            try:
                transport.auth_none(user_to_try)
                auth_ok = transport.is_authenticated()
            except Exception:
                pass

        # E: Fallback to keyboard-interactive prompt
        if not auth_ok:
            def interactive_handler(title, instructions, prompt_list):
                return [password or "" for _ in prompt_list]
            try:
                transport.auth_interactive(username=user_to_try, handler=interactive_handler)
                auth_ok = transport.is_authenticated()
            except Exception as e_int:
                auth_err = auth_err or str(e_int)

        if auth_ok:
            client._transport = transport
            client._negotiation_info = extract_negotiation_info(transport, "mikrotik_ros_transport")
            logger.info(f"[MikroTik SSH] Connected successfully to {hostname}:{port} via transport negotiation.")
            return True, None
        else:
            last_error = auth_err or f"Authentication failed for user '{user_to_try}'"
    except Exception as e_trans:
        last_error = str(e_trans).strip() or "MikroTik SSH handshake error"
    finally:
        if not getattr(client, '_transport', None) or client._transport is not transport:
            if transport:
                try:
                    transport.close()
                except Exception:
                    pass
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass

    return False, last_error or f"Authentication failed for user '{username or 'admin'}' on {hostname}:{port}"


def connect_ssh_device(
    client: Any,
    hostname: str,
    port: int = 22,
    username: str = "",
    password: str = "",
    timeout: float = 6.0,
    banner_timeout: float = 6.0,
    auth_timeout: float = 6.0,
    on_fallback_log: Optional[Any] = None,
    platform: str = ""
) -> Tuple[bool, Optional[str]]:
    """
    Connects to a network device using the Two-Tier Adaptive Negotiation Engine:
    - Tier 1 (Modern Fast Path): Connects using modern algorithms (Curve25519, ECDH, CTR/GCM, Ed25519/RSA-SHA2).
      Fast path for 100% of modern infrastructure with zero latency penalty or legacy overhead.
    - Tier 2 (Adaptive Legacy Fallback): If (and only if) Tier 1 fails on algorithm/KEX mismatch,
      automatically retries with legacy Cisco algorithms (DH Group 14/1, ssh-rsa, AES-CBC, 3DES).
    - MikroTik RouterOS Engine: When target platform is MikroTik (or ROSSSH is identified), executes
      hardened MikroTik SSH negotiation bypassing RFC 8332 bug and auth_none/password quirks.
    
    Guaranteed zero 'unknown cipher' errors via safe dictionary reflection.
    Returns (True, None) on success, or (False, error_message) on failure.
    Attaches `client._negotiation_info` with the negotiated parameters.
    """
    ensure_paramiko_compatibility()
    import paramiko

    # Check if target platform is explicitly MikroTik
    if "mikrotik" in str(platform or "").lower():
        return connect_mikrotik_ssh(
            client,
            hostname=hostname,
            port=port,
            username=username,
            password=password,
            timeout=timeout,
            banner_timeout=banner_timeout,
            auth_timeout=auth_timeout
        )

    # --------------------------------------------------------------------------
    # Attempt 1: Tier 1 - Modern Fast Path
    # --------------------------------------------------------------------------
    sock1 = None
    transport1 = None
    tier1_error = None
    tier1_auth_failed = False

    try:
        sock1 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock1.settimeout(timeout)
        sock1.connect((hostname, port))

        transport1 = paramiko.Transport(sock1)
        apply_security_options_safely(
            transport1,
            kex_candidates=TIER1_MODERN_KEX,
            key_candidates=TIER1_MODERN_KEYS,
            cipher_candidates=TIER1_MODERN_CIPHERS,
            mac_candidates=TIER1_MODERN_MACS
        )

        transport1.start_client(timeout=banner_timeout)

        # Dynamic MikroTik Detection via SSH banner:
        remote_ident = str(getattr(transport1, "remote_version", "") or "").lower()
        if "rosssh" in remote_ident or "mikrotik" in remote_ident:
            logger.info(f"[SSH Auto-Discovery] Detected MikroTik RouterOS banner ({remote_ident}) on {hostname}:{port}. Routing to MikroTik SSH Engine.")
            try:
                transport1.close()
            except Exception:
                pass
            if sock1:
                try:
                    sock1.close()
                except Exception:
                    pass
            return connect_mikrotik_ssh(
                client,
                hostname=hostname,
                port=port,
                username=username,
                password=password,
                timeout=timeout,
                banner_timeout=banner_timeout,
                auth_timeout=auth_timeout
            )

        auth_ok, auth_err = authenticate_transport(transport1, username=username, password=password)

        if auth_ok:
            # Succeeded on Tier 1 (Modern Fast Path)!
            client._transport = transport1
            client._negotiation_info = extract_negotiation_info(transport1, "tier1_modern")
            logger.info(
                f"[SSH Tier 1 Fast Path] Connected to {hostname}:{port} | "
                f"KEX: {client._negotiation_info['kex']} | "
                f"Cipher: {client._negotiation_info['cipher']} | "
                f"Key: {client._negotiation_info['key_type']}"
            )
            return True, None
        else:
            tier1_auth_failed = True
            tier1_error = auth_err or f"Authentication rejected for user '{username}'"
    except Exception as e:
        tier1_error = str(e).strip() or "Handshake error"
    finally:
        if not getattr(client, '_transport', None) or client._transport is not transport1:
            if transport1:
                try:
                    transport1.close()
                except Exception:
                    pass
            if sock1:
                try:
                    sock1.close()
                except Exception:
                    pass

    # If the modern attempt failed strictly due to invalid credentials, do not retry
    if tier1_auth_failed:
        return False, f"Invalid username or password for user '{username}' on {hostname}:{port}"

    # If the error is NOT an algorithm/handshake mismatch (e.g. host unreachable, connection refused), do not retry
    if not is_handshake_or_algo_mismatch(Exception(tier1_error)):
        return False, tier1_error

    # --------------------------------------------------------------------------
    # Attempt 2: Tier 2 - Adaptive Legacy Fallback (Cisco 2960 / Catalyst IOS)
    # --------------------------------------------------------------------------
    logger.warning(
        f"[SSH Tier 2 Fallback] Peer {hostname}:{port} rejected modern algorithms ({tier1_error}). "
        f"Falling back to legacy Cisco algorithms (DH Group 14/1, CBC)..."
    )
    if on_fallback_log and callable(on_fallback_log):
        try:
            on_fallback_log(f"Negotiating legacy Cisco algorithms with {hostname}:{port}...")
        except Exception:
            pass

    sock2 = None
    transport2 = None
    tier2_error = None

    try:
        sock2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock2.settimeout(timeout + 2.0)
        sock2.connect((hostname, port))

        transport2 = paramiko.Transport(sock2)
        apply_security_options_safely(
            transport2,
            kex_candidates=TIER2_LEGACY_KEX,
            key_candidates=TIER2_LEGACY_KEYS,
            cipher_candidates=TIER2_LEGACY_CIPHERS,
            mac_candidates=TIER2_LEGACY_MACS
        )

        transport2.start_client(timeout=banner_timeout + 2.0)
        auth_ok2, auth_err2 = authenticate_transport(transport2, username=username, password=password)

        if auth_ok2:
            # Succeeded on Tier 2 (Legacy Fallback)!
            client._transport = transport2
            client._negotiation_info = extract_negotiation_info(transport2, "tier2_legacy_fallback")
            logger.info(
                f"[SSH Tier 2 Fallback SUCCESS] Connected to {hostname}:{port} | "
                f"KEX: {client._negotiation_info['kex']} | "
                f"Cipher: {client._negotiation_info['cipher']} | "
                f"Key: {client._negotiation_info['key_type']}"
            )
            return True, None
        else:
            tier2_error = auth_err2 or f"Invalid username or password for user '{username}'"
    except Exception as e2:
        tier2_error = str(e2).strip() or "Legacy handshake failed"
    finally:
        if not getattr(client, '_transport', None) or client._transport is not transport2:
            if transport2:
                try:
                    transport2.close()
                except Exception:
                    pass
            if sock2:
                try:
                    sock2.close()
                except Exception:
                    pass

    return False, tier2_error or tier1_error


def open_adaptive_shell_channel(
    hostname: str,
    port: int = 22,
    username: str = "",
    password: str = "",
    cols: int = 80,
    rows: int = 24,
    term_name: str = "xterm-256color",
    timeout: float = 6.0,
    on_status_msg: Optional[Any] = None,
    platform: str = ""
) -> Tuple[Optional[Any], Optional[Any], Optional[Any], Dict[str, Any], Optional[str]]:
    """
    Opens an interactive shell channel using the unified Two-Tier Adaptive SSH Engine:
    Tier 1: Modern Fast Path (no legacy overhead)
    Tier 2: Targeted Legacy Fallback (activated if Tier 1 rejects modern KEX/ciphers)
    MikroTik: Dedicated ROSSSH compatibility engine (RFC 8332 workaround)
    
    Returns:
    (channel, transport, client, negotiation_info, error_message)
    """
    ensure_paramiko_compatibility()
    import paramiko

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    def fallback_cb(msg: str):
        if on_status_msg and callable(on_status_msg):
            on_status_msg(
                f"\r\n\x1b[33m[SSH Fallback]\x1b[0m {msg}\r\n"
            )

    connected, err = connect_ssh_device(
        client,
        hostname=hostname,
        port=port,
        username=username,
        password=password,
        timeout=timeout,
        banner_timeout=timeout,
        auth_timeout=timeout,
        on_fallback_log=fallback_cb,
        platform=platform
    )

    if not connected or not getattr(client, '_transport', None):
        return None, None, None, {}, err or "Connection failed"

    transport = client._transport
    info = getattr(client, '_negotiation_info', {})

    try:
        channel = transport.open_session(timeout=timeout)
        channel.get_pty(term=term_name, width=cols, height=rows)
        channel.invoke_shell()
        channel.settimeout(0.0)  # Non-blocking for event loops
        return channel, transport, client, info, None
    except Exception as e:
        try:
            transport.close()
        except Exception:
            pass
        return None, None, None, info, f"Failed to open interactive shell channel: {e}"
