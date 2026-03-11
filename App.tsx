/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Filter, 
  Calendar, 
  List as ListIcon, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  CheckSquare, 
  MoreVertical, 
  MessageSquare, 
  Trash2, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  X,
  LayoutDashboard,
  FolderOpen,
  ArrowUp,
  ArrowDown,
  Search,
  AlertTriangle,
  Download
} from 'lucide-react';
import { 
  format, 
  addDays, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  isWithinInterval, 
  differenceInDays, 
  startOfMonth, 
  endOfMonth,
  parseISO,
  formatDistanceToNow,
  isAfter
} from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createClient } from '@supabase/supabase-js';
import { 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer,
  Sector
} from 'recharts';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

type Priority = 'High' | 'Medium' | 'Low';
type Status = 'To Do' | 'In Progress' | 'Blocked' | 'Done';
type ProjectStatus = 'Non commencé' | 'En cours' | 'Terminé' | 'Bloqué';

interface Comment {
  id: string;
  actionId: string;
  projectId: string;
  text: string;
  author: string;
  timestamp: string;
}

interface Action {
  id: string;
  projectId: string;
  name: string;
  status: Status;
  priority: Priority;
  startDate?: string;
  endDate?: string;
  duration?: number;
  dependencies: string[];
  comments: Comment[];
}

interface Project {
  id: string;
  name: string;
  color: string;
  startDate?: string;
  endDate?: string;
  status: ProjectStatus;
}

interface TimeLog {
  id: string;
  projectId: string;
  actionId?: string;
  hours: number;
  date: string;
  createdAt: string;
}

// --- Constants ---

const STATUS_COLORS: Record<Status, string> = {
  'To Do': 'bg-slate-100 text-slate-700 border-slate-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  'Blocked': 'bg-red-50 text-red-700 border-red-200',
  'Done': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  'High': 'bg-rose-500',
  'Medium': 'bg-amber-500',
  'Low': 'bg-emerald-500',
};

const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  'Non commencé': 'bg-slate-400',
  'En cours': 'bg-blue-500',
  'Terminé': 'bg-emerald-500',
  'Bloqué': 'bg-rose-500',
};

const PROJECT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6'
];

// --- Components ---

