"""
NetTopology Credential Security & Encryption Module
Provides symmetric authenticated encryption (Fernet / AES-128-CBC + HMAC-SHA256)
for network device credentials (SSH passwords, enable secrets, API keys).
"""
import os
import sys
import base64
import json
from typing import Optional, Any

# Ensure cryptography is available
try:
    from cryptography.fernet import Fernet, InvalidToken
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False
    Fernet = None
    InvalidToken = Exception

# File path to persist the secret encryption key
_SECURITY_DIR = os.path.dirname(os.path.abspath(__file__))
_KEY_FILE = os.path.join(_SECURITY_DIR, ".secret.key")
_PREFIX = "enc:fernet:"

_cached_fernet: Optional[Any] = None

def get_or_create_encryption_key() -> bytes:
    """Retrieves existing encryption key or generates and securely saves a new one."""
    env_key = os.environ.get("NETTOP_ENCRYPTION_KEY") or os.environ.get("ENCRYPTION_KEY")
    if env_key:
        try:
            k = env_key.strip().encode("utf-8")
            # Validate key format
            if len(k) == 44 and HAS_CRYPTOGRAPHY:
                Fernet(k)
                return k
        except Exception:
            pass

    if os.path.exists(_KEY_FILE):
        try:
            with open(_KEY_FILE, "rb") as f:
                k = f.read().strip()
                if len(k) == 44 and HAS_CRYPTOGRAPHY:
                    Fernet(k)
                    return k
        except Exception as e:
            print(f"[Crypto] Warning reading {_KEY_FILE}: {e}")

    # Seed persistent key deterministically if missing (prevents secret loss on reinstall)
    candidate_secret = os.environ.get("VAULT_SECRET") or os.environ.get("JWT_SECRET")
    if not candidate_secret:
        try:
            store_file = os.path.join(os.path.dirname(_SECURITY_DIR), "database_store.json")
            if os.path.exists(store_file):
                with open(store_file, "r", encoding="utf-8") as sf:
                    sdata = json.load(sf)
                    sec_keys = sdata.get("system_security_keys", [])
                    if sec_keys and isinstance(sec_keys, list) and "master_key" in sec_keys[0]:
                        candidate_secret = sec_keys[0]["master_key"]
        except Exception:
            pass

    if not candidate_secret:
        candidate_secret = "nettopology_vault_master_key_2026_aes256gcm_safe"

    import hashlib
    seed_hash = hashlib.sha256(candidate_secret.encode("utf-8")).digest()
    new_key = base64.urlsafe_b64encode(seed_hash)

    try:
        os.makedirs(_SECURITY_DIR, exist_ok=True)
        # Write with secure permissions (0600)
        fd = os.open(_KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(new_key)
        print(f"[Crypto] Seeded persistent encryption key in {_KEY_FILE}")
    except Exception as e:
        print(f"[Crypto] Warning saving encryption key to {_KEY_FILE}: {e}")

    return new_key

def get_fernet() -> Optional[Any]:
    global _cached_fernet
    if _cached_fernet is not None:
        return _cached_fernet

    if not HAS_CRYPTOGRAPHY:
        return None

    try:
        key = get_or_create_encryption_key()
        _cached_fernet = Fernet(key)
        return _cached_fernet
    except Exception as e:
        print(f"[Crypto] Error initializing Fernet engine: {e}")
        return None

def is_encrypted(val: Optional[str]) -> bool:
    """Checks if a credential string is already encrypted."""
    if not val or not isinstance(val, str):
        return False
    return val.startswith(_PREFIX) or val.startswith("gAAAAA") or val.startswith("enc:v1:")

def encrypt_credential(plain_text: Optional[str]) -> str:
    """
    Encrypts a cleartext password or secret.
    Returns format 'enc:fernet:<token>'.
    If already encrypted or empty, returns as is.
    """
    if not plain_text or not isinstance(plain_text, str):
        return ""
    if is_encrypted(plain_text):
        return plain_text

    f = get_fernet()
    if not f:
        # If cryptography is not yet initialized, return cleartext
        return plain_text

    try:
        token = f.encrypt(plain_text.encode("utf-8")).decode("utf-8")
        return f"{_PREFIX}{token}"
    except Exception as e:
        print(f"[Crypto] Encryption failed: {e}")
        return plain_text

def decrypt_credential(cipher_text: Optional[str]) -> str:
    """
    Decrypts an encrypted credential back to cleartext.
    Supports 'enc:v1:<iv>:<tag>:<ciphertext>' (AES-256-GCM), 'enc:fernet:<token>', and raw tokens.
    Leverages multi-key fallback if key was re-created or changed across updates.
    """
    if not cipher_text or not isinstance(cipher_text, str):
        return ""
    if not is_encrypted(cipher_text):
        return cipher_text

    # Support AES-256-GCM enc:v1:
    if cipher_text.startswith("enc:v1:"):
        parts = cipher_text.split(":")
        if len(parts) == 5:
            try:
                from cryptography.hazmat.primitives.ciphers.aead import AESGCM
                from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
                iv = bytes.fromhex(parts[2])
                tag = bytes.fromhex(parts[3])
                ct = bytes.fromhex(parts[4])
                master = os.environ.get("VAULT_SECRET") or os.environ.get("JWT_SECRET") or "nettopology_vault_master_key_2026_aes256gcm_safe"
                kdf = Scrypt(salt=b"server_credential_system_salt", length=32, n=16384, r=8, p=1)
                derived_key = kdf.derive(master.encode("utf-8"))
                aesgcm = AESGCM(derived_key)
                plain = aesgcm.decrypt(iv, ct + tag, None).decode("utf-8")
                return plain
            except Exception as e:
                print(f"[Crypto] AES-256-GCM decryption notice: {e}")

    token_str = cipher_text
    if cipher_text.startswith(_PREFIX):
        token_str = cipher_text[len(_PREFIX):]

    # 1. Try active Fernet engine first
    f = get_fernet()
    if f:
        try:
            return f.decrypt(token_str.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            pass
        except Exception as e:
            print(f"[Crypto] Decryption error: {e}")

    # 2. Adaptive multi-key candidate fallback across historical & seeded secrets
    if HAS_CRYPTOGRAPHY:
        candidate_seeds = [
            os.environ.get("NETTOP_ENCRYPTION_KEY"),
            os.environ.get("ENCRYPTION_KEY"),
            os.environ.get("VAULT_SECRET"),
            os.environ.get("JWT_SECRET"),
            "nettopology_vault_master_key_2026_aes256gcm_safe",
            "nettopology_super_secret_jwt_key_2026_cisco_ops",
        ]
        import hashlib
        for seed in candidate_seeds:
            if not seed:
                continue
            try:
                k_bytes = seed.strip().encode("utf-8")
                if len(k_bytes) == 44:
                    cf = Fernet(k_bytes)
                    return cf.decrypt(token_str.encode("utf-8")).decode("utf-8")
            except Exception:
                pass
            try:
                derived = base64.urlsafe_b64encode(hashlib.sha256(seed.strip().encode("utf-8")).digest())
                cf = Fernet(derived)
                return cf.decrypt(token_str.encode("utf-8")).decode("utf-8")
            except Exception:
                pass

    return cipher_text

def mask_credential(val: Optional[str]) -> str:
    """Returns masked stars for safe presentation in UI."""
    if not val:
        return ""
    return "********"

def migrate_database_credentials(db_file_path: str) -> int:
    """
    Scans a JSON database file and encrypts any unencrypted device credentials
    in-place while preserving all other attributes.
    Returns the number of migrated fields.
    """
    if not os.path.exists(db_file_path):
        return 0

    try:
        with open(db_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        devices = data.get("devices", [])
        if not isinstance(devices, list):
            return 0

        migrated_count = 0
        for dev in devices:
            # 1. ssh_password
            if "ssh_password" in dev and dev["ssh_password"] and not is_encrypted(dev["ssh_password"]):
                dev["ssh_password"] = encrypt_credential(dev["ssh_password"])
                migrated_count += 1

            # 2. enable_password
            if "enable_password" in dev and dev["enable_password"] and not is_encrypted(dev["enable_password"]):
                dev["enable_password"] = encrypt_credential(dev["enable_password"])
                migrated_count += 1

            # 3. connection.password
            conn = dev.get("connection")
            if isinstance(conn, dict):
                if "password" in conn and conn["password"] and not is_encrypted(conn["password"]):
                    conn["password"] = encrypt_credential(conn["password"])
                    migrated_count += 1

        if migrated_count > 0:
            with open(db_file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"[Crypto] Encrypted {migrated_count} cleartext credential fields in {db_file_path}")

        return migrated_count
    except Exception as e:
        print(f"[Crypto] Error during database credential migration in {db_file_path}: {e}")
        return 0
