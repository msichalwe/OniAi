/**
 * widgetRegistry — Maps widget type strings to React components and metadata.
 * Adding a new widget is just adding an entry here + creating the component.
 *
 * ── Core Widgets (dedicated UI, purpose-built) ──────────────
 *   file-explorer   — Browse and manage files
 *   terminal        — Shell sessions (multiple instances)
 *   maps            — Location / mapping (singleton)
 *   media-player    — Audio/video playback, YouTube (multiple instances)
 *   notes           — AI-managed notes (singleton)
 *   clock           — Clock & system info (singleton)
 *   calculator      — Calculator (singleton)
 *   activity-log    — Gateway activity feed (singleton)
 *   docs            — Documentation viewer (singleton)
 *   settings        — App settings (singleton)
 *   storage         — Storage manager (singleton)
 *   code-editor     — Code editing (multiple instances)
 *   document-viewer — Document reader (multiple instances)
 *   camera          — Camera capture (singleton)
 *   oni-chat        — Main AI chat (singleton)
 *
 * ── Dynamic Widget (catch-all for everything else) ──────────
 *   display         — Universal JSON renderer (multiple instances)
 *                     Handles: weather, stocks, sports, news, search results,
 *                     forex, lists, tables, code, quotes, timelines, alerts,
 *                     charts, progress bars, galleries, videos, embeds, etc.
 *                     AI sends structured JSON sections → widget renders them.
 *
 * All use cases NOT covered by a core widget should use the dynamic 'display'
 * widget. The AI can spawn multiple display instances simultaneously.
 */

import { Folder, Terminal, Film, FileText, Clock, Calculator, Activity, BookOpen, Settings, Eye, Code, Map, FileSpreadsheet, CalendarDays, ListTodo, Shield, Workflow, Database, MessageSquare, Camera, Bot, LayoutDashboard } from 'lucide-react';

import FileExplorer from '../widgets/FileExplorer/FileExplorer';
import TerminalWidget from '../widgets/Terminal/Terminal';
import DynamicDisplay from '../widgets/DynamicDisplay/DynamicDisplay';
import MediaPlayer from '../widgets/MediaPlayer/MediaPlayer';
import Notes from '../widgets/Notes/Notes';
import ClockWidget from '../widgets/Clock/Clock';
import CalculatorWidget from '../widgets/Calculator/Calculator';
import ActivityLog from '../widgets/ActivityLog/ActivityLog';
import Docs from '../widgets/Docs/Docs';
import SettingsWidget from '../widgets/Settings/Settings';
import FileViewer from '../widgets/FileViewer/FileViewer';
import CodeEditor from '../widgets/CodeEditor/CodeEditor';
import Maps from '../widgets/Maps/Maps';
import DocumentViewer from '../widgets/DocumentViewer/DocumentViewer';
import CalendarWidget from '../widgets/Calendar/Calendar';
import TaskManager from '../widgets/TaskManager/TaskManager';
import PasswordManager from '../widgets/PasswordManager/PasswordManager';
import WorkflowBuilder from '../widgets/WorkflowBuilder/WorkflowBuilder';
import StorageWidget from '../widgets/Storage/Storage';
import CameraWidget from '../widgets/Camera/Camera';
import AgentViewer from '../widgets/AgentViewer/AgentViewer';
import OniChatWidget from '../widgets/OniAssistant/OniChatWidget';

