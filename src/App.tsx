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
  Download,
  Archive,
  Zap,
  Pin,
  Edit2
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

type Priority = 'High' | 'Medium';
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

interface ProjectComment {
  id: string;
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
  isPinned?: boolean;
  isTodo?: boolean;
}

interface Project {
  id: string;
  name: string;
  color: string;
  startDate?: string;
  endDate?: string;
  status: ProjectStatus;
  category?: string;
  notes?: string;
}

interface TimeLog {
  id: string;
  projectId: string;
  actionId?: string;
  hours: number;
  estimatedHours?: number;
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
};

const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  'Non commencé': 'bg-slate-400',
  'En cours': 'bg-blue-500',
  'Terminé': 'bg-emerald-500',
  'Bloqué': 'bg-rose-500',
};

const PROJECT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6',
  '#f97316', '#84cc16', '#6366f1', '#d946ef', '#f43f5e', '#1e293b', '#475569', '#7c3aed'
];

// --- Components ---

export default function App() {
  // --- State ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [projectComments, setProjectComments] = useState<ProjectComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<Status[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [view, setView] = useState<'list' | 'gantt' | 'history' | 'time' | 'archives' | 'projects' | 'todo'>('list');
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
          endDate: p.end_date,
          category: p.category,
          notes: p.notes
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
          comments: a.comments || [],
          estimatedHours: a.estimated_hours,
          isPinned: a.is_pinned,
          isTodo: a.is_todo
        }));
        setActions(formattedActions);

        // Fetch Project Comments
        const { data: pCommentsData, error: pCommentsError } = await supabase
          .from('project_comments')
          .select('*');
        if (!pCommentsError) {
          setProjectComments((pCommentsData || []).map(pc => ({
            id: pc.id,
            projectId: pc.project_id,
            text: pc.text,
            author: pc.author,
            timestamp: pc.timestamp
          })));
        }

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

  const categories = useMemo(() => {
    const cats = new Set<string>();
    projects.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter(project => {
      const matchesCategory = selectedCategories.length === 0 || (project.category && selectedCategories.includes(project.category));
      return matchesCategory;
    });
  }, [projects, selectedCategories]);

  const calculatedActions = useMemo(() => calculateCriticalPath(actions), [actions]);

  const filteredActions = useMemo(() => {
    return calculatedActions.filter(action => {
      const project = projects.find(p => p.id === action.projectId);
      const isArchived = project?.status === 'Terminé';
      
      // If we are in archives view, only show archived projects
      if (view === 'archives') {
        if (!isArchived) return false;
      } else {
        // In other views, only show active projects
        if (isArchived) return false;
      }

      const matchesProject = selectedProjectIds.length === 0 || selectedProjectIds.includes(action.projectId);
      const matchesPriority = selectedPriorities.length === 0 || selectedPriorities.includes(action.priority);
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(action.status);
      const matchesCategory = selectedCategories.length === 0 || (project?.category && selectedCategories.includes(project.category));
      
      return matchesProject && matchesPriority && matchesStatus && matchesCategory;
    });
  }, [calculatedActions, selectedProjectIds, selectedPriorities, selectedStatuses, selectedCategories, view, projects]);

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
      comments: [],
      isPinned: action.isPinned || false,
      isTodo: action.isTodo || false
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
          comments: newAction.comments,
          is_pinned: newAction.isPinned,
          is_todo: newAction.isTodo
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
          comments: updatedAction.comments,
          is_pinned: updatedAction.isPinned || false,
          is_todo: updatedAction.isTodo || false
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
        category: projectData.category,
        notes: projectData.notes
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
          end_date: projectToSync.endDate || null,
          category: projectToSync.category || null,
          notes: projectToSync.notes || null
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
        estimated_hours: newLog.estimatedHours,
        date: newLog.date,
        created_at: newLog.createdAt
      }]);
      if (error) console.error('Supabase time log insert error:', error);
    } catch (e) {
      console.error('Supabase connection error:', e);
    }
  };

  const handleUpdateComment = async (actionId: string, commentId: string, newText: string) => {
    const action = actions.find(a => a.id === actionId);
    if (!action) return;

    const updatedComments = action.comments.map(c => 
      c.id === commentId ? { ...c, text: newText } : c
    );

    handleUpdateAction({ ...action, comments: updatedComments });
  };

  const handleDeleteComment = async (actionId: string, commentId: string) => {
    const action = actions.find(a => a.id === actionId);
    if (!action) return;

    const updatedComments = action.comments.filter(c => c.id !== commentId);
    handleUpdateAction({ ...action, comments: updatedComments });
  };

  const handleSaveProjectComment = async (projectId: string, text: string) => {
    if (!text.trim()) return;
    
    const newComment: ProjectComment = {
      id: crypto.randomUUID(),
      projectId,
      text,
      author: 'User',
      timestamp: new Date().toISOString()
    };

    setProjectComments(prev => [...prev, newComment]);

    try {
      const { error } = await supabase
        .from('project_comments')
        .insert([{
          id: newComment.id,
          project_id: newComment.projectId,
          text: newComment.text,
          author: newComment.author,
          timestamp: newComment.timestamp
        }]);
      if (error) console.error('Supabase project comment error:', error);
    } catch (e) {
      console.error('Supabase connection error:', e);
    }
  };

  const handleDeleteProjectComment = async (id: string) => {
    setProjectComments(prev => prev.filter(c => c.id !== id));
    try {
      await supabase.from('project_comments').delete().eq('id', id);
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
              {projects.filter(p => p.status !== 'Terminé').map(project => (
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
                  {(['High', 'Medium'] as Priority[]).map(priority => (
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

              {/* Category Filter */}
              {categories.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Catégorie</label>
                  <div className="flex flex-wrap gap-1">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold transition-all border",
                          selectedCategories.includes(cat) 
                            ? "bg-slate-900 text-white border-slate-900" 
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                Temps
              </button>
              <button 
                onClick={() => setView('projects')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  view === 'projects' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <FolderOpen className="w-4 h-4" />
                Projets
              </button>
              <button 
                onClick={() => setView('todo')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  view === 'todo' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <CheckSquare className="w-4 h-4" />
                To-Do
              </button>
              <button 
                onClick={() => setView('archives')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  view === 'archives' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Archive className="w-4 h-4" />
                Archives
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
              projects={filteredProjects}
              onEdit={(a) => {
                setEditingAction(a);
                setIsModalOpen(true);
              }}
              onDelete={handleDeleteAction}
              onAddComment={handleAddQuickComment}
              onUpdateAction={handleUpdateAction}
            />
          ) : view === 'gantt' ? (
            <GanttView 
              actions={calculateCriticalPath(filteredActions)} 
              projects={filteredProjects}
              onEdit={(a) => {
                setEditingAction(a);
                setIsModalOpen(true);
              }}
              onUpdateAction={handleUpdateAction}
            />
          ) : view === 'history' ? (
            <ActivityFeed 
              actions={calculateCriticalPath(filteredActions)}
              projects={filteredProjects}
              onEditAction={(a) => {
                setEditingAction(a);
                setIsModalOpen(true);
              }}
            />
          ) : view === 'time' ? (
            <TimeTrackingView 
              projects={filteredProjects}
              actions={actions}
              timeLogs={timeLogs}
              onAddTimeLog={handleAddTimeLog}
              onDeleteTimeLog={handleDeleteTimeLog}
            />
          ) : view === 'projects' ? (
            <ProjectDashboardView 
              projects={filteredProjects}
              actions={actions}
              projectComments={projectComments}
              onSaveComment={handleSaveProjectComment}
              onDeleteComment={handleDeleteProjectComment}
              onEditAction={(a) => {
                setEditingAction(a);
                setIsModalOpen(true);
              }}
              onTogglePin={(a) => handleUpdateAction({ ...a, isPinned: !a.isPinned })}
            />
          ) : view === 'todo' ? (
            <TodoListView 
              actions={filteredActions}
              projects={filteredProjects}
              onUpdateAction={handleUpdateAction}
              onAddTimeLog={handleAddTimeLog}
              timeLogs={timeLogs}
            />
          ) : (
            <ArchivesView 
              projects={filteredProjects.filter(p => p.status === 'Terminé')}
              actions={actions}
              timeLogs={timeLogs}
              onEditProject={(p) => setEditingProject(p)}
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

function ProjectDashboardView({ projects, actions, projectComments, onSaveComment, onDeleteComment, onEditAction, onTogglePin }: {
  projects: Project[],
  actions: Action[],
  projectComments: ProjectComment[],
  onSaveComment: (projectId: string, text: string) => void,
  onDeleteComment: (id: string) => void,
  onEditAction: (a: Action) => void,
  onTogglePin: (a: Action) => void
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id || null);
  const [newComment, setNewComment] = useState('');

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectActions = actions.filter(a => a.projectId === selectedProjectId);
  const pinnedActions = projectActions.filter(a => a.isPinned);
  const comments = projectComments.filter(c => c.projectId === selectedProjectId);

  const stats = {
    todo: projectActions.filter(a => a.status === 'To Do').length,
    inProgress: projectActions.filter(a => a.status === 'In Progress').length,
    done: projectActions.filter(a => a.status === 'Done').length,
    blocked: projectActions.filter(a => a.status === 'Blocked').length,
  };

  if (!selectedProject) return <div className="p-8 text-center text-slate-400">Aucun projet sélectionné</div>;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="p-6 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select 
            value={selectedProjectId || ''} 
            onChange={e => setSelectedProjectId(e.target.value)}
            className="text-lg font-bold bg-transparent border-none focus:ring-0 cursor-pointer"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {selectedProject.category && (
            <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase rounded-md tracking-wider">
              {selectedProject.category}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6">
          {[
            { label: 'À Faire', value: stats.todo, color: 'text-slate-600', bg: 'bg-slate-100' },
            { label: 'En Cours', value: stats.inProgress, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Terminé', value: stats.done, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Bloqué', value: stats.blocked, color: 'text-rose-600', bg: 'bg-rose-50' },
          ].map(stat => (
            <div key={stat.label} className={cn("p-6 rounded-2xl border border-white shadow-sm", stat.bg)}>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
              <p className={cn("text-3xl font-black", stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-8">
          {/* Pinned Actions */}
          <div className="col-span-1 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUp className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Actions Épinglées</h3>
            </div>
            <div className="space-y-3">
              {pinnedActions.map(action => (
                <div 
                  key={action.id} 
                  className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => onEditAction(action)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800 leading-tight">{action.name}</p>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onTogglePin(action); }}
                      className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded uppercase", STATUS_COLORS[action.status])}>
                      {action.status}
                    </span>
                  </div>
                </div>
              ))}
              {pinnedActions.length === 0 && (
                <p className="text-xs text-slate-400 italic">Aucune action épinglée.</p>
              )}
            </div>
          </div>

          {/* Project Notes/Comments */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Notes & Commentaires Projet</h3>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
              <div className="flex gap-3">
                <textarea 
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Ajouter une note ou un commentaire sur le projet..."
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm min-h-[100px] resize-none"
                />
                <button 
                  onClick={() => { onSaveComment(selectedProjectId!, newComment); setNewComment(''); }}
                  className="bg-slate-900 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all self-end"
                >
                  Ajouter
                </button>
              </div>

              <div className="space-y-4">
                {comments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(comment => (
                  <div key={comment.id} className="group relative bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                    <button 
                      onClick={() => onDeleteComment(comment.id)}
                      className="absolute top-2 right-2 p-1 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <p className="text-sm text-slate-700 leading-relaxed">{comment.text}</p>
                    <div className="mt-2 flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      <span>{comment.author}</span>
                      <span>•</span>
                      <span>{format(parseISO(comment.timestamp), 'dd/MM/yyyy HH:mm')}</span>
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-8 italic">Aucune note pour le moment.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TodoListView({ actions, projects, onUpdateAction, onAddTimeLog, timeLogs }: {
  actions: Action[],
  projects: Project[],
  onUpdateAction: (a: Action) => void,
  onAddTimeLog: (log: any) => void,
  timeLogs: TimeLog[]
}) {
  const todoActions = actions.filter(a => a.isTodo);
  const [timeInput, setTimeInput] = useState<Record<string, number>>({});
  const [estimatedInput, setEstimatedInput] = useState<Record<string, number>>({});

  const today = new Date().toISOString().split('T')[0];
  
  const todayLogs = timeLogs.filter(log => log.date === today);
  
  const totalEstimated = todoActions.reduce((sum, action) => {
    const log = todayLogs.find(l => l.actionId === action.id);
    return sum + (log?.estimatedHours || estimatedInput[action.id] || 0);
  }, 0);
  
  const handleLogTime = (action: Action) => {
    const hours = timeInput[action.id] || 0;
    const estimatedHours = estimatedInput[action.id] || 0;
    
    if (hours <= 0 && estimatedHours <= 0) return;

    onAddTimeLog({
      projectId: action.projectId,
      actionId: action.id,
      hours,
      estimatedHours,
      date: today
    });
    
    // Clear inputs after logging
    setTimeInput(prev => ({ ...prev, [action.id]: 0 }));
    setEstimatedInput(prev => ({ ...prev, [action.id]: 0 }));
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="p-8 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Ma Liste To-Do</h2>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</p>
              <p className="text-xl font-black text-slate-900">{todoActions.length}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Est. Aujourd'hui</p>
              <p className="text-xl font-black text-blue-600">{totalEstimated}h</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          {todoActions.map(action => {
            const project = projects.find(p => p.id === action.projectId);
            const todayLog = todayLogs.find(l => l.actionId === action.id);
            
            return (
              <div key={action.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-6">
                <button 
                  onClick={() => onUpdateAction({ ...action, status: action.status === 'Done' ? 'To Do' : 'Done' })}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                    action.status === 'Done' ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-200 text-transparent hover:border-blue-500"
                  )}
                >
                  <CheckSquare className="w-4 h-4" />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: project?.color }} />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{project?.name}</span>
                    {project?.category && (
                      <span className="px-1 py-0.5 bg-slate-50 text-slate-400 text-[8px] font-bold uppercase rounded border border-slate-100">
                        {project.category}
                      </span>
                    )}
                  </div>
                  <h3 className={cn("text-base font-bold text-slate-800 truncate", action.status === 'Done' && "line-through text-slate-400")}>
                    {action.name}
                  </h3>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estimé (h)</label>
                    <input 
                      type="number" 
                      step="0.5"
                      min="0"
                      placeholder={todayLog?.estimatedHours?.toString() || "0h"}
                      value={estimatedInput[action.id] || ''}
                      onChange={e => setEstimatedInput({ ...estimatedInput, [action.id]: parseFloat(e.target.value) })}
                      className="w-16 px-2 py-1.5 bg-blue-50/50 border border-blue-100 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Passé (h)</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        step="0.5"
                        min="0"
                        placeholder={todayLog?.hours?.toString() || "0h"}
                        value={timeInput[action.id] || ''}
                        onChange={e => setTimeInput({ ...timeInput, [action.id]: parseFloat(e.target.value) })}
                        className="w-16 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button 
                        onClick={() => handleLogTime(action)}
                        className="p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all active:scale-95"
                        title="Enregistrer"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={() => onUpdateAction({ ...action, isTodo: false })}
                    className="p-2 text-slate-300 hover:text-rose-600 transition-colors"
                    title="Retirer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {todoActions.length === 0 && (
            <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">Votre liste To-Do est vide.</p>
              <p className="text-xs text-slate-400 mt-1">Cochez des actions dans la vue liste pour les ajouter ici.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CalculatedAction extends Action {
  calculatedStartDate: Date;
  calculatedEndDate: Date;
  slack: number;
  isCritical: boolean;
  hasOverlap: boolean;
}

function ArchivesView({ projects, actions, timeLogs, onEditProject, onEditAction }: {
  projects: Project[],
  actions: Action[],
  timeLogs: TimeLog[],
  onEditProject: (p: Project) => void,
  onEditAction: (a: Action) => void
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [timeGrouping, setTimeGrouping] = useState<'week' | 'month'>('week');

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectActions = actions.filter(a => a.projectId === selectedProjectId);
  const projectLogs = timeLogs.filter(l => l.projectId === selectedProjectId);

  const totalHours = projectLogs.reduce((sum, log) => sum + log.hours, 0);

  const groupedTime = useMemo(() => {
    const groups: Record<string, number> = {};
    projectLogs.forEach(log => {
      const date = new Date(log.date);
      const key = timeGrouping === 'week' 
        ? `Semaine du ${format(startOfWeek(date, { weekStartsOn: 1 }), 'dd/MM/yyyy')}`
        : format(date, 'MMMM yyyy');
      groups[key] = (groups[key] || 0) + log.hours;
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [projectLogs, timeGrouping]);

  return (
    <div className="h-full flex overflow-hidden bg-slate-50/50">
      {/* Project List */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Archive className="w-5 h-5 text-slate-400" />
            Projets Archivés
          </h2>
          <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {projects.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {projects.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Archive className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400 italic">Aucun projet archivé pour le moment.</p>
            </div>
          ) : (
            projects.map(project => {
              const pTotalHours = timeLogs
                .filter(l => l.projectId === project.id)
                .reduce((sum, log) => sum + log.hours, 0);
              
              return (
                <div
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border transition-all group relative cursor-pointer",
                    selectedProjectId === project.id 
                      ? "bg-white border-blue-200 shadow-md ring-1 ring-blue-100" 
                      : "bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm"
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                    <span className="font-bold text-slate-900 truncate flex-1">{project.name}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-4 text-[10px] text-slate-400 font-medium">
                      <div className="flex items-center gap-1">
                        <CheckSquare className="w-3 h-3" />
                        {actions.filter(a => a.projectId === project.id).length} actions
                      </div>
                      <div className="flex items-center gap-1 text-blue-600 font-bold">
                        <Clock className="w-3 h-3" />
                        {pTotalHours}h
                      </div>
                      {project.category && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 text-slate-400 text-[8px] font-bold uppercase rounded border border-slate-100">
                          {project.category}
                        </div>
                      )}
                    </div>
                    {project.endDate && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Calendar className="w-3 h-3" />
                        Fini le {format(new Date(project.endDate), 'dd MMM yyyy')}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditProject(project);
                    }}
                    className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    <MoreVertical className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Project Details */}
      <div className="flex-1 overflow-y-auto p-8">
        {selectedProject ? (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedProject.color }} />
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">{selectedProject.name}</h2>
                </div>
                <p className="text-slate-500 text-sm">Historique complet des actions et du temps passé.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl">
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Total Temps</div>
                  <div className="text-xl font-black text-blue-600">{totalHours}h</div>
                </div>
                <button 
                  onClick={() => onEditProject(selectedProject)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm h-fit"
                >
                  Gérer le projet
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Actions ({projectActions.length})</h3>
                  <div className="grid gap-3">
                    {projectActions.length === 0 ? (
                      <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center">
                        <p className="text-slate-400 italic text-sm">Aucune action enregistrée pour ce projet.</p>
                      </div>
                    ) : (
                      projectActions.map(action => (
                        <div 
                          key={action.id}
                          className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex items-center justify-between"
                        >
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                              action.status === 'Done' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                            )}>
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900 mb-1">{action.name}</h4>
                              <div className="flex items-center gap-3 text-[10px] font-medium text-slate-400">
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full border",
                                  STATUS_COLORS[action.status]
                                )}>
                                  {action.status}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {action.startDate ? format(new Date(action.startDate), 'dd/MM/yy') : 'Sans date'}
                                </div>
                                {action.comments.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <MessageSquare className="w-3 h-3" />
                                    {action.comments.length}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => onEditAction(action)}
                            className="p-2 opacity-0 group-hover:opacity-100 hover:bg-slate-50 rounded-xl transition-all"
                          >
                            <MoreVertical className="w-5 h-5 text-slate-400" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Temps Passé</h3>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                      <button 
                        onClick={() => setTimeGrouping('week')}
                        className={cn(
                          "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                          timeGrouping === 'week' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        Sem.
                      </button>
                      <button 
                        onClick={() => setTimeGrouping('month')}
                        className={cn(
                          "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                          timeGrouping === 'month' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        Mois
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {groupedTime.length === 0 ? (
                      <p className="text-center text-xs text-slate-400 italic py-4">Aucun temps enregistré.</p>
                    ) : (
                      groupedTime.map(([label, hours]) => (
                        <div key={label} className="flex items-center justify-between group">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700">{label}</span>
                            <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((hours / totalHours) * 100, 100)}%` }}
                                className="h-full bg-blue-500"
                              />
                            </div>
                          </div>
                          <span className="text-sm font-black text-slate-900">{hours}h</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl shadow-slate-200">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Récapitulatif</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Actions finies</span>
                      <span className="font-bold">{projectActions.filter(a => a.status === 'Done').length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Moyenne / Action</span>
                      <span className="font-bold">
                        {projectActions.length > 0 ? (totalHours / projectActions.length).toFixed(1) : 0}h
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-6 border border-slate-100">
              <Archive className="w-10 h-10 text-slate-200" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Sélectionnez un projet</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              Choisissez un projet archivé dans la liste de gauche pour consulter son historique complet et ses analyses de temps.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ListView({ actions, projects, onEdit, onDelete, onAddComment, onUpdateAction }: { 
  actions: CalculatedAction[], 
  projects: Project[], 
  onEdit: (a: Action) => void,
  onDelete: (id: string) => void,
  onAddComment: (id: string, text: string) => void,
  onUpdateAction: (a: Action) => void
}) {
  const [quickComments, setQuickComments] = useState<Record<string, string>>({});
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'status' | 'date' | 'category'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const sortedActions = useMemo(() => {
    const result = [...actions];
    result.sort((a, b) => {
      const projectA = projects.find(p => p.id === a.projectId);
      const projectB = projects.find(p => p.id === b.projectId);

      let valA: any = '';
      let valB: any = '';

      if (sortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === 'status') {
        valA = a.status;
        valB = b.status;
      } else if (sortField === 'date') {
        valA = a.startDate || '';
        valB = b.startDate || '';
      } else if (sortField === 'category') {
        valA = (projectA?.category || '').toLowerCase();
        valB = (projectB?.category || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [actions, projects, sortField, sortOrder]);

  const toggleSort = (field: 'name' | 'status' | 'date' | 'category') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

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
                  <th 
                    className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600"
                    onClick={() => toggleSort('name')}
                  >
                    Action {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 w-32"
                    onClick={() => toggleSort('status')}
                  >
                    Status {sortField === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 w-32"
                    onClick={() => toggleSort('category')}
                  >
                    Catégorie {sortField === 'category' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 w-24"
                    onClick={() => toggleSort('date')}
                  >
                    Date {sortField === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Alertes</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20"></th>
                </tr>
              </thead>
              <tbody>
                {sortedActions.map(action => {
                  const project = projects.find(p => p.id === action.projectId);
                  const isArchived = project?.status === 'Terminé';
                  const isExpanded = expandedActionId === action.id;
                  
                  // Critical Rule: Has dependencies OR is a dependency of another action
                  const hasDependencies = action.dependencies.length > 0 || actions.some(a => a.dependencies.includes(action.id));
                  const showCriticalBadge = hasDependencies;

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
                                "bg-slate-50 text-slate-600 border border-slate-100"
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
                          {project?.category ? (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-bold uppercase rounded tracking-wider border border-slate-200">
                              {project.category}
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-300 italic">Aucune</span>
                          )}
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
                                {action.dependencies.length > 0 && (
                                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 mb-4">
                                    <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                      <Zap className="w-3 h-3" />
                                      Dépendances (Bloqué par)
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                      {action.dependencies.map(depId => {
                                        const dep = actions.find(a => a.id === depId);
                                        return (
                                          <div key={depId} className="px-2 py-1 bg-white border border-amber-200 rounded-lg text-[10px] font-bold text-slate-700 shadow-sm">
                                            {dep?.name || 'Action inconnue'}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
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
  const [visibleProjectIds, setVisibleProjectIds] = useState<string[]>(projects.map(p => p.id));
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  
  const days = useMemo(() => {
    // Show 3 months: previous, current, next
    const start = startOfMonth(addDays(currentDate, -30));
    const end = endOfMonth(addDays(currentDate, 30));
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const filteredActions = useMemo(() => {
    let base = actions.filter(a => visibleProjectIds.includes(a.projectId));
    if (showCriticalOnly) {
      // Actions that have dependencies OR are dependencies of others
      const allDepIds = new Set(actions.flatMap(a => a.dependencies));
      base = base.filter(a => a.dependencies.length > 0 || allDepIds.has(a.id));
    }
    return base;
  }, [actions, visibleProjectIds, showCriticalOnly]);

  const groupedActions = useMemo(() => {
    const groups: { project: Project, actions: CalculatedAction[] }[] = [];
    projects.filter(p => visibleProjectIds.includes(p.id)).forEach(project => {
      const projectActions = filteredActions
        .filter(a => a.projectId === project.id)
        .sort((a, b) => a.calculatedStartDate.getTime() - b.calculatedStartDate.getTime());
      if (projectActions.length > 0) {
        groups.push({ project, actions: projectActions });
      }
    });
    return groups;
  }, [filteredActions, projects, visibleProjectIds]);

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

  const nextMonth = () => setCurrentDate(addDays(endOfMonth(currentDate), 1));
  const prevMonth = () => setCurrentDate(addDays(startOfMonth(currentDate), -1));

  const toggleProject = (id: string) => {
    setVisibleProjectIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

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
              stroke={showCriticalOnly || (action.isCritical && dep.isCritical) ? "#ef4444" : "#cbd5e1"}
              strokeWidth={showCriticalOnly || (action.isCritical && dep.isCritical) ? "2" : "1"}
              strokeDasharray={showCriticalOnly || (action.isCritical && dep.isCritical) ? "" : "4 2"}
              className="transition-all"
            />
            <circle cx={x2} cy={y2} r="3" fill={showCriticalOnly || (action.isCritical && dep.isCritical) ? "#ef4444" : "#cbd5e1"} />
          </g>
        );
      });
    });
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Gantt Header */}
      <div className="px-8 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-30">
        <div className="flex items-center gap-6">
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
          
          <div className="flex items-center gap-3 border-l border-slate-200 pl-6 relative">
            <button 
              onClick={() => setShowCriticalOnly(!showCriticalOnly)}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-xl border transition-all text-xs font-bold uppercase tracking-wider",
                showCriticalOnly 
                  ? "bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-500/20" 
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              )}
            >
              <Zap className={cn("w-3.5 h-3.5", showCriticalOnly && "fill-current")} />
              Chemin Critique {showCriticalOnly ? "Actif" : "Inactif"}
            </button>

            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-xl border transition-all text-xs font-bold uppercase tracking-wider",
                visibleProjectIds.length === projects.length 
                  ? "bg-slate-50 border-slate-200 text-slate-600" 
                  : "bg-blue-50 border-blue-200 text-blue-600"
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              Projets ({visibleProjectIds.length}/{projects.length})
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isFilterOpen && "rotate-180")} />
            </button>

            {isFilterOpen && (
              <div className="absolute top-full left-6 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Filtrer les Projets</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setVisibleProjectIds(projects.map(p => p.id))}
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      Tous
                    </button>
                    <button 
                      onClick={() => setVisibleProjectIds([])}
                      className="text-[10px] font-bold text-slate-400 hover:underline"
                    >
                      Aucun
                    </button>
                  </div>
                </div>
                
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input 
                    type="text"
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                    placeholder="Rechercher un projet..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 custom-scrollbar pr-2">
                  {projects
                    .filter(p => p.name.toLowerCase().includes(filterSearch.toLowerCase()))
                    .map(p => (
                    <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors group">
                      <input 
                        type="checkbox"
                        checked={visibleProjectIds.includes(p.id)}
                        onChange={() => toggleProject(p.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {filteredActions.length} actions affichées
        </div>
      </div>

      {/* Gantt Grid */}
      <div className="flex-1 overflow-auto relative custom-scrollbar">
        <div className="min-w-max relative">
          {/* SVG Overlay for Connections */}
          <svg className="absolute top-[49px] left-64 pointer-events-none z-0" style={{ width: days.length * 40, height: flatSortedActions.length * 56 }}>
            {renderDependencyLines()}
          </svg>

          {/* Days Header */}
          <div className="flex border-b border-slate-100 sticky top-0 bg-white z-20">
            <div className="w-64 shrink-0 border-r border-slate-100 p-4 font-bold text-xs text-slate-400 uppercase tracking-wider bg-white">
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
            <div key={group.project.id} className="contents">
              {group.actions.map((action, actionIdx) => {
                const start = action.calculatedStartDate;
                const end = action.calculatedEndDate;
                const startIdx = days.findIndex(d => isSameDay(d, start));
                const endIdx = days.findIndex(d => isSameDay(d, end));
                
                // Handle actions starting before or ending after the current view
                const visibleStartIdx = startIdx === -1 ? 0 : startIdx;
                const visibleEndIdx = endIdx === -1 ? days.length - 1 : endIdx;
                const visibleDuration = visibleEndIdx - visibleStartIdx + 1;

                const isLate = action.status !== 'Done' && action.endDate && parseISO(action.endDate) < new Date();
                const isHighPriority = action.priority === 'High';
                const useRed = isHighPriority || isLate;
                
                return (
                  <div key={action.id} className={cn(
                    "flex border-b border-slate-50 hover:bg-blue-50/30 transition-colors group relative z-10",
                    groupIdx % 2 === 1 && "bg-slate-50/20"
                  )}>
                    <div 
                      className="w-64 shrink-0 border-r border-slate-100 p-3 flex items-center gap-3 cursor-pointer relative bg-white group-hover:bg-blue-50/30"
                      onClick={() => onEdit(action)}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: group.project.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate">{group.project.name}</span>
                          {group.project.category && (
                            <span className="px-1 py-0.5 bg-slate-50 text-slate-400 text-[7px] font-bold uppercase rounded border border-slate-100">
                              {group.project.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-semibold truncate block",
                            useRed ? "text-rose-600" : "text-slate-700"
                          )}>
                            {action.name}
                          </span>
                          {action.isCritical && <Zap className="w-3 h-3 text-rose-500 fill-current" />}
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
                      {(startIdx !== -1 || endIdx !== -1) && (
                        <div 
                          onMouseDown={(e) => handleMouseDown(e, action)}
                          title={`${action.priority} Priority. Marge: ${action.slack}j. ${isLate ? 'EN RETARD' : ''}`}
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 h-8 rounded-lg shadow-sm border flex items-center px-0 cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md z-10 overflow-hidden select-none",
                            useRed ? "border-rose-300 bg-rose-50/80" : "border-slate-200",
                            action.isCritical && "ring-1 ring-rose-500 ring-offset-1",
                            dragging?.id === action.id && "ring-2 ring-blue-500 ring-offset-2 scale-[1.02] opacity-100 z-50 cursor-grabbing"
                          )}
                          style={{ 
                            left: `${(visibleStartIdx + (dragging?.id === action.id ? dragging.currentDelta : 0)) * 40 + 4}px`, 
                            width: `${visibleDuration * 40 - 8}px`,
                            backgroundColor: useRed ? undefined : `${group.project.color}15`,
                            borderColor: useRed ? undefined : `${group.project.color}40`,
                          }}
                          onClick={() => onEdit(action)}
                        >
                          {/* Color Strip */}
                          <div 
                            className="w-1.5 h-full shrink-0" 
                            style={{ backgroundColor: useRed ? '#ef4444' : group.project.color }} 
                          />
                          <div className="flex items-center justify-between w-full px-3 overflow-hidden">
                            <div className="flex flex-col min-w-0">
                              <span className={cn(
                                "text-[11px] font-bold truncate whitespace-nowrap",
                                useRed ? "text-rose-700" : "text-slate-700"
                              )}>
                                {action.name}
                              </span>
                              {action.endDate && action.status !== 'Done' && (
                                <span className={cn(
                                  "text-[9px] font-black uppercase tracking-tighter",
                                  useRed ? "text-rose-600/70" : "text-slate-500/70"
                                )}>
                                  {differenceInDays(parseISO(action.endDate), new Date()) > 0 
                                    ? `${differenceInDays(parseISO(action.endDate), new Date())}j restants`
                                    : differenceInDays(parseISO(action.endDate), new Date()) === 0
                                      ? "Dernier jour"
                                      : "En retard"}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {action.isCritical && <Zap className="w-3 h-3 text-rose-500 fill-current" />}
                              {action.status === 'To Do' && <AlertCircle className="w-3 h-3 text-slate-400" />}
                              {action.status === 'In Progress' && <Clock className="w-3 h-3 text-blue-500" />}
                              {action.status === 'Blocked' && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                              {action.status === 'Done' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                            </div>
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
        const priorityMap: Record<Priority, number> = { 'High': 2, 'Medium': 1 };
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

function ActionModal({ isOpen, onClose, onSave, onDelete, projects, initialData, allActions, onUpdateComment, onDeleteComment }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (a: any) => void,
  onDelete?: (id: string) => void,
  projects: Project[],
  initialData: Action | null,
  allActions: Action[],
  onUpdateComment?: (actionId: string, commentId: string, text: string) => void,
  onDeleteComment?: (actionId: string, commentId: string) => void
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
    isPinned: initialData?.isPinned || false,
    isTodo: initialData?.isTodo || false,
  });

  const [depSearch, setDepSearch] = useState('');
  const groupedActions = useMemo(() => {
    const groups: { project: Project, actions: Action[] }[] = [];
    projects.forEach(project => {
      const projectActions = allActions
        .filter(a => a.projectId === project.id && a.id !== initialData?.id)
        .filter(a => {
          if (!depSearch) return true;
          return a.name.toLowerCase().includes(depSearch.toLowerCase()) || 
                 project.name.toLowerCase().includes(depSearch.toLowerCase());
        });
      if (projectActions.length > 0) {
        groups.push({ project, actions: projectActions });
      }
    });
    return groups;
  }, [allActions, projects, depSearch, initialData]);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  if (!isOpen) return null;

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
            {initialData ? 'Modifier Action' : 'Nouvelle Action'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Dependencies Summary */}
          {formData.dependencies.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 uppercase tracking-widest">
                <Zap className="w-3 h-3 fill-current" />
                Bloqué par {formData.dependencies.length} action(s)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {formData.dependencies.map(depId => {
                  const dep = allActions.find(a => a.id === depId);
                  return (
                    <div key={depId} className="px-2 py-0.5 bg-white border border-amber-200 rounded-lg text-[10px] font-bold text-slate-700 shadow-sm">
                      {dep?.name || 'Action inconnue'}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nom de l'Action</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  placeholder="ex: Finaliser les maquettes..."
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <button 
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, isPinned: !prev.isPinned }))}
                  className={cn(
                    "p-2.5 rounded-xl border transition-all",
                    formData.isPinned ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-slate-50 border-slate-200 text-slate-400"
                  )}
                  title="Epingler"
                >
                  <Pin className={cn("w-5 h-5", formData.isPinned && "fill-current")} />
                </button>
                <button 
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, isTodo: !prev.isTodo }))}
                  className={cn(
                    "p-2.5 rounded-xl border transition-all",
                    formData.isTodo ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-400"
                  )}
                  title="Ajouter à la To-Do"
                >
                  <CheckSquare className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Projet</label>
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
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Priorité</label>
                  <select 
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: e.target.value as Priority})}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  >
                    <option value="Medium">Moyenne</option>
                    <option value="High">Haute</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Statut</label>
                <select 
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value as Status})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                >
                  <option value="To Do">To Do</option>
                  <option value="In Progress">En cours</option>
                  <option value="Blocked">Bloqué</option>
                  <option value="Done">Terminé</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Début</label>
                  <input 
                    type="date" 
                    value={formData.startDate}
                    onChange={e => handleDateChange('startDate', e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fin</label>
                  <input 
                    type="date" 
                    value={formData.endDate}
                    onChange={e => handleDateChange('endDate', e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Durée (j)</label>
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
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dépendances (Prédécesseurs)</label>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    value={depSearch}
                    onChange={e => setDepSearch(e.target.value)}
                    placeholder="Rechercher une action ou un projet..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                  {groupedActions.map(group => (
                    <div key={group.project.id} className="space-y-1.5">
                      <div className="flex items-center gap-2 px-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.project.color }} />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{group.project.name}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1 pl-4">
                        {group.actions.map(action => (
                          <label key={action.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded-md cursor-pointer transition-all group">
                            <input 
                              type="checkbox" 
                              checked={(formData.dependencies || []).includes(action.id)}
                              onChange={() => toggleDependency(action.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-slate-700 truncate group-hover:text-blue-600">{action.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {groupedActions.length === 0 && (
                    <p className="text-xs text-slate-400 italic p-2 text-center">Aucune action trouvée.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Comments Section */}
          <div className="pt-6 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Commentaires & Logs</h3>
            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddComment())}
                placeholder="Ajouter une mise à jour..."
                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
              />
              <button 
                type="button"
                onClick={handleAddComment}
                className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all active:scale-95"
              >
                Poster
              </button>
            </div>
            <div className="space-y-3">
              {comments.map(comment => (
                <div key={comment.id} className="group bg-slate-50 p-3 rounded-xl border border-slate-100 relative">
                  {editingCommentId === comment.id ? (
                    <div className="space-y-2">
                      <textarea 
                        value={editingCommentText}
                        onChange={e => setEditingCommentText(e.target.value)}
                        className="w-full p-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => setEditingCommentId(null)}
                          className="text-xs font-bold text-slate-500 px-2 py-1 hover:bg-slate-200 rounded"
                        >
                          Annuler
                        </button>
                        <button 
                          onClick={() => {
                            if (initialData && onUpdateComment) {
                              onUpdateComment(initialData.id, comment.id, editingCommentText);
                            }
                            setComments(prev => prev.map(c => c.id === comment.id ? { ...c, text: editingCommentText } : c));
                            setEditingCommentId(null);
                          }}
                          className="text-xs font-bold text-blue-600 px-2 py-1 hover:bg-blue-50 rounded"
                        >
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm text-slate-700 leading-relaxed pr-8">{comment.text}</p>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingCommentId(comment.id);
                              setEditingCommentText(comment.text);
                            }}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-blue-600"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              if (initialData && onDeleteComment) {
                                onDeleteComment(initialData.id, comment.id);
                              }
                              setComments(prev => prev.filter(c => c.id !== comment.id));
                            }}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider">
                        {format(parseISO(comment.timestamp), 'MMM d, yyyy • HH:mm')}
                      </p>
                    </>
                  )}
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-4 italic">Aucun commentaire.</p>
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
              Supprimer l'Action
            </button>
          ) : <div />}
          <div className="flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-all"
            >
              Annuler
            </button>
            <button 
              onClick={handleSubmit}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
            >
              {initialData ? 'Sauvegarder' : 'Créer Action'}
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
    category: project?.category || '',
    notes: project?.notes || '',
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">{project ? 'Modifier Projet' : 'Nouveau Projet'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-all">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nom du Projet</label>
            <input 
              autoFocus
              type="text" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="Nom du projet..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Catégorie</label>
            <input 
              type="text" 
              value={formData.category}
              onChange={e => setFormData({...formData, category: e.target.value})}
              placeholder="ex: Marketing, Tech, Client..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Statut</label>
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
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Couleur</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {PROJECT_COLORS.map(c => (
                  <button 
                    key={c}
                    type="button"
                    onClick={() => setFormData({...formData, color: c})}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-all",
                      formData.color === c ? "border-slate-900 scale-110" : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <div className="flex items-center gap-2 w-full mt-2">
                  <input 
                    type="color" 
                    value={formData.color}
                    onChange={e => setFormData({...formData, color: e.target.value})}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <input 
                    type="text" 
                    value={formData.color}
                    onChange={e => setFormData({...formData, color: e.target.value})}
                    placeholder="#hex"
                    className="flex-1 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <input 
                type="text" 
                value={formData.color}
                onChange={e => setFormData({...formData, color: e.target.value})}
                placeholder="#hex"
                className="w-full px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Début</label>
              <input 
                type="date" 
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fin</label>
              <input 
                type="date" 
                value={formData.endDate}
                onChange={e => setFormData({...formData, endDate: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description / Notes</label>
            <textarea 
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              placeholder="Notes sur le projet..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium min-h-[80px]"
            />
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
