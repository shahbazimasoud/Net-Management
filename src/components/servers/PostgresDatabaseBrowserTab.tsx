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
  Tag,
  ListFilter,
  FileCode,
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
  PostgresTypeItem,
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
  | 'types_folder'
  | 'type'
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

  // Active sub-tab inside Schema & Object Explorer
  const [schemaTab, setSchemaTab] = useState<'all' | 'tables' | 'views' | 'routines' | 'sequences' | 'types'>('all');

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
                  className="text-slate-400 hover:text-slate-200 text-xs px-1 cursor-pointer"
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
                                                      setSchemaTab('all');
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

                                                      {/* Custom Types & Enums */}
                                                      {(schema.types || []).length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'types_folder',
                                                              id: `types:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Types & Enums' : 'انواع داده و شمارشی‌ها',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.types,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `types:${db.name}:${schema.name}`
                                                              ? 'bg-pink-500/20 text-pink-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          <Sliders className="w-3 h-3 text-pink-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'Types' : 'انواع داده'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-pink-400 font-mono">
                                                            {schema.types?.length || 0}
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
                    : selectedNode.type === 'view' || selectedNode.type === 'views_folder' || selectedNode.type === 'matview' || selectedNode.type === 'matviews_folder'
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    : selectedNode.type === 'database' || selectedNode.type === 'databases_folder'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : selectedNode.type === 'role' || selectedNode.type === 'roles_folder'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : selectedNode.type === 'function' || selectedNode.type === 'functions_folder' || selectedNode.type === 'procedure' || selectedNode.type === 'procedures_folder'
                    ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                    : selectedNode.type === 'type' || selectedNode.type === 'types_folder'
                    ? 'bg-pink-500/15 text-pink-400 border border-pink-500/30'
                    : selectedNode.type === 'sequence' || selectedNode.type === 'sequences_folder'
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : selectedNode.type === 'schema' || selectedNode.type === 'schemas_folder'
                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
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
                        ? 'Crucial for understanding overall host database engine capabilities and cluster limits.'
                        : 'حیاتی جهت آگاهی از ظرفیت‌های پردازشی، محدودیت‌های کلاستر و سلامت سرویس دهنده.'
                    }
                    example="PostgreSQL 16.2 on x86_64-pc-linux-gnu"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Version' : 'نسخه موتور'}</span>
                    <p className="font-bold text-sm text-blue-400">{overviewData.versionShort}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Server Uptime' : 'مدت زمان کارکرد'}</span>
                    <p className="font-bold text-sm text-emerald-400">{overviewData.uptimePretty}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Connections' : 'اتصالات همزمان'}</span>
                    <p className="font-bold text-sm text-cyan-400">
                      {overviewData.connections.total} / {overviewData.maxConnections}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Cache Hit' : 'نرخ اصابت حافظه'}</span>
                    <p className="font-bold text-sm text-purple-400">
                      {overviewData.telemetry?.cacheHitRatio !== undefined ? `${overviewData.telemetry.cacheHitRatio}%` : '100%'}
                    </p>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <p className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'Cluster Environment Telemetry' : 'مشخصات محیطی کلاستر'}
                  </p>
                  <p>
                    <span className="text-slate-500">Data Directory: </span>
                    {overviewData.dataDirectory}
                  </p>
                  <p>
                    <span className="text-slate-500">Shared Buffers: </span>
                    {overviewData.sharedBuffers}
                  </p>
                  <p>
                    <span className="text-slate-500">WAL Level: </span>
                    {overviewData.walLevel}
                  </p>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW B: DATABASES FOLDER (CATALOG TABLE)                 */}
            {/* ======================================================== */}
            {selectedNode.type === 'databases_folder' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <span>{isEn ? 'PostgreSQL Database Catalog' : 'کاتالوگ پایگاه‌های داده کلاستر'}</span>
                  </h4>
                  <FieldInfoTooltip
                    title={isEn ? 'Database Catalog' : 'کاتالوگ دیتابیس‌ها'}
                    whatIsIt={
                      isEn
                        ? 'All user and template databases hosted in this cluster.'
                        : 'فهرست تمامی دیتابیس‌های کاربری و قالب موجود روی سرور.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Selecting a database lazy-loads its structural objects, schemas, tables, and routines.'
                        : 'با کلیک روی هر دیتابیس، ساختار درختی و اجزای داخلی آن بارگذاری می‌شود.'
                    }
                    example="production_db, staging_db, postgres"
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
                        <th className="py-2.5 px-3">{isEn ? 'Size' : 'حجم فیزیکی'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Encoding' : 'کدگذاری'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Connections' : 'اتصالات'}</th>
                        <th className="py-2.5 px-3 text-right">{isEn ? 'Action' : 'عملیات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {databases.map((db) => (
                        <tr
                          key={db.oid || db.name}
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
                              className="px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition text-[11px] font-sans cursor-pointer"
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
                <div className="flex items-center justify-between gap-3 flex-wrap">
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

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center font-mono">
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
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Types' : 'انواع داده'}</span>
                        <p className="font-bold text-base text-pink-400">
                          {databaseTrees[selectedNode.dbName].totalTypes ?? 0}
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
            {/* VIEW D: PHASE 4 — SCHEMA & OBJECT EXPLORER               */}
            {/* ======================================================== */}
            {(selectedNode.type === 'schema' ||
              selectedNode.type === 'schemas_folder' ||
              selectedNode.type === 'tables_folder' ||
              selectedNode.type === 'views_folder' ||
              selectedNode.type === 'matviews_folder' ||
              selectedNode.type === 'functions_folder' ||
              selectedNode.type === 'procedures_folder' ||
              selectedNode.type === 'sequences_folder' ||
              selectedNode.type === 'types_folder') && (
              <div className="space-y-4">
                {/* Schema Header with Info and Search */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-purple-400" />
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">
                        {selectedNode.type === 'schema'
                          ? selectedNode.schemaName || selectedNode.name
                          : selectedNode.type === 'schemas_folder'
                          ? isEn ? 'All Schemas' : 'تمام اسکیماها'
                          : selectedNode.name}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Database: ' : 'پایگاه داده: '}
                        <span className="font-mono text-cyan-400">{selectedNode.dbName}</span>
                        {selectedNode.data?.owner && (
                          <span className="ml-2 text-slate-500">
                            • {isEn ? 'Owner: ' : 'مالک: '}
                            <span className="text-slate-300 font-mono">{selectedNode.data.owner}</span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Instant Filter */}
                  <div
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs w-full sm:w-64 ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={detailFilter}
                      onChange={(e) => setDetailFilter(e.target.value)}
                      placeholder={isEn ? 'Filter schema objects...' : 'فیلتر اجزای اسکیما...'}
                      className="w-full bg-transparent focus:outline-hidden text-xs"
                    />
                    {detailFilter && (
                      <button
                        type="button"
                        onClick={() => setDetailFilter('')}
                        className="text-slate-400 hover:text-white text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Schema Metadata & Object Counters */}
                {selectedNode.type === 'schema' && selectedNode.data && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div
                        className={`p-3 rounded-xl border space-y-1 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Physical Size' : 'فضای فیزیکی اسکیما'}</span>
                        <p className="font-bold text-sm text-purple-400">
                          {(selectedNode.data as PostgresSchemaObjects).sizePretty || '0 bytes'}
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-xl border space-y-1 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Tables & Views' : 'جداول و نماها'}</span>
                        <p className="font-bold text-sm text-emerald-400">
                          {(selectedNode.data as PostgresSchemaObjects).tables?.length || 0} /{' '}
                          {((selectedNode.data as PostgresSchemaObjects).views?.length || 0) +
                            ((selectedNode.data as PostgresSchemaObjects).materializedViews?.length || 0)}
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-xl border space-y-1 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Routines (Func/Proc)' : 'توابع و رویه‌ها'}</span>
                        <p className="font-bold text-sm text-violet-400">
                          {((selectedNode.data as PostgresSchemaObjects).functions?.length || 0) +
                            ((selectedNode.data as PostgresSchemaObjects).procedures?.length || 0)}
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-xl border space-y-1 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Sequences & Types' : 'دنباله‌ها و انواع'}</span>
                        <p className="font-bold text-sm text-pink-400">
                          {(selectedNode.data as PostgresSchemaObjects).sequences?.length || 0} /{' '}
                          {(selectedNode.data as PostgresSchemaObjects).types?.length || 0}
                        </p>
                      </div>
                    </div>

                    {(selectedNode.data as PostgresSchemaObjects).description && (
                      <p className="text-xs text-slate-400 italic bg-purple-500/5 p-2.5 rounded-lg border border-purple-500/10 font-sans">
                        <span className="font-semibold text-purple-300">{isEn ? 'Comment: ' : 'توضیحات: '}</span>
                        {(selectedNode.data as PostgresSchemaObjects).description}
                      </p>
                    )}
                  </div>
                )}

                {/* Sub-Tabs for Schema Objects */}
                {selectedNode.type === 'schema' && selectedNode.data && (
                  <div className="flex items-center gap-1.5 border-b border-slate-700/30 overflow-x-auto no-scrollbar pb-2">
                    <button
                      type="button"
                      onClick={() => setSchemaTab('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'all'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>{isEn ? 'All Objects' : 'کل اجزا'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('tables')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'tables'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Tables' : 'جداول'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {(selectedNode.data as PostgresSchemaObjects).tables?.length || 0}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('views')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'views'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Views' : 'نماها'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {((selectedNode.data as PostgresSchemaObjects).views?.length || 0) +
                          ((selectedNode.data as PostgresSchemaObjects).materializedViews?.length || 0)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('routines')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'routines'
                          ? 'bg-violet-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Routines' : 'توابع و رویه‌ها'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {((selectedNode.data as PostgresSchemaObjects).functions?.length || 0) +
                          ((selectedNode.data as PostgresSchemaObjects).procedures?.length || 0)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('sequences')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'sequences'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Hash className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Sequences' : 'دنباله‌ها'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {(selectedNode.data as PostgresSchemaObjects).sequences?.length || 0}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('types')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'types'
                          ? 'bg-pink-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Types & Enums' : 'انواع داده'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {(selectedNode.data as PostgresSchemaObjects).types?.length || 0}
                      </span>
                    </button>
                  </div>
                )}

                {/* TAB CONTENT: TABLES */}
                {(schemaTab === 'tables' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <TableIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{isEn ? 'Tables' : 'جداول'}</span>
                      </h5>
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
                            <th className="py-2.5 px-3">{isEn ? 'Estimated Rows' : 'تخمین سطرها'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Disk Size' : 'فضای دیسک'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Attributes' : 'ویژگی‌ها'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {(((selectedNode.data as PostgresSchemaObjects)?.tables || [])
                            .filter((t) => !detailFilter || t.name.toLowerCase().includes(detailFilter.toLowerCase()))
                          ).map((table: PostgresTableItem) => (
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
                                  <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-400 font-sans">
                                    INDEX
                                  </span>
                                )}
                                {table.hasTriggers && (
                                  <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-400 font-sans">
                                    TRIGGER
                                  </span>
                                )}
                                <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 font-sans">
                                  {table.persistence}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: VIEWS & MATVIEWS */}
                {(schemaTab === 'views' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                        <span>{isEn ? 'Views & Materialized Views' : 'نماها و نماهای مادی'}</span>
                      </h5>
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
                            <th className="py-2.5 px-3">{isEn ? 'View Name' : 'نام نما'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Kind' : 'نوع نما'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Disk Size' : 'فضای دیسک'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {[
                            ...((selectedNode.data as PostgresSchemaObjects)?.views || []),
                            ...((selectedNode.data as PostgresSchemaObjects)?.materializedViews || []),
                          ]
                            .filter((v) => !detailFilter || v.name.toLowerCase().includes(detailFilter.toLowerCase()))
                            .map((view) => (
                              <tr
                                key={view.name}
                                onClick={() => {
                                  setSelectedNode({
                                    type: view.isMaterialized ? 'matview' : 'view',
                                    id: `view:${selectedNode.dbName}:${view.schema}:${view.name}`,
                                    name: view.name,
                                    dbName: selectedNode.dbName,
                                    schemaName: view.schema,
                                    data: view,
                                  });
                                }}
                                className={`cursor-pointer transition ${
                                  isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                                }`}
                              >
                                <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                                  {view.isMaterialized ? (
                                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                  )}
                                  <span>{view.name}</span>
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                                      view.isMaterialized
                                        ? 'bg-amber-500/15 text-amber-400'
                                        : 'bg-sky-500/15 text-sky-400'
                                    }`}
                                  >
                                    {view.isMaterialized ? 'MATERIALIZED VIEW' : 'VIEW'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-400">{view.owner}</td>
                                <td className="py-2 px-3 text-slate-300">{view.sizePretty || 'N/A'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: ROUTINES (FUNCTIONS & PROCEDURES) */}
                {(schemaTab === 'routines' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Code className="w-3.5 h-3.5 text-violet-400" />
                        <span>{isEn ? 'Functions & Stored Procedures' : 'توابع و رویه‌های ذخیره‌شده'}</span>
                      </h5>
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
                            <th className="py-2.5 px-3">{isEn ? 'Routine Name' : 'نام تابع / رویه'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Kind' : 'نوع'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Return Type' : 'نوع بازگشتی'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Arguments' : 'پارامترهای ورودی'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Language' : 'زبان'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {[
                            ...((selectedNode.data as PostgresSchemaObjects)?.functions || []),
                            ...((selectedNode.data as PostgresSchemaObjects)?.procedures || []),
                          ]
                            .filter((r) => !detailFilter || r.name.toLowerCase().includes(detailFilter.toLowerCase()))
                            .map((routine, idx) => (
                              <tr
                                key={`${routine.name}-${idx}`}
                                onClick={() => {
                                  setSelectedNode({
                                    type: routine.type === 'procedure' ? 'procedure' : 'function',
                                    id: `routine:${selectedNode.dbName}:${routine.schema}:${routine.name}:${idx}`,
                                    name: routine.name,
                                    dbName: selectedNode.dbName,
                                    schemaName: routine.schema,
                                    data: routine,
                                  });
                                }}
                                className={`cursor-pointer transition ${
                                  isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                                }`}
                              >
                                <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                                  {routine.type === 'procedure' ? (
                                    <Wrench className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                  ) : (
                                    <Code className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                  )}
                                  <span>{routine.name}</span>
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold uppercase ${
                                      routine.type === 'procedure'
                                        ? 'bg-indigo-500/15 text-indigo-400'
                                        : 'bg-violet-500/15 text-violet-400'
                                    }`}
                                  >
                                    {routine.type}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-cyan-400 truncate max-w-xs">{routine.returnType}</td>
                                <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-sm">
                                  {routine.argumentTypes || <span className="text-slate-600 font-sans italic">none</span>}
                                </td>
                                <td className="py-2 px-3 text-slate-300 font-sans uppercase text-[10px]">
                                  {routine.language}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: SEQUENCES */}
                {(schemaTab === 'sequences' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-rose-400" />
                        <span>{isEn ? 'Sequences' : 'دنباله‌ها'}</span>
                      </h5>
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
                            <th className="py-2.5 px-3">{isEn ? 'Sequence Name' : 'نام دنباله'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Schema' : 'اسکیما'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {(((selectedNode.data as PostgresSchemaObjects)?.sequences || [])
                            .filter((s) => !detailFilter || s.name.toLowerCase().includes(detailFilter.toLowerCase()))
                          ).map((seq) => (
                            <tr
                              key={seq.name}
                              onClick={() => {
                                setSelectedNode({
                                  type: 'sequence',
                                  id: `seq:${selectedNode.dbName}:${seq.schema}:${seq.name}`,
                                  name: seq.name,
                                  dbName: selectedNode.dbName,
                                  schemaName: seq.schema,
                                  data: seq,
                                });
                              }}
                              className={`cursor-pointer transition ${
                                isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                                <Hash className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                <span>{seq.name}</span>
                              </td>
                              <td className="py-2 px-3 text-slate-400">{seq.schema}</td>
                              <td className="py-2 px-3 text-slate-300">{seq.owner}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: TYPES & ENUMS */}
                {(schemaTab === 'types' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-pink-400" />
                        <span>{isEn ? 'Custom Types, Enums & Domains' : 'انواع داده سفارشی، شمارشی‌ها و دامنه‌ها'}</span>
                      </h5>
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
                            <th className="py-2.5 px-3">{isEn ? 'Type Name' : 'نام نوع داده'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Kind' : 'طبقه‌بندی'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Enum Labels / Base Type' : 'مقادیر یا نوع پایه'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {(((selectedNode.data as PostgresSchemaObjects)?.types || [])
                            .filter((t) => !detailFilter || t.name.toLowerCase().includes(detailFilter.toLowerCase()))
                          ).map((item) => (
                            <tr
                              key={item.name}
                              onClick={() => {
                                setSelectedNode({
                                  type: 'type',
                                  id: `type:${selectedNode.dbName}:${item.schema}:${item.name}`,
                                  name: item.name,
                                  dbName: selectedNode.dbName,
                                  schemaName: item.schema,
                                  data: item,
                                });
                              }}
                              className={`cursor-pointer transition ${
                                isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                                <Sliders className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                                <span>{item.name}</span>
                              </td>
                              <td className="py-2 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-bold uppercase bg-pink-500/15 text-pink-400">
                                  {item.kind}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-300 text-[11px] truncate max-w-md">
                                {item.enumLabels && item.enumLabels.length > 0 ? (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {item.enumLabels.slice(0, 4).map((lbl, li) => (
                                      <span key={li} className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px]">
                                        {lbl}
                                      </span>
                                    ))}
                                    {item.enumLabels.length > 4 && (
                                      <span className="text-[10px] text-slate-500">+{item.enumLabels.length - 4} more</span>
                                    )}
                                  </div>
                                ) : (
                                  item.baseType || item.description || <span className="text-slate-600 font-sans italic">custom</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-400">{item.owner}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW E: SINGLE TABLE OBJECT INSPECTOR                     */}
            {/* ======================================================== */}
            {selectedNode.type === 'table' && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
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

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-1 rounded-md text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {selectedNode.data.persistence || 'permanent'}
                    </span>
                    {selectedNode.data.hasPrimaryKey && (
                      <span className="px-2 py-1 rounded-md text-xs font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                        PRIMARY KEY
                      </span>
                    )}
                    {selectedNode.data.isPartitioned && (
                      <span className="px-2 py-1 rounded-md text-xs font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        PARTITIONED
                      </span>
                    )}
                  </div>
                </div>

                {/* Primary Metrics */}
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
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Columns Count' : 'تعداد ستون‌ها'}</span>
                    <p className="font-bold text-sm text-emerald-400">
                      {selectedNode.data.columnCount !== undefined ? selectedNode.data.columnCount : 'N/A'}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Total Disk Size' : 'کل فضای دیسک'}</span>
                    <p className="font-bold text-sm text-purple-400">{selectedNode.data.sizePretty}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Table Owner' : 'مالک جدول'}</span>
                    <p className="font-bold text-sm text-slate-200 truncate">{selectedNode.data.owner}</p>
                  </div>
                </div>

                {/* Storage Size Breakdown */}
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-sans">
                    <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                    <span>{isEn ? 'Table Physical Storage Breakdown' : 'تفکیک فضای ذخیره‌سازی فیزیکی جدول'}</span>
                  </h5>

                  <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-sans">{isEn ? 'Table Heap Data' : 'داده‌های اصلی'}</span>
                      <p className="font-bold text-slate-200">{selectedNode.data.tableSizePretty || '0 bytes'}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-sans">{isEn ? 'Indexes Total' : 'فضای ایندکس‌ها'}</span>
                      <p className="font-bold text-blue-400">{selectedNode.data.indexSizePretty || '0 bytes'}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-sans">{isEn ? 'TOAST Out-of-line' : 'فضای TOAST'}</span>
                      <p className="font-bold text-amber-400">{selectedNode.data.toastSizePretty || '0 bytes'}</p>
                    </div>
                  </div>
                </div>

                {/* Fast SQL queries */}
                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'SQL Data Query Preview' : 'پیش‌نمایش دستور کوئری داده'}
                  </span>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                    <code className="text-cyan-300">
                      SELECT * FROM "{selectedNode.schemaName}"."{selectedNode.name}" LIMIT 50;
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`SELECT * FROM "${selectedNode.schemaName}"."${selectedNode.name}" LIMIT 50;`)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      title={isEn ? 'Copy SQL' : 'کپی دستور SQL'}
                    >
                      {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW F: SINGLE TYPE / ENUM OBJECT INSPECTOR              */}
            {/* ======================================================== */}
            {selectedNode.type === 'type' && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-pink-400" />
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Schema: ' : 'اسکیما: '}
                        <span className="font-mono text-cyan-400">{selectedNode.schemaName}</span>
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-1 rounded-md text-xs font-mono font-bold uppercase bg-pink-500/15 text-pink-400 border border-pink-500/30">
                    {selectedNode.data.kind}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Type Category' : 'دسته‌بندی'}</span>
                    <p className="font-bold text-sm text-pink-400 uppercase">{selectedNode.data.kind}</p>
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
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Base Type' : 'نوع پایه'}</span>
                    <p className="font-bold text-sm text-slate-200">{selectedNode.data.baseType || 'N/A'}</p>
                  </div>
                </div>

                {/* Enum Labels section if kind === 'enum' */}
                {selectedNode.data.enumLabels && selectedNode.data.enumLabels.length > 0 && (
                  <div
                    className={`p-4 rounded-xl border space-y-3 ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-sans">
                      <Tag className="w-3.5 h-3.5 text-pink-400" />
                      <span>{isEn ? 'Enum Labels / Permitted Values' : 'مقادیر مجاز شمارشی (Enum Labels)'}</span>
                    </h5>

                    <div className="flex items-center gap-2 flex-wrap font-mono">
                      {selectedNode.data.enumLabels.map((lbl: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-300 text-xs font-bold"
                        >
                          '{lbl}'
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick SQL usage snippet */}
                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'SQL Usage Example' : 'نمونه استفاده در SQL'}
                  </span>
                  <div className="p-2 rounded bg-black/40 text-cyan-300 select-all">
                    SELECT '
                    {selectedNode.data.enumLabels?.[0] || 'value'}'::{selectedNode.schemaName}.{selectedNode.name};
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW G: SINGLE ROUTINE (FUNCTION / PROCEDURE) INSPECTOR  */}
            {/* ======================================================== */}
            {(selectedNode.type === 'function' || selectedNode.type === 'procedure') && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {selectedNode.type === 'procedure' ? (
                      <Wrench className="w-5 h-5 text-indigo-400" />
                    ) : (
                      <Code className="w-5 h-5 text-violet-400" />
                    )}
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Schema: ' : 'اسکیما: '}
                        <span className="font-mono text-cyan-400">{selectedNode.schemaName}</span>
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-1 rounded-md text-xs font-mono font-bold uppercase bg-violet-500/15 text-violet-400 border border-violet-500/30">
                    {selectedNode.data.type || selectedNode.type}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Return Type' : 'نوع خروجی'}</span>
                    <p className="font-bold text-sm text-cyan-400 truncate">{selectedNode.data.returnType}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Language' : 'زبان'}</span>
                    <p className="font-bold text-sm text-violet-400 uppercase">{selectedNode.data.language}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Volatility' : 'فراریت'}</span>
                    <p className="font-bold text-sm text-amber-400">{selectedNode.data.volatility || 'VOLATILE'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Security' : 'امنیت اجرا'}</span>
                    <p className="font-bold text-sm text-emerald-400">
                      {selectedNode.data.isSecurityDefiner ? 'DEFINER' : 'INVOKER'}
                    </p>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'Argument Signature' : 'امضای ورودی'}
                  </span>
                  <p className="text-cyan-300">
                    {selectedNode.data.argumentTypes || <span className="text-slate-500 italic">No arguments</span>}
                  </p>
                </div>

                {/* Routine Source Code if available */}
                {selectedNode.data.sourceCode && (
                  <div
                    className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-sans font-semibold">
                        {isEn ? 'Routine Body / Source Code' : 'بدنه و سورس‌کد تابع در سرور'}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedNode.data.sourceCode)}
                        className="px-2 py-0.5 rounded text-[11px] font-sans flex items-center gap-1 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                      >
                        {copiedText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedText ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy Source' : 'کپی کد')}</span>
                      </button>
                    </div>

                    <pre className="p-3 rounded-lg bg-black/60 border border-slate-800/80 text-cyan-200 overflow-x-auto text-[11px] leading-relaxed max-h-60 select-all font-mono">
                      {selectedNode.data.sourceCode}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW H: SINGLE VIEW / MATVIEW INSPECTOR                  */}
            {/* ======================================================== */}
            {(selectedNode.type === 'view' || selectedNode.type === 'matview') && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {selectedNode.data.isMaterialized ? (
                      <Zap className="w-5 h-5 text-amber-400" />
                    ) : (
                      <Eye className="w-5 h-5 text-sky-400" />
                    )}
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Schema: ' : 'اسکیما: '}
                        <span className="font-mono text-cyan-400">{selectedNode.schemaName}</span>
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-1 rounded-md text-xs font-mono font-bold uppercase ${
                      selectedNode.data.isMaterialized
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    }`}
                  >
                    {selectedNode.data.isMaterialized ? 'Materialized View' : 'Standard View'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Disk Size' : 'فضای دیسک'}</span>
                    <p className="font-bold text-sm text-emerald-400">{selectedNode.data.sizePretty || '0 bytes'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Columns' : 'ستون‌ها'}</span>
                    <p className="font-bold text-sm text-cyan-400">
                      {selectedNode.data.columnCount !== undefined ? selectedNode.data.columnCount : 'N/A'}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Owner' : 'مالک'}</span>
                    <p className="font-bold text-sm text-slate-200 truncate">{selectedNode.data.owner}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Type' : 'نوع'}</span>
                    <p className="font-bold text-sm text-purple-400">
                      {selectedNode.data.isMaterialized ? 'Materialized' : 'Standard'}
                    </p>
                  </div>
                </div>

                {/* View SQL Definition */}
                {selectedNode.data.definition && (
                  <div
                    className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-sans font-semibold">
                        {isEn ? 'View SQL Query Definition' : 'تعریف کوئری SQL نما'}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedNode.data.definition)}
                        className="px-2 py-0.5 rounded text-[11px] font-sans flex items-center gap-1 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                      >
                        {copiedText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedText ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy Query' : 'کپی کوئری')}</span>
                      </button>
                    </div>

                    <pre className="p-3 rounded-lg bg-black/60 border border-slate-800/80 text-cyan-200 overflow-x-auto text-[11px] leading-relaxed max-h-60 select-all font-mono">
                      {selectedNode.data.definition}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW H2: SINGLE SEQUENCE INSPECTOR                       */}
            {/* ======================================================== */}
            {selectedNode.type === 'sequence' && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Hash className="w-5 h-5 text-rose-400" />
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Schema: ' : 'اسکیما: '}
                        <span className="font-mono text-cyan-400">{selectedNode.schemaName}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-1 rounded-md text-xs font-mono font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                      {selectedNode.data.dataType || 'BIGINT'}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-mono font-bold uppercase border ${
                        selectedNode.data.isCycled
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {selectedNode.data.isCycled ? 'CYCLED' : 'NO CYCLE'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Start Value' : 'مقدار شروع'}</span>
                    <p className="font-bold text-sm text-cyan-400">{selectedNode.data.startValue ?? '1'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Last Value' : 'آخرین مقدار'}</span>
                    <p className="font-bold text-sm text-emerald-400">{selectedNode.data.lastValue ?? 'N/A'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Increment' : 'گام افزایش'}</span>
                    <p className="font-bold text-sm text-purple-400">{selectedNode.data.increment ?? '1'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Cache Size' : 'اندازه کش'}</span>
                    <p className="font-bold text-sm text-amber-400">{selectedNode.data.cacheSize ?? '1'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Minimum Value' : 'حداقل مقدار'}</span>
                    <p className="font-bold text-sm text-slate-200 truncate">{selectedNode.data.minValue ?? '1'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Maximum Value' : 'حداکثر مقدار'}</span>
                    <p className="font-bold text-sm text-slate-200 truncate">
                      {selectedNode.data.maxValue ?? '9223372036854775807'}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Owner' : 'مالک'}</span>
                    <p className="font-bold text-sm text-cyan-400 truncate">{selectedNode.data.owner}</p>
                  </div>
                </div>

                {/* SQL Snippets */}
                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'SQL Sequence Operations' : 'دستورات کاربردی دنباله در SQL'}
                  </span>
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                      <code className="text-cyan-300">
                        SELECT nextval('{selectedNode.schemaName}.{selectedNode.name}');
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`SELECT nextval('${selectedNode.schemaName}.${selectedNode.name}');`)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      >
                        {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                      <code className="text-cyan-300">
                        ALTER SEQUENCE {selectedNode.schemaName}.{selectedNode.name} RESTART WITH {selectedNode.data.startValue || 1};
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`ALTER SEQUENCE ${selectedNode.schemaName}.${selectedNode.name} RESTART WITH ${selectedNode.data.startValue || 1};`)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      >
                        {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW H3: EXTENSIONS CATALOG & SINGLE EXTENSION           */}
            {/* ======================================================== */}
            {selectedNode.type === 'extensions_folder' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Puzzle className="w-5 h-5 text-amber-400" />
                    <h4 className="font-bold text-sm">
                      {isEn ? 'Installed PostgreSQL Extensions (pg_extension)' : 'کاتالوگ افزونه‌های نصب‌شده PostgreSQL'}
                    </h4>
                  </div>
                  <FieldInfoTooltip
                    title={isEn ? 'PostgreSQL Extensions' : 'افزونه‌های دیتابیس'}
                    whatIsIt={
                      isEn
                        ? 'Modules and plugins installed in this database providing specialized functions or types.'
                        : 'ماژول‌ها و اکستنشن‌های فعال در این پایگاه داده جهت افزودن قابلیت‌های پیشرفته.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Useful for tracking PostGIS, pg_stat_statements, uuid-ossp, pgcrypto, etc.'
                        : 'جهت رصد اکستنشن‌های کلیدی مانند uuid-ossp، pgcrypto و ماژول‌های آماری.'
                    }
                    example="pg_stat_statements, uuid-ossp, plpgsql"
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
                        <th className="py-2.5 px-3">{isEn ? 'Extension Name' : 'نام افزونه'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Version' : 'نسخه'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Schema' : 'اسکیما'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Relocatable' : 'قابل جابجایی'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Description' : 'توضیحات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {(((selectedNode.data as PostgresExtensionItem[]) || [])
                        .filter(
                          (ext) =>
                            !detailFilter ||
                            ext.name.toLowerCase().includes(detailFilter.toLowerCase()) ||
                            ext.description?.toLowerCase().includes(detailFilter.toLowerCase())
                        )
                      ).map((ext) => (
                        <tr
                          key={ext.name}
                          onClick={() => {
                            setSelectedNode({
                              type: 'extension',
                              id: `ext:${selectedNode.dbName}:${ext.name}`,
                              name: ext.name,
                              dbName: selectedNode.dbName,
                              data: ext,
                            });
                          }}
                          className={`cursor-pointer transition ${
                            isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                            <Puzzle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{ext.name}</span>
                          </td>
                          <td className="py-2 px-3 text-cyan-400">{ext.version}</td>
                          <td className="py-2 px-3 text-slate-400">{ext.schema}</td>
                          <td className="py-2 px-3 text-slate-300 font-sans text-[11px]">{ext.relocatable ? 'YES' : 'NO'}</td>
                          <td className="py-2 px-3 text-slate-400 font-sans text-[11px] truncate max-w-sm">
                            {ext.description || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedNode.type === 'extension' && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Puzzle className="w-5 h-5 text-amber-400" />
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Database: ' : 'دیتابیس: '}
                        <span className="font-mono text-cyan-400">{selectedNode.dbName}</span>
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-1 rounded-md text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    v{selectedNode.data.version}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Installed Schema' : 'اسکیمای نصب'}</span>
                    <p className="font-bold text-sm text-cyan-400">{selectedNode.data.schema}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Relocatable' : 'قابلیت انتقال'}</span>
                    <p className="font-bold text-sm text-emerald-400">{selectedNode.data.relocatable ? 'YES' : 'NO'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Extension Status' : 'وضعیت'}</span>
                    <p className="font-bold text-sm text-purple-400">INSTALLED</p>
                  </div>
                </div>

                {selectedNode.data.description && (
                  <div
                    className={`p-4 rounded-xl border space-y-1.5 text-xs font-sans ${
                      isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950/60 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-semibold">
                      {isEn ? 'Extension Description' : 'توضیحات و کاربرد افزونه'}
                    </span>
                    <p>{selectedNode.data.description}</p>
                  </div>
                )}

                {/* SQL Example */}
                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'SQL Installation / Upgrade Syntax' : 'دستور ایجاد یا ارتقا در SQL'}
                  </span>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                    <code className="text-cyan-300">CREATE EXTENSION IF NOT EXISTS "{selectedNode.name}";</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`CREATE EXTENSION IF NOT EXISTS "${selectedNode.name}";`)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                    >
                      {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW I: ROLES & USERS                                    */}
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
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 font-bold font-sans">
                                YES
                              </span>
                            ) : (
                              <span className="text-slate-500 font-sans">NO</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {role.canLogin ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 font-bold font-sans">
                                YES
                              </span>
                            ) : (
                              <span className="text-slate-500 font-sans">NO</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-400 font-sans">{role.createDb ? 'YES' : 'NO'}</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">{role.replication ? 'YES' : 'NO'}</td>
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
