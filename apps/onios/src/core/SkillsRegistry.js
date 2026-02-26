/**
 * SkillsRegistry — Defines ALL AI skills with typed parameters.
 *
 * Each skill maps to one or more commandRegistry commands.
 * Skills have:
 *  - id: unique identifier (sent to AI as tool name)
 *  - group: category for organization
 *  - description: what it does (sent to AI)
 *  - parameters: typed OpenAI function-calling schema
 *  - command: the commandRegistry path to execute
 *  - buildArgs: transforms AI params → commandRegistry args
 *  - verify: optional post-execution verification
 *  - opensWidget: which widget this skill opens (for lifecycle UI)
 *
 * The AI sees skills as typed tools. When it calls one, OniChatWidget
 * executes via commandRegistry with proper args and lifecycle feedback.
 */

import { commandRegistry } from './CommandRegistry.js';
import useWindowStore from '../stores/windowStore.js';

// ─── Skill definitions ──────────────────────────────────────────

const SKILLS = [

    // ═══════════════════════════════════════════════
    // FILE EXPLORER
    // ═══════════════════════════════════════════════
    {
        id: 'open_file_explorer',
        group: 'files',
        description: 'Open the file explorer to browse files and folders',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Optional folder path to navigate to (e.g. ~/Documents)' },
            },
        },
        command: 'system.files.openExplorer',
        buildArgs: (p) => [p.path],
        opensWidget: 'file-explorer',
    },
    {
        id: 'list_folders',
        group: 'files',
        description: 'List the root-level folders (Documents, Downloads, Pictures, etc.)',
        parameters: { type: 'object', properties: {} },
        command: 'system.files.list',
        buildArgs: () => [],
    },
    {
        id: 'create_file',
        group: 'files',
        description: 'Create a new file at a specific path with optional content',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Full file path (e.g. ~/Documents/notes.md)' },
                content: { type: 'string', description: 'File content (optional)' },
            },
            required: ['path'],
        },
        command: 'system.files.createFile',
        buildArgs: (p) => [p.path, p.content || ''],
    },
    {
        id: 'create_folder',
        group: 'files',
        description: 'Create a new folder at a specific path',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Full folder path (e.g. ~/Documents/projects)' },
            },
            required: ['path'],
        },
        command: 'system.files.createFolder',
        buildArgs: (p) => [p.path],
    },
    {
        id: 'read_file',
        group: 'files',
        description: 'Read the text contents of a file',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Full file path to read' },
            },
            required: ['path'],
        },
        command: 'system.files.read',
        buildArgs: (p) => [p.path],
    },
    {
        id: 'write_file',
        group: 'files',
        description: 'Write or overwrite content to a file',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Full file path' },
                content: { type: 'string', description: 'Content to write' },
            },
            required: ['path', 'content'],
        },
        command: 'system.files.write',
        buildArgs: (p) => [p.path, p.content],
    },
    {
        id: 'delete_file',
        group: 'files',
        description: 'Delete a file or folder',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to delete' },
            },
            required: ['path'],
        },
        command: 'system.files.delete',
        buildArgs: (p) => [p.path],
    },
    {
        id: 'rename_file',
        group: 'files',
        description: 'Rename or move a file/folder',
        parameters: {
            type: 'object',
            properties: {
                from: { type: 'string', description: 'Current path' },
                to: { type: 'string', description: 'New path' },
            },
            required: ['from', 'to'],
        },
        command: 'system.files.rename',
        buildArgs: (p) => [p.from, p.to],
    },
    {
        id: 'open_file',
        group: 'files',
        description: 'Open a file in the appropriate viewer (supports text, images, video, audio, PDFs)',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Full file path to open' },
            },
            required: ['path'],
        },
        command: 'system.files.openFile',
        buildArgs: (p) => [p.path],
        opensWidget: 'file-viewer',
    },

    // ═══════════════════════════════════════════════
    // TERMINAL
    // ═══════════════════════════════════════════════
    {
        id: 'open_terminal',
        group: 'terminal',
        description: 'Open a new terminal window',
        parameters: { type: 'object', properties: {} },
        command: 'terminal.open',
        buildArgs: () => [],
        opensWidget: 'terminal',
    },
    {
        id: 'run_terminal_command',
        group: 'terminal',
        description: 'Execute a shell command in the terminal (opens terminal if not open). The command runs in a real shell.',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Shell command to execute (e.g. "ls -la", "npm install", "python3 script.py")' },
            },
            required: ['command'],
        },
        command: 'terminal.exec',
        buildArgs: (p) => [p.command],
        opensWidget: 'terminal',
    },
    {
        id: 'send_terminal_input',
        group: 'terminal',
        description: 'Send raw text input to the active terminal session',
        parameters: {
            type: 'object',
            properties: {
                input: { type: 'string', description: 'Text to send to terminal' },
            },
            required: ['input'],
        },
        command: 'terminal.sendInput',
        buildArgs: (p) => [p.input],
    },
    {
        id: 'send_ctrl_c',
        group: 'terminal',
        description: 'Send Ctrl+C (interrupt/cancel) to the active terminal',
        parameters: { type: 'object', properties: {} },
        command: 'terminal.sendCtrlC',
        buildArgs: () => [],
    },

    // ═══════════════════════════════════════════════
    // DYNAMIC DISPLAY (replaces Weather, Browser, Web Search)
    // ═══════════════════════════════════════════════
    {
        id: 'show_display',
        group: 'display',
        description: 'Open a dynamic display widget with rich content (weather, search results, data, media). Post JSON with title + sections array to /api/oni/actions/display.',
        parameters: {
            type: 'object',
            properties: {
                displayId: { type: 'string', description: 'Display data ID (returned by /api/oni/actions/display)' },
            },
            required: ['displayId'],
        },
        command: 'display.render',
        buildArgs: (p) => [p.displayId],
        opensWidget: 'display',
    },

    // ═══════════════════════════════════════════════
    // MAPS
    // ═══════════════════════════════════════════════
    {
        id: 'open_maps',
        group: 'maps',
        description: 'Open the Maps widget',
        parameters: { type: 'object', properties: {} },
        command: 'maps.open',
        buildArgs: () => [],
        opensWidget: 'maps',
    },

    // ═══════════════════════════════════════════════
    // MEDIA PLAYER
    // ═══════════════════════════════════════════════
    {
        id: 'open_media_player',
        group: 'media',
        description: 'Open the media player widget',
        parameters: { type: 'object', properties: {} },
        command: 'system.media.open',
        buildArgs: () => [],
        opensWidget: 'media-player',
    },
    {
        id: 'play_video',
        group: 'media',
        description: 'Play a video file in the media player',
        parameters: {
            type: 'object',
            properties: {
                src: { type: 'string', description: 'Video source URL or file path' },
            },
            required: ['src'],
        },
        command: 'system.media.playVideo',
        buildArgs: (p) => [p.src],
        opensWidget: 'media-player',
    },

    // ═══════════════════════════════════════════════
    // NOTES
    // ═══════════════════════════════════════════════
    {
        id: 'open_notes',
        group: 'notes',
        description: 'Open the Notes widget to view/create notes',
        parameters: { type: 'object', properties: {} },
        command: 'document.open',
        buildArgs: () => [],
        opensWidget: 'notes',
    },
    {
        id: 'create_note',
        group: 'notes',
        description: 'Create a new note/document and open it in the document viewer',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path for the note (e.g. ~/Documents/meeting-notes.md)' },
                content: { type: 'string', description: 'Note content (supports markdown)' },
            },
            required: ['path'],
        },
        command: 'document.create',
        buildArgs: (p) => [p.path, p.content || ''],
        opensWidget: 'document-viewer',
    },

    // ═══════════════════════════════════════════════
    // DOCUMENT VIEWER
    // ═══════════════════════════════════════════════
    {
        id: 'open_document',
        group: 'documents',
        description: 'Open a document (PDF, Word, Excel, text) in the document viewer',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Document file path' },
            },
        },
        command: 'document.open',
        buildArgs: (p) => [p.path],
        opensWidget: 'document-viewer',
    },
    {
        id: 'search_documents',
        group: 'documents',
        description: 'Search across all indexed documents by content',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
            },
            required: ['query'],
        },
        command: 'document.search',
        buildArgs: (p) => [p.query],
    },
    {
        id: 'list_documents',
        group: 'documents',
        description: 'List all indexed documents',
        parameters: { type: 'object', properties: {} },
        command: 'document.list',
        buildArgs: () => [],
    },
    {
        id: 'find_in_document',
        group: 'documents',
        description: 'Find text within a specific document or across all indexed documents',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Text to search for' },
                path: { type: 'string', description: 'Optional specific file path to search in' },
            },
            required: ['text'],
        },
        command: 'document.find',
        buildArgs: (p) => [p.text, p.path],
    },
    {
        id: 'get_document_content',
        group: 'documents',
        description: 'Get the text content of the active or specified document',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Optional file path (uses active document if omitted)' },
            },
        },
        command: 'document.getContent',
        buildArgs: (p) => [p.path],
    },
    {
        id: 'index_documents',
        group: 'documents',
        description: 'Index a file or folder for full-text search',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to file or folder to index' },
            },
            required: ['path'],
        },
        command: 'document.index',
        buildArgs: (p) => [p.path],
    },

    // ═══════════════════════════════════════════════
    // CLOCK
    // ═══════════════════════════════════════════════
    {
        id: 'show_clock',
        group: 'system',
        description: 'Show the clock and system info widget',
        parameters: { type: 'object', properties: {} },
        command: 'system.info.clock',
        buildArgs: () => [],
        opensWidget: 'clock',
    },

    // ═══════════════════════════════════════════════
    // CALCULATOR
    // ═══════════════════════════════════════════════
    {
        id: 'open_calculator',
        group: 'calculator',
        description: 'Open the calculator widget',
        parameters: { type: 'object', properties: {} },
        command: 'widgets.calculator.open',
        buildArgs: () => [],
        opensWidget: 'calculator',
    },
    {
        id: 'calculate',
        group: 'calculator',
        description: 'Calculate a math expression and show it in the calculator widget',
        parameters: {
            type: 'object',
            properties: {
                expression: { type: 'string', description: 'Math expression (e.g. "(245*18)/3", "sqrt(144)", "2^10")' },
            },
            required: ['expression'],
        },
        command: 'widgets.calculator.calculate',
        buildArgs: (p) => [p.expression],
        opensWidget: 'calculator',
    },

    // ═══════════════════════════════════════════════
    // ACTIVITY LOG
    // ═══════════════════════════════════════════════
    {
        id: 'open_activity_log',
        group: 'system',
        description: 'Open the activity log to see recent system events',
        parameters: { type: 'object', properties: {} },
        command: 'system.activity.open',
        buildArgs: () => [],
        opensWidget: 'activity-log',
    },

    // ═══════════════════════════════════════════════
    // DOCS (Documentation)
    // ═══════════════════════════════════════════════
    {
        id: 'open_docs',
        group: 'system',
        description: 'Open the OS documentation, optionally at a specific page',
        parameters: {
            type: 'object',
            properties: {
                page: { type: 'string', description: 'Page name (e.g. "commands", "architecture")' },
            },
        },
        command: 'system.docs.open',
        buildArgs: (p) => [p.page],
        opensWidget: 'docs',
    },

    // ═══════════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════════
    {
        id: 'open_settings',
        group: 'settings',
        description: 'Open the system settings widget',
        parameters: { type: 'object', properties: {} },
        command: 'system.settings.open',
        buildArgs: () => [],
        opensWidget: 'settings',
    },
    {
        id: 'toggle_theme',
        group: 'settings',
        description: 'Toggle between dark and light mode',
        parameters: { type: 'object', properties: {} },
        command: 'system.settings.toggleTheme',
        buildArgs: () => [],
    },

    // ═══════════════════════════════════════════════
    // CODE EDITOR
    // ═══════════════════════════════════════════════
    {
        id: 'open_code_editor',
        group: 'code',
        description: 'Open the code editor, optionally at a project path',
        parameters: {
            type: 'object',
            properties: {
                projectPath: { type: 'string', description: 'Optional project folder path' },
            },
        },
        command: 'code.open',
        buildArgs: (p) => [p.projectPath],
        opensWidget: 'code-editor',
    },
    {
        id: 'open_code_project',
        group: 'code',
        description: 'Open a project folder in the code editor',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Project folder path' },
            },
            required: ['path'],
        },
        command: 'code.openProject',
        buildArgs: (p) => [p.path],
        opensWidget: 'code-editor',
    },
    {
        id: 'open_code_file',
        group: 'code',
        description: 'Open a specific file in the code editor',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path to open in editor' },
            },
            required: ['path'],
        },
        command: 'code.openFile',
        buildArgs: (p) => [p.path],
        opensWidget: 'code-editor',
    },
    {
        id: 'save_code_file',
        group: 'code',
        description: 'Save the active file in the code editor',
        parameters: { type: 'object', properties: {} },
        command: 'code.saveFile',
        buildArgs: () => [],
    },
    {
        id: 'save_all_code_files',
        group: 'code',
        description: 'Save all modified files in the code editor',
        parameters: { type: 'object', properties: {} },
        command: 'code.saveAll',
        buildArgs: () => [],
    },
    {
        id: 'get_code_content',
        group: 'code',
        description: 'Get the content of a file open in the code editor',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path (uses active file if omitted)' },
            },
        },
        command: 'code.getContent',
        buildArgs: (p) => [p.path],
    },
    {
        id: 'set_code_content',
        group: 'code',
        description: 'Set/replace the content of a file in the code editor',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path' },
                content: { type: 'string', description: 'New content for the file' },
            },
            required: ['content'],
        },
        command: 'code.setContent',
        buildArgs: (p) => [p.path, p.content],
    },
    {
        id: 'get_active_code_file',
        group: 'code',
        description: 'Get the path of the currently active file in the code editor',
        parameters: { type: 'object', properties: {} },
        command: 'code.getActiveFile',
        buildArgs: () => [],
    },
    {
        id: 'list_open_code_files',
        group: 'code',
        description: 'List all files currently open in the code editor',
        parameters: { type: 'object', properties: {} },
        command: 'code.getOpenFiles',
        buildArgs: () => [],
    },

    // ═══════════════════════════════════════════════
    // TASKS
    // ═══════════════════════════════════════════════
    {
        id: 'create_task',
        group: 'tasks',
        description: 'Create a new task with title, optional due date/time, and priority',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Task title' },
                dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
                dueTime: { type: 'string', description: 'Due time in HH:MM format (optional)' },
                priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority level (default: medium)' },
            },
            required: ['title'],
        },
        command: 'task.add',
        buildArgs: (p) => [p.title, p.dueDate, p.dueTime, p.priority],
    },
    {
        id: 'list_tasks',
        group: 'tasks',
        description: 'List tasks, optionally filtered by status',
        parameters: {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['todo', 'in-progress', 'done'], description: 'Filter by status (optional)' },
            },
        },
        command: 'task.list',
        buildArgs: (p) => [p.status],
    },
    {
        id: 'complete_task',
        group: 'tasks',
        description: 'Mark a task as completed by its ID',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Task ID' },
            },
            required: ['id'],
        },
        command: 'task.complete',
        buildArgs: (p) => [p.id],
    },
    {
        id: 'delete_task',
        group: 'tasks',
        description: 'Delete a task by its ID',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Task ID' },
            },
            required: ['id'],
        },
        command: 'task.delete',
        buildArgs: (p) => [p.id],
    },
    {
        id: 'get_overdue_tasks',
        group: 'tasks',
        description: 'List all overdue tasks',
        parameters: { type: 'object', properties: {} },
        command: 'task.overdue',
        buildArgs: () => [],
    },
    {
        id: 'get_upcoming_tasks',
        group: 'tasks',
        description: 'List upcoming tasks within a number of days',
        parameters: {
            type: 'object',
            properties: {
                days: { type: 'number', description: 'Number of days to look ahead (default: 7)' },
            },
        },
        command: 'task.upcoming',
        buildArgs: (p) => [p.days || 7],
    },
    {
        id: 'get_task_stats',
        group: 'tasks',
        description: 'Get task statistics (total, to-do, active, done, overdue)',
        parameters: { type: 'object', properties: {} },
        command: 'task.stats',
        buildArgs: () => [],
    },
    {
        id: 'open_task_manager',
        group: 'tasks',
        description: 'Open the Task Manager widget to view and manage tasks',
        parameters: { type: 'object', properties: {} },
        command: 'taskManager.open',
        buildArgs: () => [],
        opensWidget: 'task-manager',
    },

    // ═══════════════════════════════════════════════
    // CALENDAR & EVENTS
    // ═══════════════════════════════════════════════
    {
        id: 'open_calendar',
        group: 'calendar',
        description: 'Open the calendar widget',
        parameters: { type: 'object', properties: {} },
        command: 'calendar.open',
        buildArgs: () => [],
        opensWidget: 'calendar',
    },
    {
        id: 'add_event',
        group: 'calendar',
        description: 'Add a calendar event',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Event title' },
                date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                startTime: { type: 'string', description: 'Start time HH:MM (optional)' },
                endTime: { type: 'string', description: 'End time HH:MM (optional)' },
            },
            required: ['title', 'date'],
        },
        command: 'event.add',
        buildArgs: (p) => [p.title, p.date, p.startTime, p.endTime],
    },
    {
        id: 'list_events',
        group: 'calendar',
        description: 'List calendar events, optionally filtered by date',
        parameters: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'Date to filter (YYYY-MM-DD)' },
            },
        },
        command: 'event.list',
        buildArgs: (p) => [p.date],
    },
    {
        id: 'delete_event',
        group: 'calendar',
        description: 'Delete a calendar event by ID',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Event ID' },
            },
            required: ['id'],
        },
        command: 'event.delete',
        buildArgs: (p) => [p.id],
    },
    {
        id: 'today_schedule',
        group: 'calendar',
        description: 'Show today\'s tasks and events',
        parameters: { type: 'object', properties: {} },
        command: 'calendar.today',
        buildArgs: () => [],
    },

    // ═══════════════════════════════════════════════
    // SCHEDULER (Cron-like jobs)
    // ═══════════════════════════════════════════════
    {
        id: 'add_scheduled_job',
        group: 'scheduler',
        description: 'Create a recurring scheduled job that auto-fires a command',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Job name' },
                command: { type: 'string', description: 'Command to execute (e.g. "terminal.exec(backup.sh)")' },
                interval: { type: 'number', description: 'Run interval (default: 1)' },
                unit: { type: 'string', enum: ['minutes', 'hours', 'days'], description: 'Interval unit (default: hours)' },
                at: { type: 'string', description: 'Specific time (HH:MM) for daily jobs' },
            },
            required: ['name', 'command'],
        },
        command: 'schedule.add',
        buildArgs: (p) => [p.name, p.command, p.interval, p.unit, p.at],
    },
    {
        id: 'list_scheduled_jobs',
        group: 'scheduler',
        description: 'List all scheduled/recurring jobs',
        parameters: { type: 'object', properties: {} },
        command: 'schedule.list',
        buildArgs: () => [],
    },
    {
        id: 'delete_scheduled_job',
        group: 'scheduler',
        description: 'Delete a scheduled job by ID',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Job ID' },
            },
            required: ['id'],
        },
        command: 'schedule.delete',
        buildArgs: (p) => [p.id],
    },
    {
        id: 'toggle_scheduled_job',
        group: 'scheduler',
        description: 'Enable or disable a scheduled job',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Job ID' },
            },
            required: ['id'],
        },
        command: 'schedule.toggle',
        buildArgs: (p) => [p.id],
    },

    // ═══════════════════════════════════════════════
    // PASSWORD MANAGER
    // ═══════════════════════════════════════════════
    {
        id: 'open_password_manager',
        group: 'passwords',
        description: 'Open the password manager vault',
        parameters: { type: 'object', properties: {} },
        command: 'password.open',
        buildArgs: () => [],
        opensWidget: 'password-manager',
    },
    {
        id: 'add_password',
        group: 'passwords',
        description: 'Add a new password entry to the vault',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Entry title (e.g. "GitHub")' },
                username: { type: 'string', description: 'Username or email' },
                password: { type: 'string', description: 'Password (auto-generated if omitted)' },
                url: { type: 'string', description: 'Website URL' },
                category: { type: 'string', description: 'Category (e.g. "dev", "social", "work")' },
            },
            required: ['title'],
        },
        command: 'password.add',
        buildArgs: (p) => [p.title, p.username, p.password, p.url, p.category],
    },
    {
        id: 'get_password',
        group: 'passwords',
        description: 'Get a password entry by title or ID (shows credentials)',
        parameters: {
            type: 'object',
            properties: {
                titleOrId: { type: 'string', description: 'Entry title or ID' },
            },
            required: ['titleOrId'],
        },
        command: 'password.get',
        buildArgs: (p) => [p.titleOrId],
    },
    {
        id: 'list_passwords',
        group: 'passwords',
        description: 'List password entries, optionally by category',
        parameters: {
            type: 'object',
            properties: {
                category: { type: 'string', description: 'Filter by category' },
            },
        },
        command: 'password.list',
        buildArgs: (p) => [p.category],
    },
    {
        id: 'search_passwords',
        group: 'passwords',
        description: 'Search password entries by title, username, or URL',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
            },
            required: ['query'],
        },
        command: 'password.search',
        buildArgs: (p) => [p.query],
    },
    {
        id: 'generate_password',
        group: 'passwords',
        description: 'Generate a random password and copy to clipboard',
        parameters: {
            type: 'object',
            properties: {
                length: { type: 'number', description: 'Password length (default: 16)' },
            },
        },
        command: 'password.generate',
        buildArgs: (p) => [p.length || 16],
    },

    // ═══════════════════════════════════════════════
    // WORKFLOW BUILDER
    // ═══════════════════════════════════════════════
    {
        id: 'open_workflow_builder',
        group: 'workflows',
        description: 'Open the workflow builder widget',
        parameters: { type: 'object', properties: {} },
        command: 'workflow.open',
        buildArgs: () => [],
        opensWidget: 'workflow-builder',
    },
    {
        id: 'create_workflow',
        group: 'workflows',
        description: 'Create a new workflow',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Workflow name' },
            },
            required: ['name'],
        },
        command: 'workflow.create',
        buildArgs: (p) => [p.name],
        opensWidget: 'workflow-builder',
    },
    {
        id: 'list_workflows',
        group: 'workflows',
        description: 'List all workflows',
        parameters: { type: 'object', properties: {} },
        command: 'workflow.list',
        buildArgs: () => [],
    },
    {
        id: 'run_workflow',
        group: 'workflows',
        description: 'Run a workflow by ID or name',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Workflow ID or name' },
            },
            required: ['id'],
        },
        command: 'workflow.run',
        buildArgs: (p) => [p.id],
    },
    {
        id: 'add_workflow_node',
        group: 'workflows',
        description: 'Add a node to a workflow. Types: trigger, command, condition, delay, output, transform, filter, webhook, ai_prompt',
        parameters: {
            type: 'object',
            properties: {
                workflowId: { type: 'string', description: 'Workflow ID' },
                type: { type: 'string', description: 'Node type (e.g. command, condition, delay, output, transform, ai_prompt)' },
                label: { type: 'string', description: 'Human-readable label for this node' },
                config: { type: 'string', description: 'JSON config for the node (e.g. {"action":"terminal","command":"ls -la"})' },
            },
            required: ['workflowId', 'type'],
        },
        command: 'workflow.addNode',
        buildArgs: (p) => [p.workflowId, p.type, p.label, p.config],
        opensWidget: 'workflow-builder',
    },
    {
        id: 'update_workflow_node',
        group: 'workflows',
        description: 'Update a node in a workflow (change label, config, type)',
        parameters: {
            type: 'object',
            properties: {
                workflowId: { type: 'string', description: 'Workflow ID' },
                nodeId: { type: 'string', description: 'Node ID to update' },
                updates: { type: 'string', description: 'JSON updates (e.g. {"label":"New Name","config":{"command":"echo hi"}})' },
            },
            required: ['workflowId', 'nodeId', 'updates'],
        },
        command: 'workflow.updateNode',
        buildArgs: (p) => [p.workflowId, p.nodeId, p.updates],
    },
    {
        id: 'delete_workflow_node',
        group: 'workflows',
        description: 'Delete a node from a workflow',
        parameters: {
            type: 'object',
            properties: {
                workflowId: { type: 'string', description: 'Workflow ID' },
                nodeId: { type: 'string', description: 'Node ID to delete' },
            },
            required: ['workflowId', 'nodeId'],
        },
        command: 'workflow.deleteNode',
        buildArgs: (p) => [p.workflowId, p.nodeId],
    },
    {
        id: 'connect_workflow_nodes',
        group: 'workflows',
        description: 'Connect two nodes in a workflow (create an edge from → to)',
        parameters: {
            type: 'object',
            properties: {
                workflowId: { type: 'string', description: 'Workflow ID' },
                fromNodeId: { type: 'string', description: 'Source node ID' },
                toNodeId: { type: 'string', description: 'Target node ID' },
            },
            required: ['workflowId', 'fromNodeId', 'toNodeId'],
        },
        command: 'workflow.addConnection',
        buildArgs: (p) => [p.workflowId, p.fromNodeId, p.toNodeId],
    },
    {
        id: 'disconnect_workflow_nodes',
        group: 'workflows',
        description: 'Remove a connection between nodes in a workflow',
        parameters: {
            type: 'object',
            properties: {
                workflowId: { type: 'string', description: 'Workflow ID' },
                connectionId: { type: 'string', description: 'Connection ID to remove' },
            },
            required: ['workflowId', 'connectionId'],
        },
        command: 'workflow.removeConnection',
        buildArgs: (p) => [p.workflowId, p.connectionId],
    },
    {
        id: 'get_workflow_details',
        group: 'workflows',
        description: 'Get full details of a workflow including all nodes and connections',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Workflow ID or name' },
            },
            required: ['id'],
        },
        command: 'workflow.get',
        buildArgs: (p) => [p.id],
    },

    // ═══════════════════════════════════════════════
    // TASK EDITING
    // ═══════════════════════════════════════════════
    {
        id: 'update_task',
        group: 'tasks',
        description: 'Update an existing task (change title, priority, dueDate, dueTime, or status)',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Task ID' },
                updates: { type: 'string', description: 'JSON updates (e.g. {"title":"New title","priority":"high","dueDate":"2026-03-01"})' },
            },
            required: ['id', 'updates'],
        },
        command: 'task.update',
        buildArgs: (p) => [p.id, p.updates],
    },

    // ═══════════════════════════════════════════════
    // EVENT EDITING
    // ═══════════════════════════════════════════════
    {
        id: 'update_event',
        group: 'calendar',
        description: 'Update an existing calendar event (change title, date, startTime, endTime)',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Event ID' },
                updates: { type: 'string', description: 'JSON updates (e.g. {"title":"Updated meeting","date":"2026-03-01","startTime":"14:00"})' },
            },
            required: ['id', 'updates'],
        },
        command: 'event.update',
        buildArgs: (p) => [p.id, p.updates],
    },

    // ═══════════════════════════════════════════════
    // STORAGE MANAGER
    // ═══════════════════════════════════════════════
    {
        id: 'open_storage',
        group: 'storage',
        description: 'Open the storage manager widget',
        parameters: { type: 'object', properties: {} },
        command: 'storage.open',
        buildArgs: () => [],
        opensWidget: 'storage',
    },
    {
        id: 'storage_set',
        group: 'storage',
        description: 'Set a value in namespaced app storage',
        parameters: {
            type: 'object',
            properties: {
                namespace: { type: 'string', description: 'Storage namespace' },
                key: { type: 'string', description: 'Key name' },
                value: { type: 'string', description: 'Value to store (JSON string for objects)' },
            },
            required: ['namespace', 'key', 'value'],
        },
        command: 'storage.set',
        buildArgs: (p) => [p.namespace, p.key, p.value],
    },
    {
        id: 'storage_get',
        group: 'storage',
        description: 'Get a value from namespaced app storage',
        parameters: {
            type: 'object',
            properties: {
                namespace: { type: 'string', description: 'Storage namespace' },
                key: { type: 'string', description: 'Key name' },
            },
            required: ['namespace', 'key'],
        },
        command: 'storage.get',
        buildArgs: (p) => [p.namespace, p.key],
    },
    {
        id: 'storage_list',
        group: 'storage',
        description: 'List storage namespaces or keys within a namespace',
        parameters: {
            type: 'object',
            properties: {
                namespace: { type: 'string', description: 'Namespace to list keys for (omit to list all namespaces)' },
            },
        },
        command: 'storage.list',
        buildArgs: (p) => [p.namespace],
    },
    {
        id: 'storage_stats',
        group: 'storage',
        description: 'Show storage usage statistics',
        parameters: { type: 'object', properties: {} },
        command: 'storage.stats',
        buildArgs: () => [],
    },

    // ═══════════════════════════════════════════════
    // CAMERA
    // ═══════════════════════════════════════════════
    {
        id: 'open_camera',
        group: 'camera',
        description: 'Open the camera widget to view live camera feed',
        parameters: { type: 'object', properties: {} },
        command: 'camera.open',
        buildArgs: () => [],
        opensWidget: 'camera',
    },
    {
        id: 'take_photo',
        group: 'camera',
        description: 'Take a photo with the camera. Opens camera if not already open.',
        parameters: { type: 'object', properties: {} },
        command: 'camera.capture',
        buildArgs: () => [],
        opensWidget: 'camera',
    },
    {
        id: 'list_photos',
        group: 'camera',
        description: 'List all captured photos from the camera',
        parameters: { type: 'object', properties: {} },
        command: 'camera.listPhotos',
        buildArgs: () => [],
    },

    // ═══════════════════════════════════════════════
    // SCREEN CAPTURE
    // ═══════════════════════════════════════════════
    {
        id: 'open_screen_capture',
        group: 'screen',
        description: 'Open the screen capture widget for screenshots and screen recording',
        parameters: { type: 'object', properties: {} },
        command: 'screen.open',
        buildArgs: () => [],
        opensWidget: 'screen-capture',
    },
    {
        id: 'take_screenshot',
        group: 'screen',
        description: 'Take a screenshot of the entire screen or a specific window. The user will be prompted to select what to capture.',
        parameters: { type: 'object', properties: {} },
        command: 'screen.screenshot',
        buildArgs: () => [],
        opensWidget: 'screen-capture',
    },
    {
        id: 'start_screen_recording',
        group: 'screen',
        description: 'Start recording the screen or a specific window. The user will be prompted to select what to record.',
        parameters: { type: 'object', properties: {} },
        command: 'screen.record.start',
        buildArgs: () => [],
        opensWidget: 'screen-capture',
    },
    {
        id: 'stop_screen_recording',
        group: 'screen',
        description: 'Stop the current screen recording and save the video file.',
        parameters: { type: 'object', properties: {} },
        command: 'screen.record.stop',
        buildArgs: () => [],
    },

    // ═══════════════════════════════════════════════
    // SUB-AGENTS
    // ═══════════════════════════════════════════════
    {
        id: 'spawn_agent',
        group: 'agents',
        description: 'Spawn a sub-agent for a parallel or long-running task. Opens an AgentViewer widget to monitor it.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Human-readable name for the agent (e.g. "Research Agent", "File Organizer")' },
                task: { type: 'string', description: 'Description of what the agent should do' },
            },
            required: ['name', 'task'],
        },
        command: 'agent.spawn',
        buildArgs: (p) => [p.name, p.task],
        opensWidget: 'agent-viewer',
    },
    {
        id: 'list_agents',
        group: 'agents',
        description: 'List all sub-agents and their current statuses',
        parameters: { type: 'object', properties: {} },
        command: 'agent.list',
        buildArgs: () => [],
    },
    {
        id: 'get_agent',
        group: 'agents',
        description: 'Get detailed info about a specific sub-agent',
        parameters: {
            type: 'object',
            properties: {
                agentId: { type: 'string', description: 'Agent ID' },
            },
            required: ['agentId'],
        },
        command: 'agent.get',
        buildArgs: (p) => [p.agentId],
    },
    {
        id: 'cancel_agent',
        group: 'agents',
        description: 'Cancel a running sub-agent',
        parameters: {
            type: 'object',
            properties: {
                agentId: { type: 'string', description: 'Agent ID to cancel' },
            },
            required: ['agentId'],
        },
        command: 'agent.cancel',
        buildArgs: (p) => [p.agentId],
    },
    {
        id: 'message_agent',
        group: 'agents',
        description: 'Send a message to a sub-agent',
        parameters: {
            type: 'object',
            properties: {
                agentId: { type: 'string', description: 'Agent ID to message' },
                message: { type: 'string', description: 'Message content' },
            },
            required: ['agentId', 'message'],
        },
        command: 'agent.message',
        buildArgs: (p) => [p.agentId, p.message],
    },
    {
        id: 'view_agent',
        group: 'agents',
        description: 'Open the AgentViewer widget to watch a sub-agent work',
        parameters: {
            type: 'object',
            properties: {
                agentId: { type: 'string', description: 'Agent ID to view' },
            },
            required: ['agentId'],
        },
        command: 'agent.view',
        buildArgs: (p) => [p.agentId],
        opensWidget: 'agent-viewer',
    },
    {
        id: 'update_agent_status',
        group: 'agents',
        description: 'Update a sub-agent status (working, waiting, paused, completed, failed)',
        parameters: {
            type: 'object',
            properties: {
                agentId: { type: 'string', description: 'Agent ID' },
                status: { type: 'string', description: 'New status: working, waiting, paused, completed, failed' },
            },
            required: ['agentId', 'status'],
        },
        command: 'agent.updateStatus',
        buildArgs: (p) => [p.agentId, p.status],
    },
    {
        id: 'agent_log',
        group: 'agents',
        description: 'Add a log entry to a sub-agent (visible in AgentViewer)',
        parameters: {
            type: 'object',
            properties: {
                agentId: { type: 'string', description: 'Agent ID' },
                type: { type: 'string', description: 'Log type: system, tool, thinking, message, result, error' },
                content: { type: 'string', description: 'Log content' },
            },
            required: ['agentId', 'content'],
        },
        command: 'agent.log',
        buildArgs: (p) => [p.agentId, p.type || 'system', p.content],
    },
    {
        id: 'agent_set_result',
        group: 'agents',
        description: 'Set a sub-agent final result and mark as completed',
        parameters: {
            type: 'object',
            properties: {
                agentId: { type: 'string', description: 'Agent ID' },
                result: { type: 'string', description: 'The final result/output of the agent' },
            },
            required: ['agentId', 'result'],
        },
        command: 'agent.setResult',
        buildArgs: (p) => [p.agentId, p.result],
    },

    // ═══════════════════════════════════════════════
    // WINDOW MANAGEMENT
    // ═══════════════════════════════════════════════
    {
        id: 'list_windows',
        group: 'windows',
        description: 'List all currently open windows with their IDs, types, and available commands',
        parameters: { type: 'object', properties: {} },
        command: 'system.windows.list',
        buildArgs: () => [],
    },
    {
        id: 'close_window',
        group: 'windows',
        description: 'Close a window by its ID',
        parameters: {
            type: 'object',
            properties: {
                windowId: { type: 'string', description: 'Window ID to close' },
            },
            required: ['windowId'],
        },
        command: 'system.windows.close',
        buildArgs: (p) => [p.windowId],
    },
    {
        id: 'focus_window',
        group: 'windows',
        description: 'Bring a window to the front by its ID',
        parameters: {
            type: 'object',
            properties: {
                windowId: { type: 'string', description: 'Window ID to focus' },
            },
            required: ['windowId'],
        },
        command: 'system.windows.focus',
        buildArgs: (p) => [p.windowId],
    },
    {
        id: 'minimize_window',
        group: 'windows',
        description: 'Minimize a window by its ID',
        parameters: {
            type: 'object',
            properties: {
                windowId: { type: 'string', description: 'Window ID' },
            },
            required: ['windowId'],
        },
        command: 'system.windows.minimize',
        buildArgs: (p) => [p.windowId],
    },
    {
        id: 'maximize_window',
        group: 'windows',
        description: 'Maximize or restore a window by its ID',
        parameters: {
            type: 'object',
            properties: {
                windowId: { type: 'string', description: 'Window ID' },
            },
            required: ['windowId'],
        },
        command: 'system.windows.maximize',
        buildArgs: (p) => [p.windowId],
    },
    {
        id: 'close_all_windows',
        group: 'windows',
        description: 'Close all open windows',
        parameters: { type: 'object', properties: {} },
        command: 'system.windows.closeAll',
        buildArgs: () => [],
    },
    {
        id: 'get_screen_summary',
        group: 'windows',
        description: 'Get a human-readable summary of what is on screen right now',
        parameters: { type: 'object', properties: {} },
        command: 'system.windows.summary',
        buildArgs: () => [],
    },

    // ═══════════════════════════════════════════════
    // DESKTOP MANAGEMENT
    // ═══════════════════════════════════════════════
    {
        id: 'list_desktops',
        group: 'desktops',
        description: 'List all virtual desktops and their window counts',
        parameters: { type: 'object', properties: {} },
        command: 'desktop.list',
        buildArgs: () => [],
    },
    {
        id: 'add_desktop',
        group: 'desktops',
        description: 'Create a new virtual desktop',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Desktop name (optional)' },
            },
        },
        command: 'desktop.add',
        buildArgs: (p) => [p.name],
    },
    {
        id: 'switch_desktop',
        group: 'desktops',
        description: 'Switch to a desktop by number (1-based) or ID',
        parameters: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Desktop number (1, 2, 3...) or desktop ID' },
            },
            required: ['target'],
        },
        command: 'desktop.switch',
        buildArgs: (p) => [p.target],
    },
    {
        id: 'rename_desktop',
        group: 'desktops',
        description: 'Rename a virtual desktop',
        parameters: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Desktop number or ID' },
                name: { type: 'string', description: 'New name' },
            },
            required: ['target', 'name'],
        },
        command: 'desktop.rename',
        buildArgs: (p) => [p.target, p.name],
    },
    {
        id: 'move_window_to_desktop',
        group: 'desktops',
        description: 'Move a window to another virtual desktop',
        parameters: {
            type: 'object',
            properties: {
                windowId: { type: 'string', description: 'Window ID to move' },
                desktopNumber: { type: 'number', description: 'Target desktop number (1-based)' },
            },
            required: ['windowId', 'desktopNumber'],
        },
        command: 'desktop.moveWindow',
        buildArgs: (p) => [p.windowId, p.desktopNumber],
    },

    // ═══════════════════════════════════════════════
    // SYSTEM / NOTIFICATIONS
    // ═══════════════════════════════════════════════
    {
        id: 'send_notification',
        group: 'system',
        description: 'Send a system notification message to the user',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Notification message' },
            },
            required: ['message'],
        },
        command: 'system.notify',
        buildArgs: (p) => [p.message],
    },
    {
        id: 'set_reminder',
        group: 'system',
        description: 'Set a reminder notification',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Reminder text' },
            },
            required: ['text'],
        },
        command: 'system.setReminder',
        buildArgs: (p) => [p.text],
    },

    // ═══════════════════════════════════════════════
    // SEARCH (Universal)
    // ═══════════════════════════════════════════════
    {
        id: 'universal_search',
        group: 'search',
        description: 'Search across everything: commands, windows, files, and documents',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
            },
            required: ['query'],
        },
        command: 'search.all',
        buildArgs: (p) => [p.query],
    },

    // ═══════════════════════════════════════════════
    // CONTEXT AWARENESS (for AI introspection)
    // ═══════════════════════════════════════════════
    {
        id: 'get_os_context',
        group: 'context',
        description: 'Get a full snapshot of the OS context: all open windows, widget states, documents, files',
        parameters: { type: 'object', properties: {} },
        command: 'context.summary',
        buildArgs: () => [],
    },
    {
        id: 'get_widget_state',
        group: 'context',
        description: 'Get the live state of a specific widget type (what it is currently showing/doing)',
        parameters: {
            type: 'object',
            properties: {
                widgetType: { type: 'string', description: 'Widget type (e.g. "file-explorer", "terminal", "calendar", "code-editor")' },
            },
            required: ['widgetType'],
        },
        command: 'context.widget',
        buildArgs: (p) => [p.widgetType],
    },
    {
        id: 'get_all_widget_states',
        group: 'context',
        description: 'Get readable summary of all active widget live states',
        parameters: { type: 'object', properties: {} },
        command: 'context.widgets',
        buildArgs: () => [],
    },
    {
        id: 'get_focused_window',
        group: 'context',
        description: 'Get info about the currently focused window and its live state',
        parameters: { type: 'object', properties: {} },
        command: 'context.focused',
        buildArgs: () => [],
    },
];