export const WIDGET_REGISTRY = {
    'file-explorer': {
        component: FileExplorer,
        title: 'File Explorer',
        icon: Folder,
        singleton: false,
        defaultWidth: 800,
        defaultHeight: 500,
        minWidth: 500,
        minHeight: 350,
        commands: ['system.files.navigate', 'system.files.openExplorer', 'system.files.list'],
    },
    'terminal': {
        component: TerminalWidget,
        title: 'Terminal',
        icon: Terminal,
        singleton: false,
        defaultWidth: 700,
        defaultHeight: 440,
        minWidth: 400,
        minHeight: 280,
        commands: ['terminal.exec', 'terminal.sendInput', 'terminal.sendCtrlC'],
    },
    'display': {
        component: DynamicDisplay,
        title: 'Display',
        icon: LayoutDashboard,
        singleton: false,
        defaultWidth: 560,
        defaultHeight: 520,
        minWidth: 360,
        minHeight: 300,
        commands: ['display.render'],
    },
    'maps': {
        component: Maps,
        title: 'Maps',
        icon: Map,
        singleton: true,
        defaultWidth: 700,
        defaultHeight: 520,
        minWidth: 400,
        minHeight: 320,
        commands: ['maps.open'],
    },
    'media-player': {
        component: MediaPlayer,
        title: 'Media Player',
        icon: Film,
        singleton: false,
        defaultWidth: 640,
        defaultHeight: 420,
        minWidth: 400,
        minHeight: 300,
        commands: ['system.media.playVideo'],
    },
    'notes': {
        component: Notes,
        title: 'Notes',
        icon: FileText,
        singleton: true,
        defaultWidth: 600,
        defaultHeight: 420,
        minWidth: 400,
        minHeight: 300,
        commands: ['document.open', 'document.create', 'document.list'],
    },
    'clock': {
        component: ClockWidget,
        title: 'Clock & System',
        icon: Clock,
        singleton: true,
        defaultWidth: 380,
        defaultHeight: 480,
        minWidth: 320,
        minHeight: 400,
        commands: ['system.info.clock'],
    },
    'calculator': {
        component: CalculatorWidget,
        title: 'Calculator',
        icon: Calculator,
        singleton: true,
        defaultWidth: 300,
        defaultHeight: 440,
        minWidth: 280,
        minHeight: 400,
        commands: ['widgets.calculator.calculate'],
    },
    'activity-log': {
        component: ActivityLog,
        title: 'Activity Log',
        icon: Activity,
        singleton: true,
        defaultWidth: 480,
        defaultHeight: 420,
        minWidth: 360,
        minHeight: 300,
        commands: ['system.activity.open'],
    },
    'docs': {
        component: Docs,
        title: 'Documentation',
        icon: BookOpen,
        singleton: true,
        defaultWidth: 780,
        defaultHeight: 520,
        minWidth: 560,
        minHeight: 380,
        commands: ['system.docs.open', 'system.docs.commands'],
    },
    'settings': {
        component: SettingsWidget,
        title: 'Settings',
        icon: Settings,
        singleton: true,
        defaultWidth: 520,
        defaultHeight: 560,
        minWidth: 400,
        minHeight: 380,
        commands: ['system.settings.open', 'system.settings.toggleTheme'],
    },
    'file-viewer': {
        component: FileViewer,
        title: 'File Viewer',
        icon: Eye,
        singleton: false,
        defaultWidth: 680,
        defaultHeight: 480,
        minWidth: 400,
        minHeight: 300,
        commands: ['viewer.openFile'],
    },
    'code-editor': {
        component: CodeEditor,
        title: 'Code Editor',
        icon: Code,
        singleton: false,
        defaultWidth: 900,
        defaultHeight: 560,
        minWidth: 600,
        minHeight: 400,
        commands: ['code.open', 'code.openProject', 'code.openFile', 'code.saveFile', 'code.saveAll', 'code.getContent', 'code.setContent', 'code.getActiveFile', 'code.getOpenFiles', 'code.closeFile'],
    },
    'document-viewer': {
        component: DocumentViewer,
        title: 'Document Viewer',
        icon: FileSpreadsheet,
        singleton: false,
        defaultWidth: 800,
        defaultHeight: 520,
        minWidth: 500,
        minHeight: 380,
        commands: ['document.open', 'document.find', 'document.search', 'document.create', 'document.getContent', 'document.index', 'document.list'],
    },
    'calendar': {
        component: CalendarWidget,
        title: 'Calendar',
        icon: CalendarDays,
        singleton: true,
        defaultWidth: 780,
        defaultHeight: 520,
        minWidth: 600,
        minHeight: 400,
        commands: ['calendar.open', 'task.add', 'task.list', 'event.add'],
    },
    'task-manager': {
        component: TaskManager,
        title: 'Task Manager',
        icon: ListTodo,
        singleton: true,
        defaultWidth: 640,
        defaultHeight: 520,
        minWidth: 480,
        minHeight: 380,
        commands: ['task.add', 'task.list', 'task.complete', 'task.delete', 'schedule.add', 'schedule.list'],
    },
    'password-manager': {
        component: PasswordManager,
        title: 'Password Manager',
        icon: Shield,
        singleton: true,
        defaultWidth: 600,
        defaultHeight: 520,
        minWidth: 460,
        minHeight: 380,
        commands: ['password.add', 'password.get', 'password.list', 'password.delete', 'password.generate', 'password.search'],
    },
    'workflow-builder': {
        component: WorkflowBuilder,
        title: 'Workflow Builder',
        icon: Workflow,
        singleton: true,
        defaultWidth: 1000,
        defaultHeight: 600,
        minWidth: 700,
        minHeight: 450,
        commands: ['workflow.create', 'workflow.run', 'workflow.list', 'workflow.get', 'workflow.delete'],
    },
    'storage': {
        component: StorageWidget,
        title: 'Storage Manager',
        icon: Database,
        singleton: true,
        defaultWidth: 900,
        defaultHeight: 560,
        minWidth: 600,
        minHeight: 400,
        commands: ['storage.open', 'storage.set', 'storage.get', 'storage.delete', 'storage.list', 'storage.stats', 'storage.export', 'storage.search'],
    },
    'camera': {
        component: CameraWidget,
        title: 'Camera',
        icon: Camera,
        singleton: true,
        defaultWidth: 640,
        defaultHeight: 520,
        minWidth: 400,
        minHeight: 350,
        commands: ['camera.open', 'camera.capture'],
    },
    'agent-viewer': {
        component: AgentViewer,
        title: 'Agent Viewer',
        icon: Bot,
        singleton: false,
        defaultWidth: 480,
        defaultHeight: 420,
        minWidth: 360,
        minHeight: 300,
        commands: ['agent.view'],
    },
    'oni-chat': {
        component: OniChatWidget,
        title: 'Oni Chat',
        icon: MessageSquare,
        singleton: true,
        defaultWidth: 400,
        defaultHeight: 560,
        minWidth: 320,
        minHeight: 400,
        commands: ['oni.chat'],
    },
};
