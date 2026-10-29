-- ==============================================================================
-- NetTopology Enterprise - PostgreSQL Complete Relational Schema
-- Version: 1.47.0
-- Handles Users, RBAC, Active Directory, Devices, Topology, Hierarchy, Custom Maps, Logs, Sessions
-- ==============================================================================

-- 1. Users Table (Local and Active Directory Accounts)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(128) NOT NULL,
    role VARCHAR(64) NOT NULL DEFAULT 'Super Administrator',
    user_type VARCHAR(32) NOT NULL DEFAULT 'local', -- 'local' | 'ad'
    status VARCHAR(32) NOT NULL DEFAULT 'active',   -- 'active' | 'disabled'
    group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Ensure migration for users existing columns
DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(128) DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(128) DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(64) DEFAULT 'Super Administrator';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(32) DEFAULT 'local';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS group_ids JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Local User Groups / Roles
CREATE TABLE IF NOT EXISTS user_groups (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    color VARCHAR(32) DEFAULT 'indigo',
    member_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Granular Access Policies (RBAC)
CREATE TABLE IF NOT EXISTS access_policies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    priority INT NOT NULL DEFAULT 100,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    policy_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Network Devices
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    ip VARCHAR(64) NOT NULL,
    type VARCHAR(64) NOT NULL DEFAULT 'switch',
    model VARCHAR(128) DEFAULT 'Cisco Catalyst 2960X',
    platform VARCHAR(64) DEFAULT 'cisco_ios_xe',
    role VARCHAR(64) DEFAULT 'Access Switch',
    connection_mode VARCHAR(32) DEFAULT 'ssh',
    connection_protocol VARCHAR(32) DEFAULT 'ssh',
    ssh_host VARCHAR(64),
    ssh_port INT DEFAULT 22,
    winbox_port INT DEFAULT 8291,
    ssh_username VARCHAR(64) DEFAULT 'admin',
    ssh_password TEXT,
    enable_password TEXT,
    ssh_vault_item_id VARCHAR(64),
    enable_vault_item_id VARCHAR(64),
    snmp_enabled BOOLEAN DEFAULT FALSE,
    snmp_version VARCHAR(16) DEFAULT 'v2c',
    snmp_port INT DEFAULT 161,
    snmp_community VARCHAR(255),
    snmp_community_vault_item_id VARCHAR(64),
    snmp_v3_user VARCHAR(128),
    snmp_v3_security_level VARCHAR(32) DEFAULT 'authPriv',
    snmp_v3_auth_protocol VARCHAR(32) DEFAULT 'SHA-256',
    snmp_v3_auth_password VARCHAR(255),
    snmp_v3_auth_vault_item_id VARCHAR(64),
    snmp_v3_priv_protocol VARCHAR(32) DEFAULT 'AES-128',
    snmp_v3_priv_password VARCHAR(255),
    snmp_v3_priv_vault_item_id VARCHAR(64),
    snmp_v3_context VARCHAR(128),
    snmp_timeout INT DEFAULT 5000,
    snmp_retries INT DEFAULT 1,
    connection_data JSONB DEFAULT '{}'::jsonb,
    ports JSONB DEFAULT '[]'::jsonb,
    building VARCHAR(128),
    floor VARCHAR(128),
    unit VARCHAR(128),
    rack VARCHAR(128),
    section VARCHAR(128),
    location VARCHAR(128),
    hierarchy_id VARCHAR(64),
    ssh_version VARCHAR(32) DEFAULT 'legacy',
    is_online BOOLEAN DEFAULT TRUE,
    latency_ms FLOAT DEFAULT 1.5,
    mac_address VARCHAR(32),
    serial_number VARCHAR(64),
    uptime_str VARCHAR(64),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip);