// ─── Skills Registry Class ──────────────────────────────────────

class SkillsRegistry {
    constructor(skills) {
        this._skills = new Map();
        this._byGroup = new Map();
        for (const skill of skills) {
            this._skills.set(skill.id, skill);
            if (!this._byGroup.has(skill.group)) this._byGroup.set(skill.group, []);
            this._byGroup.get(skill.group).push(skill);
        }
    }

    /** Get a skill by ID */
    get(id) {
        return this._skills.get(id) || null;
    }

    /** Get all skills */
    all() {
        return Array.from(this._skills.values());
    }

    /** Get skills by group */
    byGroup(group) {
        return this._byGroup.get(group) || [];
    }

    /** Get all group names */
    groups() {
        return Array.from(this._byGroup.keys());
    }

    /**
     * Convert ALL skills to OpenAI tools format.
     */
    toOpenAITools() {
        return this.all().map(skill => ({
            type: 'function',
            function: {
                name: skill.id,
                description: skill.description,
                parameters: skill.parameters,
            },
        }));
    }

    /**
     * Get a curated set of ~30 primary skills for the AI.
     * OpenAI models work best with ≤30 tools. All skills remain
     * available for execution, but only primaries are sent as tools.
     */
    toPrimaryTools() {
        const PRIMARY_IDS = new Set([
            // Files
            'open_file_explorer', 'create_file', 'read_file', 'write_file',
            // Terminal
            'open_terminal', 'run_terminal_command',
            // Display (dynamic content — weather, search, data, media)
            'show_display',
            // Notes & Documents
            'create_note', 'open_notes', 'search_documents', 'list_documents',
            // Calculator
            'calculate',
            // Tasks
            'create_task', 'list_tasks', 'complete_task', 'open_task_manager',
            // Calendar
            'open_calendar', 'add_event', 'today_schedule',
            // Settings
            'toggle_theme', 'open_settings',
            // Code
            'open_code_editor', 'open_code_file',
            // System
            'send_notification', 'list_windows', 'get_screen_summary',
            // Passwords
            'open_password_manager',
            // Workflows
            'open_workflow_builder', 'list_workflows',
            // Scheduler
            'add_scheduled_job', 'list_scheduled_jobs',
            // Context
            'get_os_context', 'get_widget_state',
        ]);

        const tools = this.all()
            .filter(s => PRIMARY_IDS.has(s.id))
            .map(skill => ({
                type: 'function',
                function: {
                    name: skill.id,
                    description: skill.description,
                    parameters: skill.parameters,
                },
            }));

        // Escape-hatch: when tool_choice is 'required', the model calls this
        // for conversational messages that don't need a real action.
        tools.push({
            type: 'function',
            function: {
                name: 'respond_to_user',
                description: 'Use this tool ONLY when the user is asking a question, having a conversation, or when no other tool is appropriate. Pass your full response as the message parameter.',
                parameters: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', description: 'Your natural language response to the user' },
                    },
                    required: ['message'],
                },
            },
        });

        return tools;
    }

    /**
     * Build a skills summary string for the system prompt.
     * Groups skills by category so the AI understands what it can do.
     */
    buildSkillsSummary() {
        const lines = ['## Your Skills (what you can actually do)\n'];
        for (const [group, skills] of this._byGroup) {
            lines.push(`### ${group.charAt(0).toUpperCase() + group.slice(1)}`);
            for (const s of skills) {
                const params = s.parameters?.properties
                    ? Object.entries(s.parameters.properties)
                        .map(([k, v]) => `${k}: ${v.type}`)
                        .join(', ')
                    : '';
                const required = s.parameters?.required?.length
                    ? ` [required: ${s.parameters.required.join(', ')}]`
                    : '';
                lines.push(`- **${s.id}**(${params})${required} — ${s.description}`);
            }
            lines.push('');
        }
        lines.push('IMPORTANT: Only use skills listed above. Do NOT hallucinate capabilities you don\'t have.');
        lines.push('When you use a skill, the action happens LIVE on screen — widgets open, files get created, terminals run commands.');
        lines.push('Always use the correct parameters. If a skill requires a path, provide a valid path.');
        return lines.join('\n');
    }

    /**
     * Execute a skill by ID with parameters.
     * Uses commandRegistry under the hood.
     * Returns { success, result, error, command, opensWidget }
     */
    async execute(skillId, params = {}) {
        const skill = this._skills.get(skillId);
        if (!skill) {
            return { success: false, result: null, error: `Unknown skill: ${skillId}`, command: null, opensWidget: null };
        }

        const args = skill.buildArgs(params);
        const command = skill.command;

        // Build the command string for commandRegistry
        const quotedArgs = args
            .filter(a => a !== undefined && a !== null)
            .map(a => typeof a === 'string' ? `"${a.replace(/"/g, '\\"')}"` : String(a));

        const cmdStr = quotedArgs.length > 0
            ? `${command}(${quotedArgs.join(', ')})`
            : `${command}()`;

        try {
            const handle = commandRegistry.execute(cmdStr, 'ai');
            const run = await handle.await();

            if (!run) {
                return { success: false, result: null, error: 'Command did not complete', command: cmdStr, opensWidget: skill.opensWidget };
            }

            if (run.status === 'rejected') {
                return { success: false, result: null, error: run.error || 'Command failed', command: cmdStr, opensWidget: skill.opensWidget };
            }

            const output = run.output;
            const result = typeof output === 'object' ? JSON.stringify(output) : (output ?? 'Done');

            return { success: true, result, error: null, command: cmdStr, opensWidget: skill.opensWidget };
        } catch (err) {
            return { success: false, result: null, error: err.message, command: cmdStr, opensWidget: skill.opensWidget };
        }
    }

    /**
     * Get open widget context — what widgets are currently open
     * and what commands they support. This is sent to the AI
     * so it knows what it can interact with.
     */
    getOpenWidgetContext() {
        const windows = useWindowStore.getState().windows || [];
        if (windows.length === 0) return 'No widgets currently open.';

        const lines = ['## Currently Open Widgets'];
        for (const w of windows) {
            if (w.isMinimized) continue;
            const skills = this.all().filter(s => s.opensWidget === w.widgetType);
            const skillNames = skills.map(s => s.id).join(', ');
            lines.push(`- **${w.title || w.widgetType}** (ID: ${w.id?.slice(0, 6)}, type: ${w.widgetType})${skillNames ? ` — skills: ${skillNames}` : ''}`);
        }
        return lines.join('\n');
    }
}

// ─── Singleton ──────────────────────────────────────────────────

export const skillsRegistry = new SkillsRegistry(SKILLS);
export default skillsRegistry;
