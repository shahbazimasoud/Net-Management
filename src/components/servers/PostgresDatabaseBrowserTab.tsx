import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  Server,
  Users,
  User,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  Table as TableIcon,
  Eye,
  Zap,
  Code,
  Wrench,
  Hash,
  Puzzle,
  Copy,
  Check,
  Layers,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Clock,
  HardDrive,
  BarChart3,
  Sliders,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresEngineOverview,
  PostgresDatabaseItem,
  PostgresRoleItem,
  PostgresTableItem,
  PostgresViewItem,
  PostgresRoutineItem,
  PostgresSequenceItem,
  PostgresExtensionItem,
  PostgresSchemaObjects,
  PostgresDatabaseTree,
} from '../../types';
import {
  fetchRemoteServerPostgresRoles,
  fetchRemoteServerPostgresDatabaseTree,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresDatabaseBrowserTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  databases: PostgresDatabaseItem[];
  overviewData: PostgresEngineOverview | null;
  onRefreshDatabases: () => Promise<void>;
  onRefreshOverview: () => Promise<void>;
}

export type SelectedNodeType =
  | 'root'
  | 'databases_folder'
  | 'database'
  | 'roles_folder'
  | 'role'
  | 'server_folder'
  | 'schemas_folder'
  | 'schema'
  | 'tables_folder'
  | 'table'
  | 'views_folder'
  | 'view'
  | 'matviews_folder'
  | 'matview'
  | 'functions_folder'
  | 'function'
  | 'procedures_folder'
  | 'procedure'
  | 'sequences_folder'
  | 'sequence'
  | 'extensions_folder'
  | 'extension';

export interface SelectedNode {
  type: SelectedNodeType;
  id: string;
  name: string;
  dbName?: string;
  schemaName?: string;
  data?: any;
}