CREATE INDEX IF NOT EXISTS idx_devices_platform ON devices(platform);
CREATE INDEX IF NOT EXISTS idx_devices_building ON devices(building);
CREATE INDEX IF NOT EXISTS idx_devices_floor ON devices(floor);
CREATE INDEX IF NOT EXISTS idx_devices_rack ON devices(rack);
CREATE INDEX IF NOT EXISTS idx_devices_ssh_vault ON devices(ssh_vault_item_id);
CREATE INDEX IF NOT EXISTS idx_devices_enable_vault ON devices(enable_vault_item_id);
CREATE INDEX IF NOT EXISTS idx_devices_snmp_comm_vault ON devices(snmp_community_vault_item_id);
CREATE INDEX IF NOT EXISTS idx_devices_snmp_auth_vault ON devices(snmp_v3_auth_vault_item_id);
CREATE INDEX IF NOT EXISTS idx_devices_snmp_priv_vault ON devices(snmp_v3_priv_vault_item_id);

-- Safe migration for existing devices table columns
DO $$ BEGIN
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS building VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS floor VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS unit VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS rack VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS section VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS location VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS hierarchy_id VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssh_version VARCHAR(32) DEFAULT 'legacy';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssh_vault_item_id VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS enable_vault_item_id VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_version VARCHAR(16) DEFAULT 'v2c';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_port INT DEFAULT 161;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_community VARCHAR(255);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_community_vault_item_id VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_user VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_security_level VARCHAR(32) DEFAULT 'authPriv';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_auth_protocol VARCHAR(32) DEFAULT 'SHA-256';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_auth_password VARCHAR(255);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_auth_vault_item_id VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_priv_protocol VARCHAR(32) DEFAULT 'AES-128';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_priv_password VARCHAR(255);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_priv_vault_item_id VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_context VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_timeout INT DEFAULT 5000;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_retries INT DEFAULT 1;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 4.1 Device Physical Placements (Explicit Relational Association)
CREATE TABLE IF NOT EXISTS device_placements (
    id VARCHAR(64) PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    building VARCHAR(128),
    floor VARCHAR(128),
    unit VARCHAR(128),
    rack VARCHAR(128),
    section VARCHAR(128),
    hierarchy_id VARCHAR(64),
    position_u INT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_placements_device ON device_placements(device_id);
CREATE INDEX IF NOT EXISTS idx_device_placements_bldg ON device_placements(building);
CREATE INDEX IF NOT EXISTS idx_device_placements_floor ON device_placements(floor);
CREATE INDEX IF NOT EXISTS idx_device_placements_rack ON device_placements(rack);

-- 5. Device Groups (E.g. Core, Helpdesk, Branch)
CREATE TABLE IF NOT EXISTS device_groups (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    color VARCHAR(32) DEFAULT 'indigo',
    icon VARCHAR(64) DEFAULT 'Server',
    device_ids JSONB DEFAULT '[]'::jsonb,
    server_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Custom Schematic & Physical Maps
CREATE TABLE IF NOT EXISTS custom_maps (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    map_type VARCHAR(32) DEFAULT 'schematic',
    building_id VARCHAR(64),
    floor_id VARCHAR(64),
    unit_id VARCHAR(64),
    rack_id VARCHAR(64),
    nodes JSONB DEFAULT '[]'::jsonb,
    connections JSONB DEFAULT '[]'::jsonb,
    viewport JSONB DEFAULT '{"zoom": 1, "pan": {"x": 0, "y": 0}}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    visibility VARCHAR(32) DEFAULT 'public', -- 'public' | 'private' | 'restricted'
    owner_id VARCHAR(64) DEFAULT 'user-admin',
    owner_name VARCHAR(128) DEFAULT 'admin',
    allowed_users JSONB DEFAULT '[]'::jsonb,
    map_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure migration for custom_maps existing columns
DO $$ BEGIN
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS map_type VARCHAR(32) DEFAULT 'schematic';
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS building_id VARCHAR(64);
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS floor_id VARCHAR(64);
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS unit_id VARCHAR(64);
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS rack_id VARCHAR(64);
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS connections JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS viewport JSONB DEFAULT '{"zoom": 1, "pan": {"x": 0, "y": 0}}'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) DEFAULT 'public';
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64) DEFAULT 'user-admin';
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128) DEFAULT 'admin';
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS allowed_users JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS map_data JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 7. Topology Structural Hierarchy (Buildings, Floors, Units, Racks)
CREATE TABLE IF NOT EXISTS topology_hierarchy (
    id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(32) NOT NULL, -- 'building' | 'floor' | 'unit' | 'rack'
    parent_id VARCHAR(64),
    name VARCHAR(128) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hierarchy_type ON topology_hierarchy(type);
CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON topology_hierarchy(parent_id);

-- 8. Node Positions on Canvas
CREATE TABLE IF NOT EXISTS node_positions (
    map_id VARCHAR(64) NOT NULL DEFAULT 'default',
    node_id VARCHAR(64) NOT NULL,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    PRIMARY KEY (map_id, node_id)
);

-- 9. Comprehensive Audit, Security, & Command Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_name VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    category VARCHAR(64) DEFAULT 'security',
    target VARCHAR(128),
    status VARCHAR(32) DEFAULT 'success', -- 'success' | 'warning' | 'error' | 'info'
    details TEXT,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_name);