export default function App() {
  // --- State ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<Status[]>([]);
  const [view, setView] = useState<'list' | 'gantt' | 'history' | 'time'>('list');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [editingProject, setEditingProject] = useState<Project | 'new' | null>(null);

  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{id: string, text: string, type: 'success' | 'error'}[]>([]);

  const addNotification = (text: string, type: 'success' | 'error' = 'success') => {
    const id = crypto.randomUUID();
    setNotifications(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  // --- Supabase Data Fetching & Real-time ---
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setSupabaseError(null);
      try {
        // Fetch Projects
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('*');
        if (projectsError) throw projectsError;
        
        const formattedProjects: Project[] = (projectsData || []).map(p => ({
          id: p.id,
          name: p.name,
          color: p.color,
          status: p.status,
          startDate: p.start_date,
          endDate: p.end_date
        }));
        setProjects(formattedProjects);

        // Fetch Actions
        const { data: actionsData, error: actionsError } = await supabase
          .from('actions')
          .select('*');
        if (actionsError) throw actionsError;
        
        const formattedActions: Action[] = (actionsData || []).map(a => ({
          id: a.id,
          projectId: a.project_id,
          name: a.name,
          status: a.status,
          priority: a.priority,
          startDate: a.start_date,
          endDate: a.end_date,
          duration: a.duration,
          dependencies: a.dependencies || [],
          comments: a.comments || []
        }));
        setActions(formattedActions);

        // Fetch Time Logs
        const { data: logsData, error: logsError } = await supabase
          .from('time_logs')
          .select('*');
        if (logsError) throw logsError;
        
        const formattedLogs: TimeLog[] = (logsData || []).map(l => ({
          id: l.id,
          projectId: l.project_id,
          actionId: l.action_id,
          hours: l.hours,
          date: l.date,
          createdAt: l.created_at
        }));
        setTimeLogs(formattedLogs);
        
        console.log('Données chargées avec succès depuis Supabase');

      } catch (error: any) {
        console.error('Error fetching data from Supabase:', error);
        setSupabaseError(error.message || 'Erreur de connexion à Supabase');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Set up Realtime Subscriptions
    const projectsSubscription = (supabase
      .channel('projects-changes') as any)
      .on('postgres_changes', { event: '*', table: 'projects' }, () => fetchData())
      .subscribe();

    const actionsSubscription = (supabase
      .channel('actions-changes') as any)
      .on('postgres_changes', { event: '*', table: 'actions' }, () => fetchData())
      .subscribe();

    const timeLogsSubscription = (supabase
      .channel('time-logs-changes') as any)
      .on('postgres_changes', { event: '*', table: 'time_logs' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(projectsSubscription);
      supabase.removeChannel(actionsSubscription);
      supabase.removeChannel(timeLogsSubscription);
    };
  }, []);

  // --- Derived State (CPM Calculation) ---
  const calculateCriticalPath = (actionsList: Action[]): CalculatedAction[] => {
    if (actionsList.length === 0) return [];

    const actionMap = new Map<string, Action>(actionsList.map(a => [a.id, a]));
    const forwardMemo = new Map<string, { start: Date, end: Date }>();

    const calculateForward = (id: string, visited = new Set<string>()): { start: Date, end: Date } => {
      if (forwardMemo.has(id)) return forwardMemo.get(id)!;
      if (visited.has(id)) return { start: new Date(), end: new Date() }; 
      visited.add(id);

      const action = actionMap.get(id);
      if (!action) return { start: new Date(), end: new Date() };

      let start: Date;
      let end: Date;

      if (action.startDate && action.endDate) {
        start = parseISO(action.startDate);
        end = parseISO(action.endDate);
      } else if (action.startDate && action.duration) {
        start = parseISO(action.startDate);
        end = addDays(start, (action.duration || 1) - 1);
      } else {
        if (!action.dependencies || action.dependencies.length === 0) {
          start = new Date();
        } else {
          const depDates = action.dependencies
            .filter(depId => actionMap.has(depId))
            .map(depId => calculateForward(depId, new Set(visited)).end);
          
          if (depDates.length === 0) {
            start = new Date();
          } else {
            const maxDepEnd = new Date(Math.max(...depDates.map(d => d.getTime())));
            start = addDays(maxDepEnd, 1);
          }
        }
        const duration = action.duration || 7;
        end = addDays(start, duration - 1);
      }

      const result = { start, end };
      forwardMemo.set(id, result);
      return result;
    };

    const results = actionsList.map(action => {
      const { start, end } = calculateForward(action.id);
      return {
        ...action,
        calculatedStartDate: start,
        calculatedEndDate: end,
      };
    });

    const projectEnd = new Date(Math.max(...results.map(r => r.calculatedEndDate.getTime())));
    const backwardMemo = new Map<string, { lateStart: Date, lateFinish: Date }>();

    const calculateBackward = (id: string, visited = new Set<string>()): { lateStart: Date, lateFinish: Date } => {
      if (backwardMemo.has(id)) return backwardMemo.get(id)!;
      if (visited.has(id)) return { lateStart: projectEnd, lateFinish: projectEnd };
      visited.add(id);

      const action = results.find(r => r.id === id)!;
      const duration = differenceInDays(action.calculatedEndDate, action.calculatedStartDate);
      const successors = results.filter(r => r.dependencies?.includes(id));
      
      let lateFinish: Date;
      if (successors.length === 0) {
        lateFinish = projectEnd;
      } else {
        const successorLateStarts = successors.map(s => calculateBackward(s.id, new Set(visited)).lateStart);
        lateFinish = addDays(new Date(Math.min(...successorLateStarts.map(d => d.getTime()))), -1);
      }
      
      const lateStart = addDays(lateFinish, -duration);
      const result = { lateStart, lateFinish };
      backwardMemo.set(id, result);
      return result;
    };

    return results.map(action => {
      const { lateStart } = calculateBackward(action.id);
      const slack = differenceInDays(lateStart, action.calculatedStartDate);
      
      // Overlap detection: if any dependency ends after this action starts
      const hasOverlap = action.dependencies.some(depId => {
        const dep = results.find(r => r.id === depId);
        return dep && isAfter(dep.calculatedEndDate, action.calculatedStartDate);
      });

      return {
        ...action,
        slack,
        isCritical: slack === 0,
        hasOverlap
      };
    });
  };

  const calculatedActions = useMemo(() => calculateCriticalPath(actions), [actions]);

  const filteredActions = useMemo(() => {
    return calculatedActions.filter(action => {
      const matchesProject = selectedProjectIds.length === 0 || selectedProjectIds.includes(action.projectId);
      const matchesPriority = selectedPriorities.length === 0 || selectedPriorities.includes(action.priority);
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(action.status);
      return matchesProject && matchesPriority && matchesStatus;
    });
  }, [calculatedActions, selectedProjectIds, selectedPriorities, selectedStatuses]);

  const togglePriorityFilter = (priority: Priority) => {
    setSelectedPriorities(prev => 
      prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]
    );
  };

  // --- Handlers ---
  const handleAddAction = async (action: Omit<Action, 'id' | 'comments'>) => {
    const newAction: Action = {
      ...action,
      id: crypto.randomUUID(),
      comments: []
    };
    const updatedActions = [...actions, newAction];
    setActions(updatedActions);
    setIsModalOpen(false);

    // Supabase Sync
    try {
      const { error } = await supabase
        .from('actions')
        .insert([{
          id: newAction.id,
          project_id: newAction.projectId,
          name: newAction.name,
          status: newAction.status,
          priority: newAction.priority,
          start_date: newAction.startDate || null,
          end_date: newAction.endDate || null,
          duration: newAction.duration,
          dependencies: newAction.dependencies,
          comments: newAction.comments
        }]);
      if (error) {
        console.error('Supabase action insert error:', error);
        addNotification(`Erreur de sauvegarde: ${error.message}`, 'error');
      } else {
        addNotification('Action créée avec succès');
      }
    } catch (e: any) {
      console.error('Supabase connection error:', e);
      addNotification(`Erreur de connexion: ${e.message}`, 'error');
    }
  };

  const handleUpdateAction = async (updatedAction: Action) => {
    const updatedActions = actions.map(a => a.id === updatedAction.id ? updatedAction : a);
    setActions(updatedActions);
    setIsModalOpen(false);
    setEditingAction(null);

    // Supabase Sync
    try {
      const { error } = await supabase
        .from('actions')
        .upsert([{
          id: updatedAction.id,
          project_id: updatedAction.projectId,
          name: updatedAction.name,
          status: updatedAction.status,
          priority: updatedAction.priority,
          start_date: updatedAction.startDate || null,
          end_date: updatedAction.endDate || null,
          duration: updatedAction.duration,
          dependencies: updatedAction.dependencies,
          comments: updatedAction.comments
        }]);
      if (error) {
        console.error('Supabase action upsert error:', error);
        addNotification(`Erreur de mise à jour: ${error.message}`, 'error');
      } else {
        addNotification('Action mise à jour');
      }
    } catch (e: any) {
      console.error('Supabase connection error:', e);
      addNotification(`Erreur de connexion: ${e.message}`, 'error');
    }
  };

  const handleAddQuickComment = async (actionId: string, text: string) => {
    if (!text.trim()) return;
    const action = actions.find(a => a.id === actionId);
    if (!action) return;

    const newComment: Comment = {
      id: crypto.randomUUID(),
      actionId: action.id,
      projectId: action.projectId,
      text,
      timestamp: new Date().toISOString(),
      author: 'User'
    };

    const updatedAction = {
      ...action,
      comments: [...(action.comments || []), newComment]
    };

    handleUpdateAction(updatedAction);
  };

  const handleDeleteAction = async (id: string) => {
    // Removed confirm for better iframe compatibility
    const updatedActions = actions.filter(a => a.id !== id);
    setActions(updatedActions);
    setIsModalOpen(false);
    setEditingAction(null);

    // Supabase Sync
    try {
      const { error } = await supabase
        .from('actions')
        .delete()
        .eq('id', id);
      if (error) console.error('Supabase action delete error:', error);
    } catch (e) {
      console.error('Supabase connection error:', e);
    }
  };

  const handleSaveProject = async (projectData: Partial<Project>) => {
    let projectToSync: Project;
    
    if (editingProject && editingProject !== 'new') {
      projectToSync = { ...editingProject, ...projectData } as Project;
      setProjects(prev => prev.map(p => p.id === projectToSync.id ? projectToSync : p));
    } else {
      projectToSync = {
        id: crypto.randomUUID(),
        name: projectData.name || 'Nouveau Projet',
        color: projectData.color || PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
        status: projectData.status || 'Non commencé',
        startDate: projectData.startDate,
        endDate: projectData.endDate,
      };
      setProjects(prev => [...prev, projectToSync]);
    }
    
    setEditingProject(null);

    // Supabase Sync
    try {
      const { error } = await supabase
        .from('projects')
        .upsert([{
          id: projectToSync.id,
          name: projectToSync.name,
          color: projectToSync.color,
          status: projectToSync.status,
          start_date: projectToSync.startDate || null,
          end_date: projectToSync.endDate || null
        }]);
      
      if (error) {
        console.error('Supabase sync error:', error);
        addNotification(`Erreur projet: ${error.message}`, 'error');
      } else {
        addNotification('Projet sauvegardé');
      }
    } catch (e: any) {
      console.error('Supabase connection error:', e);
      addNotification(`Erreur de connexion: ${e.message}`, 'error');
    }
  };

  const handleAddTimeLog = async (log: Omit<TimeLog, 'id' | 'createdAt'>) => {
    const newLog: TimeLog = {
      ...log,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    const updatedLogs = [...timeLogs, newLog];
    setTimeLogs(updatedLogs);

    // Supabase Sync
    try {
      const { error } = await supabase.from('time_logs').insert([{
        id: newLog.id,
        project_id: newLog.projectId,
        action_id: newLog.actionId,
        hours: newLog.hours,
        date: newLog.date,
        created_at: newLog.createdAt
      }]);
      if (error) console.error('Supabase time log insert error:', error);
    } catch (e) {
      console.error('Supabase connection error:', e);
    }
  };

  const handleDeleteTimeLog = async (id: string) => {
    const updatedLogs = timeLogs.filter(l => l.id !== id);
    setTimeLogs(updatedLogs);

    try {
      const { error } = await supabase.from('time_logs').delete().eq('id', id);
      if (error) console.error('Supabase time log delete error:', error);
    } catch (e) {
      console.error('Supabase connection error:', e);
    }
  };

  const handleDeleteProject = async (id: string) => {
    // Removed confirm for better iframe compatibility
    const updatedProjects = projects.filter(p => p.id !== id);
    const updatedActions = actions.filter(a => a.projectId !== id);
    
    setProjects(updatedProjects);
    setActions(updatedActions);
    setEditingProject(null);

    // Supabase Sync
    try {
      const { error: pError } = await supabase.from('projects').delete().eq('id', id);
      if (pError) console.error('Supabase project delete error:', pError);
    } catch (e) {
      console.error('Supabase connection error:', e);
    }
  };

  const toggleProjectFilter = (id: string) => {
    setSelectedProjectIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  if (!supabaseUrl || supabaseUrl.includes('placeholder') || supabaseError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-md">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {supabaseError ? 'Erreur Supabase' : 'Configuration Supabase manquante'}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {supabaseError 
              ? `Une erreur est survenue lors de la connexion à votre base de données : ${supabaseError}`
              : "Veuillez configurer les variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans le menu Settings > Secrets d'AI Studio pour activer la synchronisation."
            }
          </p>
          <div className="text-left bg-slate-50 p-4 rounded-lg border border-slate-100 font-mono text-[10px] text-slate-400">
            URL: {supabaseUrl || 'Non définie'}<br/>
            Key: {supabaseAnonKey ? 'Définie (masquée)' : 'Non définie'}<br/>
            {supabaseError && <>Détail: {supabaseError}</>}
          </div>
          {supabaseError && (
            <button 
              onClick={() => window.location.reload()}
              className="mt-6 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
            >
              Réessayer
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      {/* Notifications */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {notifications.map(n => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
              "px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 min-w-[200px]",
              n.type === 'success' ? "bg-white border-emerald-100 text-emerald-700" : "bg-white border-rose-100 text-rose-700"
            )}
          >
            {n.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {n.text}
          </motion.div>
        ))}
      </div>

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <LayoutDashboard className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">ActionPro</h1>
          </div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Project Manager</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3 px-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Projects</h2>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setSelectedProjectIds(projects.map(p => p.id))}
                  className="text-[10px] font-bold text-blue-600 hover:underline"
                >
                  All
                </button>
                <span className="text-[10px] text-slate-300">|</span>
                <button 
                  onClick={() => setSelectedProjectIds([])}
                  className="text-[10px] font-bold text-slate-400 hover:underline"
                >
                  None
                </button>
                <button 
                  onClick={() => setEditingProject('new')}
                  className="p-1 hover:bg-slate-100 rounded-md transition-colors ml-1"
                >
                  <Plus className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {projects.map(project => (
                <div key={project.id} className="group relative">
                  <label 
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all",
                      selectedProjectIds.includes(project.id) ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={selectedProjectIds.includes(project.id)}
                      onChange={() => toggleProjectFilter(project.id)}
                    />
                    <div 
                      className="w-3 h-3 rounded-full shrink-0" 
                      style={{ backgroundColor: project.color }} 
                    />
                    <span className="truncate flex-1">{project.name}</span>
                    {project.status === 'Terminé' && (
                      <span className="text-[8px] font-bold bg-emerald-100 text-emerald-700 px-1 rounded uppercase">Done</span>
                    )}
                  </label>
                  <button 
                    onClick={() => setEditingProject(project)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 hover:bg-white rounded transition-all"
                  >
                    <MoreVertical className="w-3 h-3 text-slate-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3 px-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtres</h2>
            </div>
            <div className="space-y-4 px-2">
              {/* Priority Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Priorité</label>
                <div className="flex flex-wrap gap-1">
                  {(['High', 'Medium', 'Low'] as Priority[]).map(priority => (
                    <button
                      key={priority}
                      onClick={() => togglePriorityFilter(priority)}
                      className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold transition-all border",
                        selectedPriorities.includes(priority) 
                          ? "bg-slate-900 text-white border-slate-900" 
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      )}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Statut</label>
                <div className="flex flex-wrap gap-1">
                  {(['To Do', 'In Progress', 'Blocked', 'Done'] as Status[]).map(status => (
                    <button
                      key={status}
                      onClick={() => setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])}
                      className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold transition-all border",
                        selectedStatuses.includes(status) 
                          ? "bg-slate-900 text-white border-slate-900" 
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Total Actions</p>
            <p className="text-2xl font-bold text-slate-900">{actions.length}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold text-slate-600">Synchronisation en cours...</p>
            </div>
          </div>
        )}
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setView('list')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  view === 'list' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <ListIcon className="w-4 h-4" />
                List View
              </button>
              <button 
                onClick={() => setView('gantt')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  view === 'gantt' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Calendar className="w-4 h-4" />
                Gantt View
              </button>
              <button 
                onClick={() => setView('history')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  view === 'history' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <MessageSquare className="w-4 h-4" />
                History
              </button>
              <button 
                onClick={() => setView('time')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  view === 'time' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Clock className="w-4 h-4" />
                Temps Passé
              </button>
            </div>
          </div>

          <button 
            onClick={() => {
              setEditingAction(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Action
          </button>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-hidden relative">
          {view === 'list' ? (
            <ListView 
              actions={filteredActions} 
              projects={projects}
              onEdit={(a) => {
                setEditingAction(a);
                setIsModalOpen(true);
              }}
              onDelete={handleDeleteAction}
              onAddComment={handleAddQuickComment}
            />
          ) : view === 'gantt' ? (
            <GanttView 
              actions={filteredActions} 
              projects={projects}
              onEdit={(a) => {
                setEditingAction(a);
                setIsModalOpen(true);
              }}
              onUpdateAction={handleUpdateAction}
            />
          ) : view === 'time' ? (
            <TimeTrackingView 
              projects={projects}
              actions={actions}
              timeLogs={timeLogs}
              onAddTimeLog={handleAddTimeLog}
              onDeleteTimeLog={handleDeleteTimeLog}
            />
          ) : (
            <ActivityFeed 
              actions={calculatedActions}
              projects={projects}
              onEditAction={(a) => {
                setEditingAction(a);
                setIsModalOpen(true);
              }}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      {isModalOpen && (
        <ActionModal 
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={editingAction ? handleUpdateAction : handleAddAction}
          onDelete={handleDeleteAction}
          projects={projects}
          initialData={editingAction}
          allActions={actions}
        />
      )}

      {editingProject && (
        <ProjectModal 
          project={editingProject === 'new' ? null : editingProject}
          onClose={() => setEditingProject(null)} 
          onSave={handleSaveProject}
          onDelete={handleDeleteProject}
        />
      )}
    </div>
  );
}

// --- Sub-Components ---

interface CalculatedAction extends Action {
  calculatedStartDate: Date;
  calculatedEndDate: Date;
  slack: number;
  isCritical: boolean;
  hasOverlap: boolean;
}

function ListView({ actions, projects, onEdit, onDelete, onAddComment }: { 
  actions: CalculatedAction[], 
  projects: Project[], 
  onEdit: (a: Action) => void,
  onDelete: (id: string) => void,
  onAddComment: (id: string, text: string) => void
}) {
  const [quickComments, setQuickComments] = useState<Record<string, string>>({});
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  const handleQuickCommentSubmit = (e: React.FormEvent, actionId: string) => {
    e.preventDefault();
    const text = quickComments[actionId];
    if (text?.trim()) {
      onAddComment(actionId, text);
      setQuickComments(prev => ({ ...prev, [actionId]: '' }));
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 bg-slate-50/30">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">Actions</h2>
          <div className="text-xs text-slate-500 font-medium">
            {actions.length} actions
          </div>
        </div>

        {actions.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <CheckSquare className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No actions found</h3>
            <p className="text-slate-500 max-w-xs">Start by adding a new action or adjust your project filters.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-1"></th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">Status</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Date</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Alertes</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20"></th>
                </tr>
              </thead>
              <tbody>
                {actions.map(action => {
                  const project = projects.find(p => p.id === action.projectId);
                  const isArchived = project?.status === 'Terminé';
                  const isExpanded = expandedActionId === action.id;
                  
                  // Critical Rule: Priority High AND has dependencies
                  const showCriticalBadge = action.priority === 'High' && (action.dependencies.length > 0 || actions.some(a => a.dependencies.includes(action.id)));

                  return (
                    <React.Fragment key={action.id}>
                      <tr 
                        className={cn(
                          "group border-b border-slate-100 hover:bg-blue-50/30 transition-colors cursor-pointer",
                          isArchived && "opacity-60 grayscale-[0.5]",
                          isExpanded && "bg-blue-50/50"
                        )}
                        onClick={() => setExpandedActionId(isExpanded ? null : action.id)}
                      >
                        <td className="px-4 py-1.5">
                          <div 
                            className="w-1.5 h-6 rounded-full" 
                            style={{ backgroundColor: project?.color || '#cbd5e1' }} 
                          />
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate max-w-[100px]">
                                {project?.name || 'Unknown'}
                              </span>
                              <span className="text-xs font-semibold text-slate-900 truncate">
                                {action.name}
                              </span>
                              {showCriticalBadge && (
                                <span className="px-1 py-0.5 bg-rose-100 text-rose-600 text-[8px] font-black uppercase rounded border border-rose-200">Critical</span>
                              )}
                              <div className={cn(
                                "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider",
                                action.priority === 'High' ? "bg-rose-50 text-rose-600 border border-rose-100" :
                                action.priority === 'Medium' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                "bg-emerald-50 text-emerald-600 border border-emerald-100"
                              )}>
                                {action.priority}
                              </div>
                              {action.comments.length > 0 && (
                                <span className="flex items-center gap-0.5 text-[9px] text-slate-400 font-bold">
                                  <MessageSquare className="w-2.5 h-2.5" />
                                  {action.comments.length}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-1.5">
                          <div className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                            STATUS_COLORS[action.status]
                          )}>
                            {action.status === 'Done' && <CheckCircle2 className="w-2.5 h-2.5" />}
                            {action.status === 'In Progress' && <Clock className="w-2.5 h-2.5" />}
                            {action.status}
                          </div>
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-1 text-slate-400">
                            <Calendar className="w-3 h-3" />
                            <span className="text-[10px] font-medium">
                              {format(action.calculatedStartDate, 'MMM d')}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            {action.hasOverlap && (
                              <div className="group/tooltip relative">
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10">
                                  Attention : chevauchement de dépendance
                                </div>
                              </div>
                            )}
                            {action.isCritical && (
                              <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" title="Chemin Critique" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-1">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={(e) => { e.stopPropagation(); onEdit(action); }}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(action.id); }}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-blue-50/20 border-b border-slate-100">
                          <td colSpan={6} className="px-12 py-4">
                            <div className="space-y-4">
                              <div className="space-y-3">
                                {action.comments.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic">Aucun commentaire pour le moment.</p>
                                ) : (
                                  action.comments.map(comment => (
                                    <div key={comment.id} className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-900">{comment.author}</span>
                                        <span className="text-[10px] text-slate-400">
                                          {formatDistanceToNow(new Date(comment.timestamp), { addSuffix: true })}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-100 shadow-sm inline-block self-start">
                                        {comment.text}
                                      </p>
                                    </div>
                                  ))
                                )}
                              </div>
                              <form 
                                onSubmit={(e) => handleQuickCommentSubmit(e, action.id)}
                                className="flex gap-2"
                              >
                                <input 
                                  type="text"
                                  placeholder="Ajouter un commentaire..."
                                  value={quickComments[action.id] || ''}
                                  onChange={(e) => setQuickComments(prev => ({ ...prev, [action.id]: e.target.value }))}
                                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                                <button 
                                  type="submit"
                                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                                >
                                  Envoyer
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TimeTrackingView({ projects, actions, timeLogs, onAddTimeLog, onDeleteTimeLog }: {
  projects: Project[],
  actions: Action[],
  timeLogs: TimeLog[],
  onAddTimeLog: (log: Omit<TimeLog, 'id' | 'createdAt'>) => void,
  onDeleteTimeLog: (id: string) => void
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedActionId, setSelectedActionId] = useState<string>('');
  const [hours, setHours] = useState<string>('');
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  // Dashboard Filters
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [visibleProjectIds, setVisibleProjectIds] = useState<string[]>(projects.map(p => p.id));

  const filteredActions = actions.filter(a => a.projectId === selectedProjectId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !hours || !date) return;
    
    onAddTimeLog({
      projectId: selectedProjectId,
      actionId: selectedActionId || undefined,
      hours: parseFloat(hours),
      date
    });

    setHours('');
    setSelectedActionId('');
  };

  // Filtered logs for the dashboard
  const dashboardLogs = useMemo(() => {
    return timeLogs.filter(log => {
      const logDate = parseISO(log.date);
      const isWithin = isWithinInterval(logDate, { 
        start: parseISO(startDate), 
        end: parseISO(endDate) 
      });
      const isVisible = visibleProjectIds.includes(log.projectId);
      return isWithin && isVisible;
    });
  }, [timeLogs, startDate, endDate, visibleProjectIds]);

  // Pie Chart Data: Time per project
  const pieData = useMemo(() => {
    const data: Record<string, { name: string, value: number, color: string }> = {};
    dashboardLogs.forEach(log => {
      const project = projects.find(p => p.id === log.projectId);
      if (project) {
        if (!data[log.projectId]) {
          data[log.projectId] = { name: project.name, value: 0, color: project.color };
        }
        data[log.projectId].value += log.hours;
      }
    });
    return Object.values(data);
  }, [dashboardLogs, projects]);

  // Bar Chart Data: Daily hours
  const barData = useMemo(() => {
    const days = eachDayOfInterval({ 
      start: parseISO(startDate), 
      end: parseISO(endDate) 
    });
    
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayLogs = dashboardLogs.filter(log => log.date === dayStr);
      
      const dataPoint: any = { date: format(day, 'dd/MM') };
      visibleProjectIds.forEach(pid => {
        const project = projects.find(p => p.id === pid);
        if (project) {
          const hours = dayLogs
            .filter(log => log.projectId === pid)
            .reduce((sum, log) => sum + log.hours, 0);
          dataPoint[project.name] = hours;
        }
      });
      return dataPoint;
    });
  }, [dashboardLogs, startDate, endDate, visibleProjectIds, projects]);

  const totalHours = dashboardLogs.reduce((sum, log) => sum + log.hours, 0);

  const exportCSV = () => {
    const headers = ['Date', 'Projet', 'Action', 'Heures'];
    const rows = dashboardLogs.map(log => {
      const project = projects.find(p => p.id === log.projectId);
      const action = actions.find(a => a.id === log.actionId);
      return [
        log.date,
        project?.name || 'Inconnu',
        action?.name || '-',
        log.hours.toString()
      ];
    });

    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `time-tracking-${startDate}-to-${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleProjectVisibility = (pid: string) => {
    setVisibleProjectIds(prev => 
      prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]
    );
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 bg-slate-50/50">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Dashboard Analytique</h2>
            <p className="text-slate-500 text-sm">Analysez la répartition de votre temps sur vos projets.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs font-bold text-slate-700 focus:outline-none"
              />
              <span className="text-slate-300">→</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs font-bold text-slate-700 focus:outline-none"
              />
            </div>
            <button 
              onClick={exportCSV}
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              Exporter CSV
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Heures</div>
            <div className="text-3xl font-black text-blue-600">{totalHours}h</div>
            <div className="text-[10px] text-slate-400 mt-1">Sur la période sélectionnée</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Projets Actifs</div>
            <div className="text-3xl font-black text-slate-900">{pieData.length}</div>
            <div className="text-[10px] text-slate-400 mt-1">Avec du temps enregistré</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Moyenne / Jour</div>
            <div className="text-3xl font-black text-slate-900">
              {(totalHours / (differenceInDays(parseISO(endDate), parseISO(startDate)) + 1)).toFixed(1)}h
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Heures par jour calendaire</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Charts */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Évolution Quotidienne</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }} 
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                    />
                    <Legend 
                      iconType="circle" 
                      wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'bold' }}
                      onClick={(e) => {
                        const project = projects.find(p => p.name === e.value);
                        if (project) toggleProjectVisibility(project.id);
                      }}
                    />
                    {projects.map(p => (
                      <Bar 
                        key={p.id} 
                        dataKey={p.name} 
                        stackId="a" 
                        fill={p.color} 
                        hide={!visibleProjectIds.includes(p.id)}
                        radius={[2, 2, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Répartition par Projet</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Sidebar: Entry Form & Project Visibility */}
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Saisir du temps
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Projet</label>
                  <select 
                    value={selectedProjectId}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value);
                      setSelectedActionId('');
                    }}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    <option value="">Sélectionner un projet</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Action (Optionnel)</label>
                  <select 
                    value={selectedActionId}
                    onChange={(e) => setSelectedActionId(e.target.value)}
                    disabled={!selectedProjectId}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
                  >
                    <option value="">Toutes les actions</option>
                    {filteredActions.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Heures</label>
                    <input 
                      type="number" 
                      step="0.5"
                      min="0.5"
                      max="24"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      required
                      placeholder="0.0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                    <input 
                      type="date" 
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-sm transition-all shadow-sm active:scale-[0.98] mt-2"
                >
                  Enregistrer
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Filtrer les Projets</h3>
              <div className="space-y-2">
                {projects.map(p => (
                  <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={visibleProjectIds.includes(p.id)}
                      onChange={() => toggleProjectVisibility(p.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className={cn(
                      "text-xs font-medium transition-colors",
                      visibleProjectIds.includes(p.id) ? "text-slate-700" : "text-slate-400"
                    )}>
                      {p.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-900">Détail par Projet & Action</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Projet</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Action</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 text-center">Heures</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 text-right">% du Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjectIds.length === 0 || dashboardLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 text-sm italic">
                      Aucune donnée à afficher pour cette sélection.
                    </td>
                  </tr>
                ) : (
                  projects
                    .filter(p => visibleProjectIds.includes(p.id))
                    .map(project => {
                      const projectLogs = dashboardLogs.filter(log => log.projectId === project.id);
                      const projectTotal = projectLogs.reduce((sum, log) => sum + log.hours, 0);
                      
                      if (projectTotal === 0) return null;

                      // Group by action
                      const actionMap: Record<string, number> = {};
                      projectLogs.forEach(log => {
                        const key = log.actionId || 'no-action';
                        actionMap[key] = (actionMap[key] || 0) + log.hours;
                      });

                      return Object.entries(actionMap).map(([actionId, hours], idx) => {
                        const action = actions.find(a => a.id === actionId);
                        return (
                          <tr key={`${project.id}-${actionId}`} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                            <td className="p-4">
                              {idx === 0 && (
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                                  <span className="text-sm font-bold text-slate-700">{project.name}</span>
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              <span className="text-xs text-slate-500">{action?.name || '-'}</span>
                            </td>
                            <td className="p-4 text-center">
                              <span className="text-sm font-bold text-slate-900">{hours}h</span>
                            </td>
                            <td className="p-4 text-right">
                              <span className="text-xs font-bold text-slate-400">
                                {((hours / totalHours) * 100).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })
                )}
              </tbody>
              <tfoot className="bg-slate-50/80">
                <tr>
                  <td colSpan={2} className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Sélection</td>
                  <td className="p-4 text-center font-black text-blue-600 text-base">{totalHours}h</td>
                  <td className="p-4 text-right font-black text-slate-900 text-base">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function GanttView({ actions, projects, onEdit, onUpdateAction }: { 
  actions: CalculatedAction[], 
  projects: Project[],
  onEdit: (a: Action) => void,
  onUpdateAction: (a: Action) => void
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dragging, setDragging] = useState<{ id: string, startX: number, originalStart: Date, currentDelta: number } | null>(null);
  
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const groupedActions = useMemo(() => {
    const groups: { project: Project, actions: CalculatedAction[] }[] = [];
    projects.forEach(project => {
      const projectActions = actions
        .filter(a => a.projectId === project.id)
        .sort((a, b) => a.calculatedStartDate.getTime() - b.calculatedStartDate.getTime());
      if (projectActions.length > 0) {
        groups.push({ project, actions: projectActions });
      }
    });
    return groups;
  }, [actions, projects]);

  const flatSortedActions = useMemo(() => {
    return groupedActions.flatMap(g => g.actions);
  }, [groupedActions]);

  const handleMouseDown = (e: React.MouseEvent, action: CalculatedAction) => {
    e.stopPropagation();
    setDragging({
      id: action.id,
      startX: e.clientX,
      originalStart: action.calculatedStartDate,
      currentDelta: 0
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const deltaX = e.clientX - dragging.startX;
      const dayDelta = Math.round(deltaX / 40);
      setDragging(prev => prev ? { ...prev, currentDelta: dayDelta } : null);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragging) return;
      
      const dayDelta = dragging.currentDelta;
      
      if (dayDelta !== 0) {
        const action = actions.find(a => a.id === dragging.id);
        if (action) {
          const newStart = addDays(dragging.originalStart, dayDelta);
          const duration = differenceInDays(action.calculatedEndDate, action.calculatedStartDate) + 1;
          const newEnd = addDays(newStart, duration - 1);
          
          onUpdateAction({
            ...action,
            startDate: format(newStart, 'yyyy-MM-dd'),
            endDate: format(newEnd, 'yyyy-MM-dd'),
            duration: duration
          });
        }
      }
      
      setDragging(null);
    };

    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, actions, onUpdateAction]);

  const sortedActions = useMemo(() => {
    return [...actions].sort((a, b) => a.calculatedStartDate.getTime() - b.calculatedStartDate.getTime());
  }, [actions]);

  const nextMonth = () => setCurrentDate(addDays(endOfMonth(currentDate), 1));
  const prevMonth = () => setCurrentDate(addDays(startOfMonth(currentDate), -1));

  // Dependency Line Logic
  const renderDependencyLines = () => {
    return flatSortedActions.map(action => {
      return action.dependencies.map((depId: string) => {
        const dep = flatSortedActions.find(a => a.id === depId);
        if (!dep) return null;

        const startIdx = days.findIndex(d => isSameDay(d, dep.calculatedEndDate));
        const endIdx = days.findIndex(d => isSameDay(d, action.calculatedStartDate));
        
        if (startIdx === -1 || endIdx === -1) return null;

        const depRowIdx = flatSortedActions.findIndex(a => a.id === depId);
        const actionRowIdx = flatSortedActions.findIndex(a => a.id === action.id);

        const x1 = (startIdx + 1) * 40;
        const y1 = depRowIdx * 56 + 28;
        const x2 = endIdx * 40;
        const y2 = actionRowIdx * 56 + 28;

        return (
          <g key={`${action.id}-${depId}`}>
            <path 
              d={`M ${x1} ${y1} L ${x1 + 10} ${y1} L ${x1 + 10} ${y2} L ${x2} ${y2}`}
              fill="none"
              stroke={action.isCritical && dep.isCritical ? "#ef4444" : "#cbd5e1"}
              strokeWidth={action.isCritical && dep.isCritical ? "2" : "1"}
              strokeDasharray={action.isCritical && dep.isCritical ? "" : "4 2"}
              className="transition-all"
            />
            <circle cx={x2} cy={y2} r="3" fill={action.isCritical && dep.isCritical ? "#ef4444" : "#cbd5e1"} />
          </g>
        );
      });
    });
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Gantt Header */}
      <div className="px-8 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{format(currentDate, 'MMMM yyyy')}</h2>
          <div className="flex gap-1">
            <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded-md transition-colors">
              <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
            </button>
            <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded-md transition-colors">
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            </button>
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {actions.length} actions filtrées
        </div>
      </div>

      {/* Gantt Grid */}
      <div className="flex-1 overflow-auto relative">
        <div className="min-w-max relative">
          {/* SVG Overlay for Connections */}
          <svg className="absolute top-[49px] left-64 pointer-events-none z-0" style={{ width: days.length * 40, height: flatSortedActions.length * 56 }}>
            {renderDependencyLines()}
          </svg>

          {/* Days Header */}
          <div className="flex border-b border-slate-100 sticky top-0 bg-white z-20">
            <div className="w-64 shrink-0 border-r border-slate-100 p-4 font-bold text-xs text-slate-400 uppercase tracking-wider">
              Actions
            </div>
            {days.map(day => (
              <div 
                key={day.toISOString()} 
                className={cn(
                  "w-10 shrink-0 flex flex-col items-center justify-center py-2 border-r border-slate-50 text-[10px] font-bold",
                  isSameDay(day, new Date()) ? "text-blue-600 bg-blue-50/50" : "text-slate-400",
                  (day.getDay() === 0 || day.getDay() === 6) && "bg-slate-50/50"
                )}
              >
                <span>{format(day, 'EEE').toUpperCase()}</span>
                <span className="text-xs">{format(day, 'd')}</span>
              </div>
            ))}
          </div>

          {/* Action Rows */}
          {groupedActions.map((group, groupIdx) => (
            <div key={group.project.id} className={cn(
              "contents",
              groupIdx % 2 === 0 ? "bg-white" : "bg-slate-50/30"
            )}>
              {group.actions.map((action, actionIdx) => {
                const start = action.calculatedStartDate;
                const end = action.calculatedEndDate;
                const startIdx = days.findIndex(d => isSameDay(d, start));
                const duration = differenceInDays(end, start) + 1;
                
                return (
                  <div key={action.id} className={cn(
                    "flex border-b border-slate-50 hover:bg-blue-50/30 transition-colors group relative z-10",
                    groupIdx % 2 === 1 && "bg-slate-50/50"
                  )}>
                    <div 
                      className="w-64 shrink-0 border-r border-slate-100 p-3 flex items-center gap-3 cursor-pointer relative"
                      onClick={() => onEdit(action)}
                    >
                      {actionIdx === 0 && (
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: group.project.color }} />
                      )}
                      <div className="flex-1 min-w-0">
                        {actionIdx === 0 && (
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate">{group.project.name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-semibold truncate block",
                            action.isCritical ? "text-rose-600" : "text-slate-700"
                          )}>
                            {action.name}
                          </span>
                          {action.hasOverlap && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex relative h-14">
                      {days.map(day => (
                        <div 
                          key={day.toISOString()} 
                          className={cn(
                            "w-10 shrink-0 border-r border-slate-50/50",
                            (day.getDay() === 0 || day.getDay() === 6) && "bg-slate-50/30"
                          )} 
                        />
                      ))}
                      
                      {/* Action Bar */}
                      {startIdx !== -1 && (
                        <div 
                          onMouseDown={(e) => handleMouseDown(e, action)}
                          title={`${action.priority} Priority${action.isCritical ? ' (Critical Path)' : ''}. ${action.hasOverlap ? "Attention : chevauchement de dépendance" : (action.isCritical ? "Marge : 0j" : `Marge: ${action.slack}j`)}`}
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 h-7 rounded-md shadow-sm border flex items-center px-0 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md z-10 overflow-hidden select-none",
                            action.isCritical ? "border-rose-300 bg-rose-50/50" : "border-slate-200 bg-white",
                            !action.isCritical && action.slack > 0 && "opacity-80",
                            group.project?.status === 'Terminé' && "grayscale-[0.8] opacity-40",
                            dragging?.id === action.id && "ring-2 ring-blue-500 ring-offset-2 scale-[1.02] opacity-100 z-50 cursor-grabbing"
                          )}
                          style={{ 
                            left: `${(startIdx + (dragging?.id === action.id ? dragging.currentDelta : 0)) * 40 + 4}px`, 
                            width: `${duration * 40 - 8}px`,
                            borderColor: action.isCritical ? '#fecdd3' : (action.slack > 0 ? '#e2e8f0' : `${group.project?.color}40`),
                            color: action.isCritical ? '#e11d48' : (action.slack > 0 ? '#64748b' : '#334155')
                          }}
                          onClick={() => onEdit(action)}
                        >
                          {/* Priority Indicator Strip */}
                          <div 
                            className={cn("w-1 h-full shrink-0", action.isCritical ? "bg-rose-500" : PRIORITY_COLORS[action.priority])} 
                          />
                          <div className="flex items-center justify-between w-full px-2 overflow-hidden">
                            <span className="text-[10px] font-bold truncate whitespace-nowrap">
                              {action.name}
                            </span>
                            {action.hasOverlap && (
                              <AlertTriangle className={cn("w-3 h-3 shrink-0 ml-1", action.isCritical ? "text-rose-500" : "text-amber-500")} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          
          {groupedActions.length === 0 && (
            <div className="p-24 text-center space-y-4">
              <div className="inline-flex p-4 bg-slate-50 rounded-full">
                <Filter className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-400 font-medium">Aucun projet sélectionné ou aucune action disponible.</p>
            </div>
          )}
          
          {sortedActions.length === 0 && (
            <div className="p-12 text-center text-slate-400 font-medium">
              No actions to display in Gantt view.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityFeed({ actions, projects, onEditAction }: { 
  actions: CalculatedAction[], 
  projects: Project[],
  onEditAction: (a: Action) => void
}) {
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [sortBy, setSortBy] = useState<'date' | 'priority'>('date');

  const allComments = useMemo(() => {
    const comments: (Comment & { actionName: string, project: Project | undefined, priority: Priority, action: Action })[] = [];
    actions.forEach(action => {
      const project = projects.find(p => p.id === action.projectId);
      (action.comments || []).forEach(comment => {
        comments.push({
          ...comment,
          actionName: action.name,
          project,
          priority: action.priority,
          action
        });
      });
    });
    return comments;
  }, [actions, projects]);

  const filteredComments = useMemo(() => {
    let result = [...allComments];

    if (projectFilter !== 'all') {
      result = result.filter(c => c.projectId === projectFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'date') {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      } else {
        const priorityMap: Record<Priority, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };
        const valA = priorityMap[a.priority];
        const valB = priorityMap[b.priority];
        return sortOrder === 'desc' ? valB - valA : valA - valB;
      }
    });

    return result;
  }, [allComments, projectFilter, sortOrder, sortBy]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select 
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sort by:</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'priority')}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="date">Date</option>
              <option value="priority">Action Priority</option>
            </select>
            <button 
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-1.5 hover:bg-white border border-slate-200 rounded-lg transition-all"
            >
              {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4 text-slate-600" /> : <ArrowUp className="w-4 h-4 text-slate-600" />}
            </button>
          </div>
        </div>
        <div className="text-sm text-slate-500 font-medium">
          {filteredComments.length} updates found
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-2 relative">
          {/* Vertical Timeline Line */}
          <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-100" />

          {filteredComments.map((comment, idx) => (
            <div key={comment.id} className="relative pl-8 animate-in fade-in slide-in-from-left-4 duration-300" style={{ animationDelay: `${idx * 20}ms` }}>
              {/* Timeline Dot */}
              <div className={cn(
                "absolute left-1.5 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm z-10",
                PRIORITY_COLORS[comment.priority]
              )} />

              <div className="group">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    {formatDistanceToNow(new Date(comment.timestamp), { addSuffix: true })}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-[9px] font-bold text-slate-900">{comment.author}</span>
                </div>

                <div 
                  onClick={() => onEditAction(comment.action)}
                  className="bg-white border border-slate-100 rounded-lg p-2 shadow-sm hover:shadow-md hover:border-blue-100 transition-all cursor-pointer group-hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h4 className="text-[11px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{comment.actionName}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: comment.project?.color }} />
                        <span className="text-[9px] font-medium text-slate-500">{comment.project?.name}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 rounded p-1.5 border border-slate-100">
                    <p className="text-[10px] text-slate-700 leading-tight italic">"{comment.text}"</p>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredComments.length === 0 && (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">No activity yet</h3>
              <p className="text-slate-500">Comments and updates will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionModal({ isOpen, onClose, onSave, onDelete, projects, initialData, allActions }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (a: any) => void,
  onDelete?: (id: string) => void,
  projects: Project[],
  initialData: Action | null,
  allActions: Action[]
}) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    projectId: initialData?.projectId || (projects[0]?.id || ''),
    status: initialData?.status || 'To Do',
    priority: initialData?.priority || 'Medium',
    startDate: initialData?.startDate || '',
    endDate: initialData?.endDate || '',
    duration: initialData?.duration || 7,
    dependencies: initialData?.dependencies || [] as string[],
  });

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (next.startDate && next.endDate) {
        const start = parseISO(next.startDate);
        const end = parseISO(next.endDate);
        const duration = differenceInDays(end, start) + 1;
        if (duration > 0) {
          next.duration = duration;
        }
      }
      return next;
    });
  };

  const handleDurationChange = (val: number) => {
    setFormData(prev => {
      const next = { ...prev, duration: val };
      if (next.startDate && val > 0) {
        const start = parseISO(next.startDate);
        next.endDate = format(addDays(start, val - 1), 'yyyy-MM-dd');
      }
      return next;
    });
  };

  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<Comment[]>(initialData?.comments || []);

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    const comment: Comment = {
      id: crypto.randomUUID(),
      actionId: initialData?.id || 'new',
      projectId: formData.projectId,
      text: newComment,
      author: 'You', // In a real app, this would be the logged-in user
      timestamp: new Date().toISOString()
    };
    setComments([comment, ...comments]);
    setNewComment('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...initialData,
      ...formData,
      comments
    });
  };

  const toggleDependency = (id: string) => {
    setFormData(prev => ({
      ...prev,
      dependencies: (prev.dependencies || []).includes(id) 
        ? prev.dependencies.filter(d => d !== id)
        : [...(prev.dependencies || []), id]
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900">
            {initialData ? 'Edit Action' : 'Create New Action'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Action Name</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                placeholder="e.g., Finalize design mockups"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Project</label>
                <select 
                  value={formData.projectId}
                  onChange={e => setFormData({...formData, projectId: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Priority</label>
                <select 
                  value={formData.priority}
                  onChange={e => setFormData({...formData, priority: e.target.value as Priority})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                <select 
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value as Status})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                >
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Done">Done</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
                  <input 
                    type="date" 
                    value={formData.startDate}
                    onChange={e => handleDateChange('startDate', e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
                  <input 
                    type="date" 
                    value={formData.endDate}
                    onChange={e => handleDateChange('endDate', e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Duration</label>
                  <input 
                    type="number" 
                    min="1"
                    value={formData.duration}
                    onChange={e => handleDurationChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Dependencies */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dependencies (Predecessors)</label>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-32 overflow-y-auto space-y-1">
                {allActions.filter(a => a.id !== initialData?.id).map(action => (
                  <label key={action.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded-md cursor-pointer transition-all">
                    <input 
                      type="checkbox" 
                      checked={(formData.dependencies || []).includes(action.id)}
                      onChange={() => toggleDependency(action.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-slate-700 truncate">{action.name}</span>
                  </label>
                ))}
                {allActions.length <= 1 && (
                  <p className="text-xs text-slate-400 italic p-2">No other actions available to link.</p>
                )}
              </div>
            </div>
          </div>

          {/* Comments Section */}
          <div className="pt-6 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Comments & Logs</h3>
            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddComment())}
                placeholder="Add a progress update..."
                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
              />
              <button 
                type="button"
                onClick={handleAddComment}
                className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all active:scale-95"
              >
                Post
              </button>
            </div>
            <div className="space-y-3">
              {comments.map(comment => (
                <div key={comment.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-sm text-slate-700 leading-relaxed">{comment.text}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider">
                    {format(parseISO(comment.timestamp), 'MMM d, yyyy • HH:mm')}
                  </p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-4 italic">No comments yet.</p>
              )}
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          {initialData && onDelete ? (
            <button 
              type="button"
              onClick={() => onDelete(initialData.id)}
              className="flex items-center gap-2 text-rose-600 hover:text-rose-700 font-bold text-sm px-4 py-2 rounded-xl hover:bg-rose-50 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Delete Action
            </button>
          ) : <div />}
          <div className="flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
            >
              {initialData ? 'Save Changes' : 'Create Action'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectModal({ project, onClose, onSave, onDelete }: { 
  project: Project | null, 
  onClose: () => void, 
  onSave: (data: Partial<Project>) => void,
  onDelete: (id: string) => void
}) {
  const [formData, setFormData] = useState({
    name: project?.name || '',
    color: project?.color || PROJECT_COLORS[0],
    status: project?.status || 'Non commencé',
    startDate: project?.startDate || '',
    endDate: project?.endDate || '',
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">{project ? 'Edit Project' : 'New Project'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-all">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Project Name</label>
            <input 
              autoFocus
              type="text" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="Project name..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
              <select 
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value as ProjectStatus})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              >
                <option value="Non commencé">Non commencé</option>
                <option value="En cours">En cours</option>
                <option value="Terminé">Terminé</option>
                <option value="Bloqué">Bloqué</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Color</label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map(c => (
                  <button 
                    key={c}
                    onClick={() => setFormData({...formData, color: c})}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-all",
                      formData.color === c ? "border-slate-900 scale-110" : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
              <input 
                type="date" 
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
              <input 
                type="date" 
                value={formData.endDate}
                onChange={e => setFormData({...formData, endDate: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          {project ? (
            <button 
              onClick={() => onDelete(project.id)}
              className="flex items-center gap-2 text-rose-600 hover:text-rose-700 font-bold text-sm px-2 py-1 rounded transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          ) : <div />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">
              Cancel
            </button>
            <button 
              disabled={!formData.name.trim()}
              onClick={() => onSave(formData)}
              className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
            >
              {project ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