export const PostgresDatabaseBrowserTab: React.FC<PostgresDatabaseBrowserTabProps> = ({
  server,
  isLightMode,
  isEn,
  databases,
  overviewData,
  onRefreshDatabases,
  onRefreshOverview,
}) => {
  // Tree expansion state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    return new Set(['root', 'databases_folder', 'roles_folder', 'server_folder']);
  });

  // Selected node in tree
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({
    type: 'root',
    id: 'root',
    name: 'PostgreSQL',
  });

  // Lazy-loaded database trees cache: dbName -> PostgresDatabaseTree
  const [databaseTrees, setDatabaseTrees] = useState<Record<string, PostgresDatabaseTree>>({});
  const [loadingTreeDbs, setLoadingTreeDbs] = useState<Set<string>>(new Set());
  const [treeErrors, setTreeErrors] = useState<Record<string, { en: string; fa?: string }>>({});

  // Roles list state
  const [rolesList, setRolesList] = useState<PostgresRoleItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [rolesError, setRolesError] = useState<{ en: string; fa?: string } | null>(null);

  // Search filter inside tree and detail views
  const [treeFilter, setTreeFilter] = useState('');
  const [detailFilter, setDetailFilter] = useState('');
  const [copiedText, setCopiedText] = useState(false);

  // Fetch roles
  const handleFetchRoles = useCallback(async () => {
    if (!server?.id) return;
    setLoadingRoles(true);
    setRolesError(null);
    try {
      const res = await fetchRemoteServerPostgresRoles(server.id);
      if (res.success && res.roles) {
        setRolesList(res.roles);
      } else {
        setRolesError({
          en: res.error || 'Failed to enumerate PostgreSQL roles',
          fa: res.errorFa || 'خطا در بارگذاری فهرست نقش‌ها و کاربران',
        });
      }
    } catch (err: any) {
      setRolesError({
        en: err.message || 'Network error listing roles',
        fa: 'خطای شبکه در دریافت نقش‌ها',
      });
    } finally {
      setLoadingRoles(false);
    }
  }, [server?.id]);

  // Initial load of roles on mount
  useEffect(() => {
    if (server?.id) {
      handleFetchRoles();
    }
  }, [server?.id, handleFetchRoles]);

  // Lazy-load database object tree
  const handleLoadDatabaseTree = useCallback(
    async (dbName: string, force = false) => {
      if (!server?.id || !dbName) return;
      if (!force && databaseTrees[dbName]) return;

      setLoadingTreeDbs((prev) => new Set(prev).add(dbName));
      setTreeErrors((prev) => {
        const copy = { ...prev };
        delete copy[dbName];
        return copy;
      });

      try {
        const res = await fetchRemoteServerPostgresDatabaseTree(server.id, dbName);
        if (res.success && res.tree) {
          setDatabaseTrees((prev) => ({ ...prev, [dbName]: res.tree! }));
        } else {
          setTreeErrors((prev) => ({
            ...prev,
            [dbName]: {
              en: res.error || `Failed to explore objects for "${dbName}"`,
              fa: res.errorFa || `خطا در دریافت اجزای پایگاه داده "${dbName}"`,
            },
          }));
        }
      } catch (err: any) {
        setTreeErrors((prev) => ({
          ...prev,
          [dbName]: {
            en: err.message || `Network error exploring "${dbName}"`,
            fa: `خطای شبکه در دریافت اطلاعات "${dbName}"`,
          },
        }));
      } finally {
        setLoadingTreeDbs((prev) => {
          const next = new Set(prev);
          next.delete(dbName);
          return next;
        });
      }
    },
    [server?.id, databaseTrees]
  );

  // Toggle node expansion
  const toggleNode = (nodeId: string, onExpandCallback?: () => void) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
        if (onExpandCallback) {
          onExpandCallback();
        }
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Filter databases by tree search query
  const filteredTreeDatabases = useMemo(() => {
    if (!treeFilter.trim()) return databases;
    const q = treeFilter.trim().toLowerCase();
    return databases.filter((db) => db.name.toLowerCase().includes(q));
  }, [databases, treeFilter]);

  // Filter roles by tree search query
  const filteredTreeRoles = useMemo(() => {
    if (!treeFilter.trim()) return rolesList;
    const q = treeFilter.trim().toLowerCase();
    return rolesList.filter((r) => r.rolname.toLowerCase().includes(q));
  }, [rolesList, treeFilter]);

  // Breadcrumbs text builder
  const breadcrumbParts = useMemo(() => {
    const parts: string[] = ['PostgreSQL'];
    if (selectedNode.dbName) {
      parts.push(selectedNode.dbName);
    }
    if (selectedNode.schemaName) {
      parts.push(selectedNode.schemaName);
    }
    if (selectedNode.name && selectedNode.name !== selectedNode.dbName && selectedNode.name !== 'PostgreSQL') {
      parts.push(selectedNode.name);
    }
    return parts;
  }, [selectedNode]);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Quick Status & Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>{isEn ? 'PostgreSQL Object Explorer' : 'کاوشگر و درخت ساختار پایگاه داده'}</span>
          </h3>
          <span
            className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
              isLightMode ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {databases.length} {isEn ? 'Databases' : 'دیتابیس'}
          </span>
          <span
            className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
              isLightMode ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {rolesList.length} {isEn ? 'Roles' : 'نقش/کاربر'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onRefreshDatabases();
              handleFetchRoles();
              onRefreshOverview();
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              isLightMode ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
            title={isEn ? 'Reload Server Objects' : 'بارگذاری مجدد اجزای سرور'}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isEn ? 'Reload Server' : 'بروزرسانی سرور'}</span>
          </button>
        </div>
      </div>

      {/* Main Split-Pane Explorer Layout */}
      <div
        className={`flex-1 flex flex-col md:flex-row rounded-xl border overflow-hidden min-h-[520px] ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        {/* ======================================================== */}
        {/* LEFT PANE: Hierarchical Database Object Tree              */}
        {/* ======================================================== */}
        <div
          className={`w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r flex flex-col ${
            isLightMode ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/80 border-slate-800'
          }`}
        >
          {/* Tree Search Box */}
          <div className="p-2.5 border-b border-inherit">
            <div
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={treeFilter}
                onChange={(e) => setTreeFilter(e.target.value)}
                placeholder={isEn ? 'Filter tree objects...' : 'فیلتر درخت اجزا...'}
                className="w-full bg-transparent focus:outline-hidden text-xs"
              />
              {treeFilter && (
                <button
                  type="button"
                  onClick={() => setTreeFilter('')}
                  className="text-slate-400 hover:text-slate-200 text-xs px-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Tree Node Hierarchy */}
          <div className="flex-1 overflow-y-auto p-2 text-xs select-none space-y-0.5 font-mono">
            {/* 1. ROOT NODE: PostgreSQL Cluster */}
            <div>
              <div
                onClick={() =>
                  setSelectedNode({
                    type: 'root',
                    id: 'root',
                    name: 'PostgreSQL',
                  })
                }
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition ${
                  selectedNode.type === 'root'
                    ? isLightMode
                      ? 'bg-blue-100 text-blue-800 font-bold'
                      : 'bg-blue-600/20 text-blue-400 font-bold border border-blue-500/30'
                    : isLightMode
                    ? 'hover:bg-slate-200/70 text-slate-800'
                    : 'hover:bg-slate-800/60 text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNode('root');
                  }}
                  className="p-0.5 hover:text-white"
                >
                  {expandedNodes.has('root') ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                <Server className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="truncate font-sans font-semibold text-xs">PostgreSQL</span>
                <span className="text-[10px] text-slate-400 ml-auto font-mono">
                  {overviewData?.versionShort || server.postgres_port || 5432}
                </span>
              </div>

              {/* Children of Root */}
              {expandedNodes.has('root') && (
                <div className="pl-4 pr-1 mt-1 space-y-0.5 border-l border-slate-700/30 ml-2.5">
                  {/* ======================================================== */}
                  {/* BRANCH A: Databases                                      */}
                  {/* ======================================================== */}
                  <div>
                    <div
                      onClick={() => {
                        setSelectedNode({
                          type: 'databases_folder',
                          id: 'databases_folder',
                          name: isEn ? 'Databases' : 'پایگاه‌های داده',
                        });
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                        selectedNode.type === 'databases_folder'
                          ? isLightMode
                            ? 'bg-blue-100 text-blue-800 font-bold'
                            : 'bg-blue-600/20 text-blue-400 font-bold'
                          : isLightMode
                          ? 'hover:bg-slate-200/70 text-slate-700'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNode('databases_folder');
                        }}
                        className="p-0.5 hover:text-white"
                      >
                        {expandedNodes.has('databases_folder') ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {expandedNodes.has('databases_folder') ? (
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="truncate font-sans font-medium text-xs">
                        {isEn ? 'Databases' : 'پایگاه‌های داده'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-800 text-slate-400 ml-auto">
                        {filteredTreeDatabases.length}
                      </span>
                    </div>

                    {/* Databases list */}
                    {expandedNodes.has('databases_folder') && (
                      <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                        {filteredTreeDatabases.map((db) => {
                          const dbNodeId = `db:${db.name}`;
                          const isExpanded = expandedNodes.has(dbNodeId);
                          const isSelected = selectedNode.type === 'database' && selectedNode.id === dbNodeId;
                          const isLoadingTree = loadingTreeDbs.has(db.name);
                          const tree = databaseTrees[db.name];
                          const error = treeErrors[db.name];

                          return (
                            <div key={db.oid || db.name}>
                              <div
                                onClick={() => {
                                  setSelectedNode({
                                    type: 'database',
                                    id: dbNodeId,
                                    name: db.name,
                                    dbName: db.name,
                                    data: db,
                                  });
                                  if (!tree && !isLoadingTree) {
                                    handleLoadDatabaseTree(db.name);
                                  }
                                }}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition ${
                                  isSelected
                                    ? isLightMode
                                      ? 'bg-blue-100 text-blue-800 font-bold'
                                      : 'bg-blue-600/20 text-blue-400 font-bold'
                                    : isLightMode
                                    ? 'hover:bg-slate-200/70 text-slate-700'
                                    : 'hover:bg-slate-800/60 text-slate-300'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleNode(dbNodeId, () => {
                                      if (!tree && !isLoadingTree) {
                                        handleLoadDatabaseTree(db.name);
                                      }
                                    });
                                  }}
                                  className="p-0.5 hover:text-white"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3 h-3" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3" />
                                  )}
                                </button>
                                <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span className="truncate text-xs font-mono">{db.name}</span>
                                {isLoadingTree && (
                                  <RefreshCw className="w-3 h-3 animate-spin text-blue-400 ml-auto shrink-0" />
                                )}
                                {!isLoadingTree && db.sizePretty && db.sizePretty !== 'N/A' && (
                                  <span className="text-[10px] text-slate-500 ml-auto shrink-0">
                                    {db.sizePretty}
                                  </span>
                                )}
                              </div>

                              {/* Lazy-loaded DB content */}
                              {isExpanded && (
                                <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                                  {isLoadingTree && (
                                    <div className="py-1 text-[11px] text-blue-400 flex items-center gap-1.5 font-sans">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      <span>{isEn ? 'Exploring schemas & objects...' : 'در حال بارگذاری اجزا...'}</span>
                                    </div>
                                  )}

                                  {error && (
                                    <div className="p-1.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-400 font-sans space-y-1">
                                      <p>{isEn ? error.en : error.fa || error.en}</p>
                                      <button
                                        type="button"
                                        onClick={() => handleLoadDatabaseTree(db.name, true)}
                                        className="text-[10px] underline font-bold"
                                      >
                                        {isEn ? 'Retry' : 'تلاش مجدد'}
                                      </button>
                                    </div>
                                  )}

                                  {tree && (
                                    <>
                                      {/* 1. Schemas Folder */}
                                      <div>
                                        <div
                                          onClick={() => {
                                            setSelectedNode({
                                              type: 'schemas_folder',
                                              id: `schemas:${db.name}`,
                                              name: isEn ? 'Schemas' : 'اسکیماها',
                                              dbName: db.name,
                                              data: tree.schemas,
                                            });
                                          }}
                                          className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                                            selectedNode.id === `schemas:${db.name}`
                                              ? 'bg-blue-600/20 text-blue-400 font-bold'
                                              : 'hover:bg-slate-800/40 text-slate-400'
                                          }`}
                                        >
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleNode(`schemas:${db.name}`);
                                            }}
                                            className="p-0.5 hover:text-white"
                                          >
                                            {expandedNodes.has(`schemas:${db.name}`) ? (
                                              <ChevronDown className="w-3 h-3" />
                                            ) : (
                                              <ChevronRight className="w-3 h-3" />
                                            )}
                                          </button>
                                          <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                          <span className="font-sans text-xs">
                                            {isEn ? 'Schemas' : 'اسکیماها'}
                                          </span>
                                          <span className="text-[10px] ml-auto text-slate-500 font-mono">
                                            {tree.schemas.length}
                                          </span>
                                        </div>

                                        {/* List of Schemas */}
                                        {expandedNodes.has(`schemas:${db.name}`) && (
                                          <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                                            {tree.schemas.map((schema) => {
                                              const schemaNodeId = `schema:${db.name}:${schema.name}`;
                                              const isSchemaExpanded = expandedNodes.has(schemaNodeId);
                                              const isSchemaSelected =
                                                selectedNode.type === 'schema' && selectedNode.id === schemaNodeId;

                                              return (
                                                <div key={schema.name}>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedNode({
                                                        type: 'schema',
                                                        id: schemaNodeId,
                                                        name: schema.name,
                                                        dbName: db.name,
                                                        schemaName: schema.name,
                                                        data: schema,
                                                      });
                                                    }}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                                                      isSchemaSelected
                                                        ? 'bg-blue-600/20 text-blue-400 font-bold'
                                                        : 'hover:bg-slate-800/40 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleNode(schemaNodeId);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {isSchemaExpanded ? (
                                                        <ChevronDown className="w-3 h-3" />
                                                      ) : (
                                                        <ChevronRight className="w-3 h-3" />
                                                      )}
                                                    </button>
                                                    <Layers className="w-3 h-3 text-purple-400 shrink-0" />
                                                    <span className="truncate text-xs font-mono">{schema.name}</span>
                                                  </div>

                                                  {/* Schema Objects */}
                                                  {isSchemaExpanded && (
                                                    <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                                                      {/* Tables Node */}
                                                      <div
                                                        onClick={() => {
                                                          setSelectedNode({
                                                            type: 'tables_folder',
                                                            id: `tables:${db.name}:${schema.name}`,
                                                            name: isEn ? 'Tables' : 'جداول',
                                                            dbName: db.name,
                                                            schemaName: schema.name,
                                                            data: schema.tables,
                                                          });
                                                        }}
                                                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                          selectedNode.id === `tables:${db.name}:${schema.name}`
                                                            ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                                                            : 'hover:bg-slate-800/40 text-slate-400'
                                                        }`}
                                                      >
                                                        <TableIcon className="w-3 h-3 text-emerald-400 shrink-0" />
                                                        <span className="font-sans text-[11px]">
                                                          {isEn ? 'Tables' : 'جداول'}
                                                        </span>
                                                        <span className="text-[10px] ml-auto text-emerald-400 font-mono">
                                                          {schema.tables.length}
                                                        </span>
                                                      </div>

                                                      {/* Views Node */}
                                                      <div
                                                        onClick={() => {
                                                          setSelectedNode({
                                                            type: 'views_folder',
                                                            id: `views:${db.name}:${schema.name}`,
                                                            name: isEn ? 'Views' : 'نماها (Views)',
                                                            dbName: db.name,
                                                            schemaName: schema.name,
                                                            data: schema.views,
                                                          });
                                                        }}
                                                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                          selectedNode.id === `views:${db.name}:${schema.name}`
                                                            ? 'bg-sky-500/20 text-sky-400 font-bold'
                                                            : 'hover:bg-slate-800/40 text-slate-400'
                                                        }`}
                                                      >
                                                        <Eye className="w-3 h-3 text-sky-400 shrink-0" />
                                                        <span className="font-sans text-[11px]">
                                                          {isEn ? 'Views' : 'نماها (Views)'}
                                                        </span>
                                                        <span className="text-[10px] ml-auto text-sky-400 font-mono">
                                                          {schema.views.length}
                                                        </span>
                                                      </div>

                                                      {/* Materialized Views */}
                                                      {schema.materializedViews.length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'matviews_folder',
                                                              id: `matviews:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Materialized Views' : 'نماهای مادی (MatViews)',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.materializedViews,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `matviews:${db.name}:${schema.name}`
                                                              ? 'bg-amber-500/20 text-amber-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'MatViews' : 'نماهای مادی'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-amber-400 font-mono">
                                                            {schema.materializedViews.length}
                                                          </span>
                                                        </div>
                                                      )}

                                                      {/* Functions */}
                                                      {schema.functions.length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'functions_folder',
                                                              id: `functions:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Functions' : 'توابع (Functions)',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.functions,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `functions:${db.name}:${schema.name}`
                                                              ? 'bg-violet-500/20 text-violet-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          <Code className="w-3 h-3 text-violet-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'Functions' : 'توابع'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-violet-400 font-mono">
                                                            {schema.functions.length}
                                                          </span>
                                                        </div>
                                                      )}

                                                      {/* Procedures */}
                                                      {schema.procedures.length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'procedures_folder',
                                                              id: `procedures:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Procedures' : 'رویه‌ها (Procedures)',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.procedures,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `procedures:${db.name}:${schema.name}`
                                                              ? 'bg-indigo-500/20 text-indigo-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          <Wrench className="w-3 h-3 text-indigo-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'Procedures' : 'رویه‌ها'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-indigo-400 font-mono">
                                                            {schema.procedures.length}
                                                          </span>
                                                        </div>
                                                      )}

                                                      {/* Sequences */}
                                                      {schema.sequences.length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'sequences_folder',
                                                              id: `sequences:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Sequences' : 'دنباله‌ها (Sequences)',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.sequences,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `sequences:${db.name}:${schema.name}`
                                                              ? 'bg-rose-500/20 text-rose-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                        }`}
                                                      >
                                                        <Hash className="w-3 h-3 text-rose-400 shrink-0" />
                                                        <span className="font-sans text-[11px]">
                                                          {isEn ? 'Sequences' : 'دنباله‌ها'}
                                                        </span>
                                                        <span className="text-[10px] ml-auto text-rose-400 font-mono">
                                                          {schema.sequences.length}
                                                        </span>
                                                      </div>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>

                                      {/* 2. Extensions Folder */}
                                      <div
                                        onClick={() => {
                                          setSelectedNode({
                                            type: 'extensions_folder',
                                            id: `extensions:${db.name}`,
                                            name: isEn ? 'Extensions' : 'افزونه‌ها (Extensions)',
                                            dbName: db.name,
                                            data: tree.extensions,
                                          });
                                        }}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                                          selectedNode.id === `extensions:${db.name}`
                                            ? 'bg-amber-500/20 text-amber-400 font-bold'
                                            : 'hover:bg-slate-800/40 text-slate-400'
                                        }`}
                                      >
                                        <Puzzle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <span className="font-sans text-xs">
                                          {isEn ? 'Extensions' : 'افزونه‌ها (Extensions)'}
                                        </span>
                                        <span className="text-[10px] ml-auto text-slate-500 font-mono">
                                          {tree.extensions.length}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ======================================================== */}
                  {/* BRANCH B: Roles & Users                                  */}
                  {/* ======================================================== */}
                  <div>
                    <div
                      onClick={() => {
                        setSelectedNode({
                          type: 'roles_folder',
                          id: 'roles_folder',
                          name: isEn ? 'Roles & Users' : 'نقش‌ها و کاربران',
                          data: rolesList,
                        });
                        if (rolesList.length === 0 && !loadingRoles) {
                          handleFetchRoles();
                        }
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                        selectedNode.type === 'roles_folder'
                          ? isLightMode
                            ? 'bg-blue-100 text-blue-800 font-bold'
                            : 'bg-blue-600/20 text-blue-400 font-bold'
                          : isLightMode
                          ? 'hover:bg-slate-200/70 text-slate-700'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNode('roles_folder', () => {
                            if (rolesList.length === 0 && !loadingRoles) {
                              handleFetchRoles();
                            }
                          });
                        }}
                        className="p-0.5 hover:text-white"
                      >
                        {expandedNodes.has('roles_folder') ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate font-sans font-medium text-xs">
                        {isEn ? 'Roles & Users' : 'نقش‌ها و کاربران'}
                      </span>
                      {loadingRoles ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-emerald-400 ml-auto" />
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-800 text-slate-400 ml-auto">
                          {filteredTreeRoles.length}
                        </span>
                      )}
                    </div>

                    {/* Roles list */}
                    {expandedNodes.has('roles_folder') && (
                      <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                        {filteredTreeRoles.map((role) => {
                          const roleNodeId = `role:${role.rolname}`;
                          const isRoleSelected =
                            selectedNode.type === 'role' && selectedNode.id === roleNodeId;

                          return (
                            <div
                              key={role.rolname}
                              onClick={() => {
                                setSelectedNode({
                                  type: 'role',
                                  id: roleNodeId,
                                  name: role.rolname,
                                  data: role,
                                });
                              }}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                                isRoleSelected
                                  ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                                  : 'hover:bg-slate-800/40 text-slate-300'
                              }`}
                            >
                              {role.isSuperuser ? (
                                <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              ) : (
                                <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              <span className="truncate text-xs font-mono">{role.rolname}</span>
                              {role.isSuperuser && (
                                <span className="text-[9px] px-1 rounded font-sans bg-amber-500/15 text-amber-400 font-bold ml-auto">
                                  SU
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ======================================================== */}
                  {/* BRANCH C: Server Overview                                */}
                  {/* ======================================================== */}
                  <div>
                    <div
                      onClick={() => {
                        setSelectedNode({
                          type: 'server_folder',
                          id: 'server_folder',
                          name: isEn ? 'Server' : 'سرور و کلاستر',
                          data: overviewData,
                        });
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                        selectedNode.type === 'server_folder'
                          ? isLightMode
                            ? 'bg-blue-100 text-blue-800 font-bold'
                            : 'bg-blue-600/20 text-blue-400 font-bold'
                          : isLightMode
                          ? 'hover:bg-slate-200/70 text-slate-700'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <Server className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-4" />
                      <span className="truncate font-sans font-medium text-xs">
                        {isEn ? 'Server & Cluster' : 'سرور و پیکربندی کلاستر'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT PANE: Object Detail Inspector & Catalog View       */}
        {/* ======================================================== */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Top Breadcrumb & Metadata Header */}
          <div
            className={`px-4 sm:px-6 py-3 border-b flex items-center justify-between gap-3 shrink-0 ${
              isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap min-w-0 font-mono text-xs">
              {breadcrumbParts.map((part, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-slate-500">/</span>}
                  <span
                    className={
                      idx === breadcrumbParts.length - 1
                        ? 'font-bold text-blue-400 truncate max-w-[220px]'
                        : 'text-slate-400 truncate max-w-[150px]'
                    }
                  >
                    {part}
                  </span>
                </React.Fragment>
              ))}

              <button
                type="button"
                onClick={() => copyToClipboard(breadcrumbParts.join('.'))}
                className="p-1 hover:text-white text-slate-400 transition cursor-pointer"
                title={isEn ? 'Copy object path' : 'کپی مسیر شی'}
              >
                {copiedText ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  selectedNode.type === 'table' || selectedNode.type === 'tables_folder'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : selectedNode.type === 'view' || selectedNode.type === 'views_folder'
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    : selectedNode.type === 'database' || selectedNode.type === 'databases_folder'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : selectedNode.type === 'role' || selectedNode.type === 'roles_folder'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : selectedNode.type === 'function' || selectedNode.type === 'functions_folder'
                    ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                    : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                }`}
              >
                {selectedNode.type.replace('_folder', '')}
              </span>
            </div>
          </div>

          {/* Detail Body Content */}
          <div className="p-4 sm:p-6 space-y-5 flex-1">
            {/* ======================================================== */}
            {/* VIEW A: ROOT / SERVER OVERVIEW                           */}
            {/* ======================================================== */}
            {(selectedNode.type === 'root' || selectedNode.type === 'server_folder') && overviewData && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Server className="w-4 h-4 text-indigo-400" />
                    <span>{isEn ? 'PostgreSQL Cluster Overview' : 'مشخصات و مشخصه‌های کلاستر سرور'}</span>
                  </h4>
                  <FieldInfoTooltip
                    title={isEn ? 'PostgreSQL Engine Architecture' : 'معماری و وضعیت موتور PostgreSQL'}
                    whatIsIt={
                      isEn
                        ? 'Core instance specifications, execution directory, uptime and resource allocations.'
                        : 'مشخصات هسته، زمان روشن بودن، دایرکتوری داده‌ها و تخصیص منابع حافظه.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Essential for diagnosing health, capacity planning, and database operations.'
                        : 'ضروری جهت اطمینان از سلامت کلاستر و آگاهی از سقف اتصالات و بافرها.'
                    }
                    example="PostgreSQL 16.2 on x86_64-pc-linux-gnu"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400">{isEn ? 'Engine Version' : 'نسخه موتور'}</span>
                    <p className="font-mono font-bold text-sm text-blue-400">{overviewData.versionShort}</p>
                    <p className="text-[11px] text-slate-500 truncate" title={overviewData.version}>
                      {overviewData.version}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400">{isEn ? 'Uptime' : 'مدت زمان فعالیت'}</span>
                    <p className="font-mono font-bold text-sm text-emerald-400">{overviewData.uptimePretty}</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {isEn ? 'Since: ' : 'از: '}
                      {new Date(overviewData.startTime).toLocaleString()}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400">{isEn ? 'Connection Pool' : 'استخر اتصالات'}</span>
                    <p className="font-mono font-bold text-sm text-cyan-400">
                      {overviewData.connections.total} / {overviewData.maxConnections}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {overviewData.connections.usedPercentage}% {isEn ? 'capacity used' : 'ظرفیت مصرف‌شده'}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400">{isEn ? 'Data Directory' : 'مسیر ذخیره‌سازی داده'}</span>
                    <p className="font-mono font-bold text-xs text-slate-200 truncate" title={overviewData.dataDirectory}>
                      {overviewData.dataDirectory}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">wal_level: {overviewData.walLevel}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400">{isEn ? 'Memory (RAM)' : 'بافرهای حافظه'}</span>
                    <p className="font-mono font-bold text-xs text-purple-400">
                      shared: {overviewData.sharedBuffers}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">work_mem: {overviewData.workMem}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400">{isEn ? 'Cache Hit Ratio' : 'نرخ دسترسی به کش'}</span>
                    <p className="font-mono font-bold text-sm text-emerald-400">
                      {overviewData.telemetry.cacheHitRatio}%
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {overviewData.telemetry.totalCommits.toLocaleString()} commits
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW B: DATABASES FOLDER / CATALOG                       */}
            {/* ======================================================== */}
            {selectedNode.type === 'databases_folder' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <span>{isEn ? 'PostgreSQL Database Catalog' : 'کاتالوگ پایگاه‌های داده'}</span>
                  </h4>
                  <FieldInfoTooltip
                    title={isEn ? 'PostgreSQL Databases Catalog' : 'کاتالوگ دیتابیس‌های سرور'}
                    whatIsIt={
                      isEn
                        ? 'All user and template databases hosted in this PostgreSQL cluster.'
                        : 'فهرست تمامی دیتابیس‌های ایجاد شده در کلاستر همراه با حجم و مالکیت.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Select any database in the left tree to explore its schemas, tables, and objects.'
                        : 'با کلیک روی هر دیتابیس در درخت سمت چپ، اجزای داخلی آن بارگذاری می‌شود.'
                    }
                    example="postgres, template1, app_production"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <table className="w-full text-xs text-left">
                    <thead
                      className={`border-b text-[11px] font-semibold select-none ${
                        isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <tr>
                        <th className="py-2.5 px-3">{isEn ? 'Database Name' : 'نام دیتابیس'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Size' : 'حجم'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Encoding / Collation' : 'کدگذاری'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Connections' : 'اتصالات'}</th>
                        <th className="py-2.5 px-3 text-right">{isEn ? 'Action' : 'عملیات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {databases.map((db) => (
                        <tr
                          key={db.name}
                          onClick={() => {
                            setSelectedNode({
                              type: 'database',
                              id: `db:${db.name}`,
                              name: db.name,
                              dbName: db.name,
                              data: db,
                            });
                            toggleNode(`db:${db.name}`);
                            if (!databaseTrees[db.name]) {
                              handleLoadDatabaseTree(db.name);
                            }
                          }}
                          className={`cursor-pointer transition ${
                            isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                            <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span>{db.name}</span>
                            {db.isTemplate && (
                              <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-400 font-sans">
                                template
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-400">{db.owner}</td>
                          <td className="py-2 px-3 text-emerald-400 font-bold">{db.sizePretty}</td>
                          <td className="py-2 px-3 text-slate-400 text-[11px]">
                            {db.encoding} • {db.collation || 'default'}
                          </td>
                          <td className="py-2 px-3 text-cyan-400">{db.activeConnections}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition text-[11px] font-sans"
                            >
                              {isEn ? 'Explore' : 'کاوش'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW C: SINGLE DATABASE OBJECT INSPECTOR                 */}
            {/* ======================================================== */}
            {selectedNode.type === 'database' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-cyan-400" />
                    <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.dbName}</h4>
                    {selectedNode.data?.isTemplate && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 font-bold">
                        Template DB
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => selectedNode.dbName && handleLoadDatabaseTree(selectedNode.dbName, true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Reload Database Objects' : 'بروزرسانی ساختار دیتابیس'}</span>
                  </button>
                </div>

                {/* Database Metrics Grid */}
                {selectedNode.data && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div
                      className={`p-3 rounded-xl border space-y-1 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Disk Size' : 'حجم فیزیکی'}</span>
                      <p className="font-bold text-sm text-emerald-400">{selectedNode.data.sizePretty}</p>
                    </div>

                    <div
                      className={`p-3 rounded-xl border space-y-1 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Owner' : 'مالک'}</span>
                      <p className="font-bold text-sm text-cyan-400">{selectedNode.data.owner}</p>
                    </div>

                    <div
                      className={`p-3 rounded-xl border space-y-1 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Encoding' : 'کدگذاری'}</span>
                      <p className="font-bold text-sm text-slate-200">{selectedNode.data.encoding}</p>
                    </div>

                    <div
                      className={`p-3 rounded-xl border space-y-1 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Connections' : 'اتصالات فعال'}</span>
                      <p className="font-bold text-sm text-blue-400">{selectedNode.data.activeConnections}</p>
                    </div>
                  </div>
                )}

                {/* Database Tree Summary if Loaded */}
                {selectedNode.dbName && databaseTrees[selectedNode.dbName] ? (
                  <div className="space-y-4">
                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-sans">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>{isEn ? 'Discovered Object Counts' : 'شمارش اجزای کشف‌شده'}</span>
                    </h5>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-center font-mono">
                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Schemas' : 'اسکیما'}</span>
                        <p className="font-bold text-base text-purple-400">
                          {databaseTrees[selectedNode.dbName].schemas.length}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Tables' : 'جداول'}</span>
                        <p className="font-bold text-base text-emerald-400">
                          {databaseTrees[selectedNode.dbName].totalTables}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Views' : 'نماها'}</span>
                        <p className="font-bold text-base text-sky-400">
                          {databaseTrees[selectedNode.dbName].totalViews}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'MatViews' : 'نماهای مادی'}</span>
                        <p className="font-bold text-base text-amber-400">
                          {databaseTrees[selectedNode.dbName].totalMaterializedViews}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Routines' : 'توابع/رویه‌ها'}</span>
                        <p className="font-bold text-base text-violet-400">
                          {databaseTrees[selectedNode.dbName].totalFunctions +
                            databaseTrees[selectedNode.dbName].totalProcedures}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Extensions' : 'افزونه‌ها'}</span>
                        <p className="font-bold text-base text-rose-400">
                          {databaseTrees[selectedNode.dbName].totalExtensions}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center space-y-3">
                    <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
                    <p className="text-xs text-slate-400">
                      {isEn
                        ? 'Lazy-loading schemas and objects for this database...'
                        : 'در حال بارگذاری سلسله‌مراتب اجزای این دیتابیس...'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW D: TABLES FOLDER / SINGLE SCHEMA TABLES             */}
            {/* ======================================================== */}
            {(selectedNode.type === 'tables_folder' || selectedNode.type === 'schema') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <TableIcon className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-bold text-sm">
                      {isEn ? 'Tables in Schema' : 'جداول موجود در اسکیما'}{' '}
                      <span className="text-emerald-400 font-mono">"{selectedNode.schemaName || 'public'}"</span>
                    </h4>
                  </div>
                  <FieldInfoTooltip
                    title={isEn ? 'Schema Table Objects' : 'جداول فیزیکی اسکیما'}
                    whatIsIt={
                      isEn
                        ? 'Relational tables registered in this schema with row estimates and physical disk consumption.'
                        : 'فهرست جداول رابطه ای ثبت شده در این اسکیما با تخمین رکوردها و فضای دیسک.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Phase 3 exposes database tables; subsequent phases enable full structure and row inspection.'
                        : 'فاز ۳ جداول را کاوش می‌کند و در فازهای بعدی امکان مشاهده ساختار فیلدها و داده‌ها افزوده می‌شود.'
                    }
                    example="users, orders, products"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <table className="w-full text-xs text-left">
                    <thead
                      className={`border-b text-[11px] font-semibold select-none ${
                        isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <tr>
                        <th className="py-2.5 px-3">{isEn ? 'Table Name' : 'نام جدول'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Estimated Rows' : 'تخمین رکوردها'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Disk Size' : 'فضای دیسک'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Attributes' : 'ویژگی‌ها'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {((selectedNode.data?.tables || selectedNode.data) as PostgresTableItem[] || []).map(
                        (table: PostgresTableItem) => (
                          <tr
                            key={table.name}
                            onClick={() => {
                              setSelectedNode({
                                type: 'table',
                                id: `table:${selectedNode.dbName}:${table.schema}:${table.name}`,
                                name: table.name,
                                dbName: selectedNode.dbName,
                                schemaName: table.schema,
                                data: table,
                              });
                            }}
                            className={`cursor-pointer transition ${
                              isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                              <TableIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>{table.name}</span>
                            </td>
                            <td className="py-2 px-3 text-slate-400">{table.owner}</td>
                            <td className="py-2 px-3 text-cyan-400 tabular-nums">
                              {table.estimatedRows.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-emerald-400 font-bold">{table.sizePretty}</td>
                            <td className="py-2 px-3 space-x-1">
                              {table.hasIndexes && (
                                <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-400">
                                  INDEX
                                </span>
                              )}
                              {table.hasTriggers && (
                                <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-400">
                                  TRIGGER
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW E: SINGLE TABLE OBJECT INSPECTOR                     */}
            {/* ======================================================== */}
            {selectedNode.type === 'table' && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <TableIcon className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Schema: ' : 'اسکیما: '}
                        <span className="font-mono text-cyan-400">{selectedNode.schemaName}</span>
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-1 rounded-md text-xs font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {selectedNode.data.persistence || 'permanent'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Estimated Rows' : 'تخمین سطرها'}</span>
                    <p className="font-bold text-sm text-cyan-400 tabular-nums">
                      {selectedNode.data.estimatedRows?.toLocaleString?.() || 0}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Total Size' : 'فضای دیسک'}</span>
                    <p className="font-bold text-sm text-emerald-400">{selectedNode.data.sizePretty}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Owner' : 'مالک'}</span>
                    <p className="font-bold text-sm text-slate-200">{selectedNode.data.owner}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Indexes & Triggers' : 'ایندکس‌ها'}</span>
                    <p className="font-bold text-xs text-blue-400">
                      {selectedNode.data.hasIndexes ? 'Indexed' : 'No Index'}
                    </p>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-sans ${
                    isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>
                      {isEn
                        ? 'Table structure inspection and live data browsing'
                        : 'کاوش ساختار ستون‌ها و مرور سطرهای جدول'}
                    </span>
                  </p>
                  <p>
                    {isEn
                      ? 'Detailed column metadata, data types, constraints and safe paginated row browsing will be unlocked in Phase 4, Phase 5 and Phase 6 of the PostgreSQL roadmap.'
                      : 'مشاهده ستون‌ها، تایپ داده‌ها، کلیدهای اصلی و خارجی و صفحه‌بندی امن داده‌ها در فازهای ۵ و ۶ نقشه راه پیاده‌سازی خواهد شد.'}
                  </p>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW F: VIEWS / ROUTINES / SEQUENCES / EXTENSIONS        */}
            {/* ======================================================== */}
            {(selectedNode.type === 'views_folder' ||
              selectedNode.type === 'matviews_folder' ||
              selectedNode.type === 'functions_folder' ||
              selectedNode.type === 'procedures_folder' ||
              selectedNode.type === 'sequences_folder' ||
              selectedNode.type === 'extensions_folder') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-bold text-sm">{selectedNode.name}</h4>
                  <span className="text-xs font-mono text-slate-400">
                    {Array.isArray(selectedNode.data) ? selectedNode.data.length : 0} items
                  </span>
                </div>

                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <table className="w-full text-xs text-left">
                    <thead
                      className={`border-b text-[11px] font-semibold select-none ${
                        isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <tr>
                        <th className="py-2.5 px-3">{isEn ? 'Name' : 'نام شی'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Type / Schema' : 'نوع / اسکیما'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Details' : 'جزئیات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {(selectedNode.data || []).map((item: any, idx: number) => (
                        <tr key={idx} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'}>
                          <td className="py-2 px-3 font-bold text-slate-200">{item.name}</td>
                          <td className="py-2 px-3 text-slate-400">
                            {item.type || item.schema || (item.isMaterialized ? 'MatView' : 'View')}
                          </td>
                          <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-xs">
                            {item.returnType ? `${item.returnType} (${item.argumentTypes || ''})` : item.version || item.owner || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW G: ROLES & USERS                                    */}
            {/* ======================================================== */}
            {(selectedNode.type === 'roles_folder' || selectedNode.type === 'role') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-400" />
                    <h4 className="font-bold text-sm">
                      {isEn ? 'PostgreSQL Roles & Authentication Catalog' : 'کاتالوگ نقش‌ها و کاربران PostgreSQL'}
                    </h4>
                  </div>
                  <FieldInfoTooltip
                    title={isEn ? 'PostgreSQL Roles (pg_roles)' : 'نقش‌ها و سطح اختیارات کاربران'}
                    whatIsIt={
                      isEn
                        ? 'All login users and group roles configured on the PostgreSQL cluster.'
                        : 'فهرست تمامی کاربران با قابلیت لاگین و رول‌های سیستمی کلاستر.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Essential for verifying superuser privileges, connection limits, and access security.'
                        : 'حیاتی جهت پایش امنیت، محدودیت تعداد اتصالات و شناسایی کاربران دارای دسترسی Superuser.'
                    }
                    example="postgres (superuser), app_user (login, connection limit 50)"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <table className="w-full text-xs text-left">
                    <thead
                      className={`border-b text-[11px] font-semibold select-none ${
                        isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <tr>
                        <th className="py-2.5 px-3">{isEn ? 'Role Name' : 'نام نقش'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Superuser' : 'سوپریوزر'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Login' : 'امکان ورود'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Create DB' : 'ایجاد دیتابیس'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Replication' : 'رپلیکیشن'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Conn Limit' : 'سقف اتصال'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {rolesList.map((role) => (
                        <tr
                          key={role.rolname}
                          className={
                            selectedNode.id === `role:${role.rolname}`
                              ? 'bg-blue-600/10 font-bold'
                              : isLightMode
                              ? 'hover:bg-slate-50'
                              : 'hover:bg-slate-800/40'
                          }
                        >
                          <td className="py-2 px-3 flex items-center gap-2 text-slate-200">
                            {role.isSuperuser ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            ) : (
                              <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                            <span>{role.rolname}</span>
                          </td>
                          <td className="py-2 px-3">
                            {role.isSuperuser ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 font-bold">
                                YES
                              </span>
                            ) : (
                              <span className="text-slate-500">NO</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {role.canLogin ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 font-bold">
                                YES
                              </span>
                            ) : (
                              <span className="text-slate-500">NO</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-400">{role.createDb ? 'YES' : 'NO'}</td>
                          <td className="py-2 px-3 text-slate-400">{role.replication ? 'YES' : 'NO'}</td>
                          <td className="py-2 px-3 text-cyan-400">
                            {role.connectionLimit === -1 ? 'Unlimited' : role.connectionLimit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