-- 10. Active Directory Configuration
CREATE TABLE IF NOT EXISTS ad_config (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'primary',
    config_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. User Auth Sessions & Revocation Tokens
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(64),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 12. Device Sticky Notes (Schematic Map & Inventory Integration)
CREATE TABLE IF NOT EXISTS device_sticky_notes (
    id VARCHAR(128) PRIMARY KEY,
    device_id VARCHAR(128) NOT NULL,
    title VARCHAR(255),
    content TEXT,
    color VARCHAR(32) DEFAULT 'yellow',
    x NUMERIC DEFAULT 100,
    y NUMERIC DEFAULT 100,
    width NUMERIC DEFAULT 230,
    view_mode VARCHAR(32) DEFAULT 'card',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_sticky_notes_dev ON device_sticky_notes(device_id);

-- 13. Remote Servers Fleet (Linux & Windows Host Management with Categorization & Automation Tags)
CREATE TABLE IF NOT EXISTS remote_servers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    hostname VARCHAR(128),
    ip VARCHAR(64) NOT NULL,
    os_type VARCHAR(32) NOT NULL DEFAULT 'linux', -- 'linux' | 'windows'
    os_distro VARCHAR(64) DEFAULT 'Ubuntu 24.04 LTS',
    environment VARCHAR(64) DEFAULT 'Production', -- 'Production' | 'Staging' | 'Development' | 'Testing' | 'DMZ' | 'DR'
    category VARCHAR(64) DEFAULT 'Application Server',
    role VARCHAR(64) DEFAULT 'Web & API Backend',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ssh_port INT DEFAULT 22,
    ssh_username VARCHAR(64) DEFAULT 'root',
    ssh_password VARCHAR(255),
    ssh_vault_item_id VARCHAR(64),
    ssh_key_path VARCHAR(255),
    default_shell VARCHAR(32) DEFAULT 'bash', -- 'bash' | 'zsh' | 'sh'
    win_protocol VARCHAR(32) DEFAULT 'rdp', -- 'rdp' | 'powershell' | 'winrm'
    win_port INT DEFAULT 3389,
    win_username VARCHAR(64) DEFAULT 'Administrator',
    win_password TEXT DEFAULT '',
    win_vault_item_id VARCHAR(64),
    win_domain VARCHAR(64) DEFAULT '',
    rdp_security VARCHAR(16) DEFAULT 'any', -- 'any' | 'nla' | 'tls' | 'rdp'
    status VARCHAR(32) DEFAULT 'untested', -- 'online' | 'offline' | 'unreachable' | 'untested'
    cpu_cores INT,
    ram_gb NUMERIC,
    disk_gb INT,
    uptime_str VARCHAR(64) DEFAULT '',
    location VARCHAR(128) DEFAULT 'Datacenter A (Rack R-04)',
    notes TEXT,
    prompt_password_on_connect BOOLEAN DEFAULT FALSE,
    installed_web_servers JSONB NOT NULL DEFAULT '[]'::jsonb,
    installed_databases JSONB NOT NULL DEFAULT '[]'::jsonb,
    has_apache BOOLEAN DEFAULT FALSE,
    has_nginx BOOLEAN DEFAULT FALSE,
    has_postgresql BOOLEAN DEFAULT FALSE,
    has_mysql BOOLEAN DEFAULT FALSE,
    postgres_port INT DEFAULT 5432,
    postgres_user VARCHAR(64) DEFAULT 'postgres',
    postgres_password TEXT DEFAULT '',
    db_vault_item_id VARCHAR(64),
    postgres_database VARCHAR(64) DEFAULT 'postgres',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS prompt_password_on_connect BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS installed_web_servers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS installed_databases JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_apache BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_nginx BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_postgresql BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_mysql BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_port INT DEFAULT 5432;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_user VARCHAR(64) DEFAULT 'postgres';
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_password TEXT DEFAULT '';
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_database VARCHAR(64) DEFAULT 'postgres';
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS ssh_vault_item_id VARCHAR(64);
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS win_vault_item_id VARCHAR(64);
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS db_vault_item_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_remote_servers_os_type ON remote_servers(os_type);
CREATE INDEX IF NOT EXISTS idx_remote_servers_environment ON remote_servers(environment);
CREATE INDEX IF NOT EXISTS idx_remote_servers_category ON remote_servers(category);
CREATE INDEX IF NOT EXISTS idx_remote_servers_ip ON remote_servers(ip);
CREATE INDEX IF NOT EXISTS idx_remote_servers_ssh_vault ON remote_servers(ssh_vault_item_id);
CREATE INDEX IF NOT EXISTS idx_remote_servers_win_vault ON remote_servers(win_vault_item_id);
CREATE INDEX IF NOT EXISTS idx_remote_servers_db_vault ON remote_servers(db_vault_item_id);

-- 14. Server Categories (Dynamic Fleet Grouping with Localization & Color Badging)
CREATE TABLE IF NOT EXISTS server_categories (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    name_fa VARCHAR(150),
    description TEXT,
    color VARCHAR(50) DEFAULT 'indigo',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_server_categories_name ON server_categories(name);

-- 15. User Password Vault (Per-User Isolated Encrypted Credentials)
CREATE TABLE IF NOT EXISTS user_password_vault (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    name VARCHAR(150) NOT NULL,
    username VARCHAR(128),
    encrypted_password TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL,
    tag VARCHAR(64) NOT NULL,
    password_hash VARCHAR(128),
    password_salt VARCHAR(64),
    category VARCHAR(64) DEFAULT 'general',
    target_host VARCHAR(150),
    notes TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    strength VARCHAR(32) DEFAULT 'strong',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_vault_user_id ON user_password_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vault_category ON user_password_vault(category);

-- Ensure migration for user_password_vault hash columns
DO $$ BEGIN
    ALTER TABLE user_password_vault ADD COLUMN IF NOT EXISTS password_hash VARCHAR(128);
    ALTER TABLE user_password_vault ADD COLUMN IF NOT EXISTS password_salt VARCHAR(64);
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Dynamic Alterations for Seamless Upgrades
ALTER TABLE devices ADD COLUMN IF NOT EXISTS winbox_port INT DEFAULT 8291;

-- 16. Bulk Server Execution Reports & Fleet Audit History
CREATE TABLE IF NOT EXISTS bulk_server_reports (
    id VARCHAR(128) PRIMARY KEY,
    job_id VARCHAR(128) NOT NULL,
    template_id VARCHAR(128) NOT NULL,
    template_title VARCHAR(255) NOT NULL,
    template_title_en VARCHAR(255),
    category VARCHAR(100),
    icon VARCHAR(50),
    status VARCHAR(50) NOT NULL,
    operator_user VARCHAR(128) DEFAULT 'Administrator',
    duration_ms INTEGER DEFAULT 0,
    total_servers INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    server_summaries JSONB NOT NULL DEFAULT '[]'::jsonb,
    impact_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    results JSONB NOT NULL DEFAULT '{}'::jsonb,
    logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at BIGINT NOT NULL,
    finished_at BIGINT NOT NULL,
    created_at_dt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at_dt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_created ON bulk_server_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_template ON bulk_server_reports(template_id);
CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_status ON bulk_server_reports(status);
CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_job_id ON bulk_server_reports(job_id);

-- 17. Automated Scheduled Disaster Recovery Backup Jobs
CREATE TABLE IF NOT EXISTS scheduled_backup_jobs (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    schedule_type VARCHAR(32) NOT NULL DEFAULT 'daily', -- 'hourly' | 'daily' | 'weekly' | 'custom_interval'
    run_time VARCHAR(16) DEFAULT '02:00',
    days_of_week JSONB DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
    interval_minutes INT DEFAULT 1440,
    scope VARCHAR(64) NOT NULL DEFAULT 'full',
    encrypt BOOLEAN NOT NULL DEFAULT FALSE,
    passphrase TEXT DEFAULT '',
    sanitize BOOLEAN NOT NULL DEFAULT FALSE,
    retention_count INT NOT NULL DEFAULT 10,
    retention_days INT NOT NULL DEFAULT 30,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    last_status VARCHAR(32) DEFAULT 'idle', -- 'idle' | 'running' | 'success' | 'failed'
    last_result_details TEXT,
    last_backup_file VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_enabled ON scheduled_backup_jobs(enabled);

-- 18. Network Equipment Configuration Templates & Patterns
CREATE TABLE IF NOT EXISTS config_templates (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    vendor VARCHAR(64) NOT NULL DEFAULT 'cisco',
    target_type VARCHAR(64) NOT NULL DEFAULT 'switch',
    target_platform VARCHAR(64),
    category VARCHAR(64),
    role VARCHAR(128) DEFAULT 'Access Switch',
    description TEXT,
    default_cli_mode VARCHAR(64) DEFAULT 'GLOBAL_CONFIG',
    commands TEXT NOT NULL DEFAULT '',
    variables JSONB NOT NULL DEFAULT '[]'::jsonb,
    author VARCHAR(128) DEFAULT 'Network Administrator',
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_config_templates_vendor ON config_templates(vendor);
CREATE INDEX IF NOT EXISTS idx_config_templates_target_type ON config_templates(target_type);

-- 19. Persistent System Security Keychain & Master Encryption Keys
CREATE TABLE IF NOT EXISTS system_security_keys (
    key_name VARCHAR(64) PRIMARY KEY,
    master_key TEXT NOT NULL,
    legacy_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 20. Remote Servers & Automation Fleet Command and Audit Logs
CREATE TABLE IF NOT EXISTS server_command_audit_logs (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64),
    user_name VARCHAR(128) NOT NULL,
    user_role VARCHAR(128) DEFAULT 'Super Administrator',
    client_ip VARCHAR(64) DEFAULT '127.0.0.1',
    server_id VARCHAR(128) NOT NULL,
    server_name VARCHAR(255) NOT NULL,
    server_ip VARCHAR(64) NOT NULL,
    os_type VARCHAR(32) NOT NULL DEFAULT 'linux', -- 'linux' | 'windows'
    os_distro VARCHAR(64),
    server_environment VARCHAR(64),
    channel VARCHAR(64) NOT NULL DEFAULT '3DOTS_ACTION', -- 'SSH_SHELL' | 'REMOTE_DESKTOP_RDP' | 'REMOTE_DESKTOP_VNC' | '3DOTS_ACTION' | 'API_DISPATCH'
    action_module VARCHAR(64) NOT NULL, -- 'FILE_EXPLORER' | 'CRON_MANAGER' | 'FIREWALL_UFW' | 'STORAGE_LVM' | 'NGINX_MANAGEMENT' | etc.
    action_name VARCHAR(255) NOT NULL,
    action_name_en VARCHAR(255),
    command TEXT,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    risk_level VARCHAR(32) NOT NULL DEFAULT 'low', -- 'low' | 'medium' | 'high' | 'critical'
    status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS' | 'FAILED' | 'ACCESS_DENIED'
    output_summary TEXT,
    output_summary_en TEXT,
    duration_ms INTEGER DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_server_audit_timestamp ON server_command_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_server_audit_server_id ON server_command_audit_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_server_audit_user_name ON server_command_audit_logs(user_name);
CREATE INDEX IF NOT EXISTS idx_server_audit_channel ON server_command_audit_logs(channel);
CREATE INDEX IF NOT EXISTS idx_server_audit_action_module ON server_command_audit_logs(action_module);

-- Automated Audit & Server Fleet Command Scheduled Email Reporting
CREATE TABLE IF NOT EXISTS audit_report_schedule (
    id VARCHAR(64) PRIMARY KEY,
    config_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(128)
);

-- 21. Device Command Audit Logs (Cisco, MikroTik, Linux Network Devices)
CREATE TABLE IF NOT EXISTS device_command_audit_logs (
    id VARCHAR(128) PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(128) NOT NULL,
    device_ip VARCHAR(64) NOT NULL,
    device_vendor VARCHAR(64) DEFAULT 'cisco',
    device_model VARCHAR(128),
    device_location TEXT,
    operator_username VARCHAR(128) NOT NULL,
    operator_role VARCHAR(128) DEFAULT 'Super Administrator',
    operator_ip VARCHAR(64) DEFAULT '127.0.0.1',
    channel VARCHAR(64) DEFAULT 'terminal_interactive', -- 'terminal_interactive' | 'template_push' | 'port_context_menu' | 'batch_config' | 'api_script'
    command TEXT NOT NULL,
    risk_level VARCHAR(32) DEFAULT 'low', -- 'low' | 'medium' | 'high' | 'critical'
    status VARCHAR(32) DEFAULT 'success', -- 'success' | 'failed' | 'denied'
    output_summary TEXT,
    duration_ms INTEGER DEFAULT 0,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_cmd_audit_timestamp ON device_command_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_cmd_audit_device_id ON device_command_audit_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_device_cmd_audit_operator ON device_command_audit_logs(operator_username);
CREATE INDEX IF NOT EXISTS idx_device_cmd_audit_risk ON device_command_audit_logs(risk_level);

-- 22. Portal Audit & System Change Event Logs
CREATE TABLE IF NOT EXISTS portal_audit_logs (
    id VARCHAR(128) PRIMARY KEY,
    category VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    title VARCHAR(255) NOT NULL,
    title_en VARCHAR(255) NOT NULL,
    user_name VARCHAR(128) NOT NULL,
    user_role VARCHAR(128) DEFAULT 'Super Administrator',
    client_ip VARCHAR(64) DEFAULT '127.0.0.1',
    target_type VARCHAR(64),
    target_id VARCHAR(64),
    target_name VARCHAR(255),
    target_location TEXT,
    target_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    severity VARCHAR(32) DEFAULT 'info', -- 'info' | 'notice' | 'warning' | 'critical'
    status VARCHAR(32) DEFAULT 'success', -- 'success' | 'failed' | 'denied'
    details TEXT,
    details_en TEXT,
    changes_diff JSONB NOT NULL DEFAULT '[]'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_audit_timestamp ON portal_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_portal_audit_category ON portal_audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_portal_audit_user ON portal_audit_logs(user_name);

-- 23. Database Log Retention, Automated Purge & Storage Policy Config
CREATE TABLE IF NOT EXISTS log_retention_config (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'primary',
    config_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(128)
);
