// State Management
let state = {
    boards: {},
    sections: {},
    tasks: {},
    activeBoard: null
};

// DOM Elements placeholder
let elements = {};

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = prefersDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Board Management
async function loadBoards() {
    try {
        if (!window.appConfig) {
            console.error('Configuration not loaded');
            return;
        }

        // Add cache-busting query parameter and no-cache headers
        const response = await fetch(`${window.appConfig.basePath}/api/boards?_t=${Date.now()}`, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (errorData.offline) {
                console.warn('Application is offline, using cached data if available');
                // Continue with empty state but don't show error
                state = {
                    boards: {},
                    sections: {},
                    tasks: {},
                    activeBoard: null
                };
                renderBoards();
                return;
            }
            throw new Error(`Failed to load boards: ${response.status} - ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        
        // Validate the data structure
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid data structure received');
        }

        // Initialize state with empty objects if they don't exist
        state = {
            boards: data.boards || {},
            sections: data.sections || {},
            tasks: data.tasks || {},
            activeBoard: data.activeBoard || null
        };
        
        // Ensure we have a valid active board
        if (!state.activeBoard || !state.boards[state.activeBoard]) {
            const firstBoard = Object.keys(state.boards)[0];
            if (firstBoard) {
                state.activeBoard = firstBoard;
            }
        }

        // Only render if we have valid data
        if (Object.keys(state.boards).length > 0) {
        renderBoards();
        renderActiveBoard();
        } else {
            console.warn('No boards found in the loaded data');
            // Initialize empty state but still render to show empty state
            state = {
                boards: {},
                sections: {},
                tasks: {},
                activeBoard: null
            };
            renderBoards();
        }
    } catch (error) {
        console.error('Failed to load boards:', error);
        // Initialize empty state on error
        state = {
            boards: {},
            sections: {},
            tasks: {},
            activeBoard: null
        };
        
        // Show offline message if appropriate
        if (!navigator.onLine) {
            console.warn('Browser is offline, using empty state');
        }
        
        renderBoards();
        
        // Update UI to show error state
        if (elements.currentBoard) {
            elements.currentBoard.textContent = navigator.onLine ? 'Error Loading Boards' : 'Offline';
        }
    }
}

function renderBoards() {
    if (!elements.boardList) return;
    
    elements.boardList.innerHTML = '';
    if (!state.boards) return;

    Object.values(state.boards).forEach(board => {
        if (!board) return;
        
        const li = document.createElement('li');
        li.textContent = board.name || 'Unnamed Board';
        li.dataset.boardId = board.id;
        if (board.id === state.activeBoard) li.classList.add('active');
        
        makeEditable(li, async (newName) => {
            try {
                const response = await fetch(`${window.appConfig.basePath}/api/boards/${board.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                });
                
                if (response.ok) {
                    const updatedBoard = await response.json();
                    state.boards[board.id] = updatedBoard;
                    if (board.id === state.activeBoard) {
                        elements.currentBoard.textContent = newName;
                    }
                    return true;
                }
                return false;
            } catch (error) {
                console.error('Failed to update board name:', error);
                return false;
            }
        });
        
        li.addEventListener('click', (e) => {
            // Only switch board if not clicking on the editable input
            if (e.target.tagName !== 'INPUT') {
                switchBoard(board.id);
            }
        });
        
        elements.boardList.appendChild(li);
    });
}

async function switchBoard(boardId) {
    try {
        const response = await fetch(window.appConfig.basePath + '/api/boards/active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ boardId })
        });
        if (response.ok) {
            state.activeBoard = boardId;
            elements.currentBoard.textContent = state.boards[boardId].name;
            renderActiveBoard();
            elements.boardMenu.hidden = true;
        }
    } catch (error) {
        console.error('Failed to switch board:', error);
    }
}

async function createBoard(name) {
    try {
        const response = await fetch(window.appConfig.basePath + '/api/boards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            const board = await response.json();
            state.boards[board.id] = board;
        renderBoards();
            switchBoard(board.id);
        }
    } catch (error) {
        console.error('Failed to create board:', error);
    }
}

// Column Management (UI terminology)
async function addColumn(boardId) {
    const name = prompt('Enter column name:');
    if (!name) return;

    try {
        const response = await fetch(`${window.appConfig.basePath}/api/boards/${boardId}/sections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            const section = await response.json();
            state.sections[section.id] = section;
            state.boards[boardId].sectionOrder.push(section.id);
            renderActiveBoard();
        }
    } catch (error) {
        console.error('Failed to add column:', error);
    }
}

// Task Management
function showTaskModal(task) {
    if (!elements.taskModal) return;
    
    const isNewTask = !task.id;
    elements.taskModal.querySelector('h2').textContent = isNewTask ? 'Add Task' : 'Edit Task';
    elements.taskTitle.value = isNewTask ? '' : task.title;
    elements.taskDescription.value = isNewTask ? '' : (task.description || '');
    elements.taskForm.dataset.taskId = task.id || '';
    elements.taskForm.dataset.sectionId = task.sectionId;
    
    // Show/hide delete button based on whether it's a new task
    const deleteBtn = elements.taskModal.querySelector('.btn-delete');
    if (deleteBtn) {
        deleteBtn.hidden = isNewTask;
        deleteBtn.classList.remove('confirm');
        // Update button content to include check icon
        deleteBtn.innerHTML = `
            <span class="button-text">Delete Task</span>
            <svg class="confirm-check" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        let confirmTimeout;
        deleteBtn.onclick = isNewTask ? null : (e) => {
            if (!deleteBtn.classList.contains('confirm')) {
                e.preventDefault();
                deleteBtn.classList.add('confirm');
                deleteBtn.querySelector('.button-text').textContent = 'You Sure?';
                // Reset confirmation state after 3 seconds
                confirmTimeout = setTimeout(() => {
                    deleteBtn.classList.remove('confirm');
                    deleteBtn.querySelector('.button-text').textContent = 'Delete Task';
                }, 3000);
            } else {
                clearTimeout(confirmTimeout);
                deleteBtn.classList.remove('confirm');
                deleteBtn.querySelector('.button-text').textContent = 'Delete Task';
            }
        };
        // Reset confirmation state when modal is closed
        const resetConfirmation = () => {
            clearTimeout(confirmTimeout);
            deleteBtn.classList.remove('confirm');
            deleteBtn.querySelector('.button-text').textContent = 'Delete Task';
        };
        elements.taskModal.querySelector('.modal-close').addEventListener('click', resetConfirmation);
        elements.taskForm.addEventListener('submit', resetConfirmation);
    }
    
    elements.taskModal.hidden = false;
    elements.taskTitle.focus();
}

function hideTaskModal() {
    if (!elements.taskModal) return;
    const deleteBtn = elements.taskModal.querySelector('.btn-delete');
    if (deleteBtn) {
        deleteBtn.classList.remove('confirm');
    }
    elements.taskModal.hidden = true;
    elements.taskForm.reset();
    delete elements.taskForm.dataset.taskId;
    delete elements.taskForm.dataset.sectionId;
}

async function addTask(sectionId, title, description = '') {
    try {
        if (!sectionId) {
            console.error('Section ID is required to add a task');
            return;
        }
        
        const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/sections/${sectionId}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to add task: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Make sure the section exists in state
        if (!state.sections[sectionId]) {
            console.error('Section not found in state:', sectionId);
            return;
        }
        
        state.tasks[data.id] = data;
        state.sections[sectionId].taskIds.push(data.id);
        renderActiveBoard();
    } catch (error) {
        console.error('Failed to add task:', error);
    }
}

// Drag and Drop
function handleDragStart(e) {
    const task = e.target.closest('.task');
    const columnHeader = e.target.closest('.column-header');
    
    if (task && !columnHeader) {
    task.classList.add('dragging');
    e.dataTransfer.setData('application/json', JSON.stringify({
        taskId: task.dataset.taskId,
            sourceSectionId: task.closest('.column').dataset.sectionId,
            type: 'task'
        }));
    } else if (columnHeader) {
        const column = columnHeader.closest('.column');
        if (column) {
            column.classList.add('dragging');
            e.dataTransfer.setData('application/json', JSON.stringify({
                sectionId: column.dataset.sectionId,
                type: 'section'
            }));
        }
    }
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    document.querySelectorAll('.task.dragging, .column.dragging').forEach(el => {
        el.classList.remove('dragging');
    });
    document.querySelectorAll('.column').forEach(col => {
        col.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const column = e.target.closest('.column');
    if (!column) return;
    
    const draggingTask = document.querySelector('.task.dragging');
    if (draggingTask) {
        column.classList.add('drag-over');
        const tasksContainer = column.querySelector('.tasks');
        if (!tasksContainer) return;

        const siblings = [...tasksContainer.querySelectorAll('.task:not(.dragging)')];
        const nextSibling = siblings.find(sibling => {
            const rect = sibling.getBoundingClientRect();
            return e.clientY < rect.top + rect.height / 2;
        });
        
        if (nextSibling) {
            tasksContainer.insertBefore(draggingTask, nextSibling);
        } else {
            tasksContainer.appendChild(draggingTask);
        }
    } else {
        const draggingColumn = document.querySelector('.column.dragging');
        if (draggingColumn) {
            const columns = [...document.querySelectorAll('.column:not(.dragging)')];
            const afterElement = getDragAfterElement(columns, e.clientX);
            
            if (afterElement) {
                column.parentNode.insertBefore(draggingColumn, afterElement);
            } else {
                column.parentNode.appendChild(draggingColumn);
            }
        }
    }
}

async function handleDrop(e) {
    e.preventDefault();
    const column = e.target.closest('.column');
    if (!column) return;
    
    column.classList.remove('drag-over');
    
    try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        
        if (data.type === 'task') {
            const { taskId, sourceSectionId } = data;
            const targetSectionId = column.dataset.sectionId;
            const tasksContainer = column.querySelector('.tasks');
            if (!tasksContainer) return;
        
        const task = document.querySelector(`[data-task-id="${taskId}"]`);
        if (!task) return;
        
            const siblings = [...tasksContainer.querySelectorAll('.task')];
            const newIndex = siblings.indexOf(task);

            await handleTaskMove(taskId, sourceSectionId, targetSectionId, newIndex);
        } else if (data.type === 'section') {
            const { sectionId } = data;
            const columns = [...document.querySelectorAll('.column')];
            const newIndex = columns.indexOf(column);
            
            if (newIndex !== -1) {
                await handleSectionMove(sectionId, newIndex);
            }
        }
    } catch (error) {
        console.error('Error handling drop:', error);
        loadBoards();
    }
}

// Rendering
function renderActiveBoard() {
    // Early validation of board existence
    if (!state.activeBoard || !state.boards) {
        console.warn('No active board or boards state available');
        if (elements.currentBoard) {
            elements.currentBoard.textContent = 'No Board Selected';
        }
        if (elements.columns) {
            elements.columns.innerHTML = '';
        }
            return;
        }

    const board = state.boards[state.activeBoard];
    if (!board) {
        console.warn('Active board not found in boards state');
        if (elements.currentBoard) {
            elements.currentBoard.textContent = 'Board Not Found';
        }
        if (elements.columns) {
            elements.columns.innerHTML = '';
        }
            return;
        }

    if (!elements.currentBoard || !elements.columns) {
        console.error('Required DOM elements not found');
                return;
            }
            
    // Update board name and make it editable
    elements.currentBoard.textContent = board.name || 'Unnamed Board';
    makeEditable(elements.currentBoard, async (newName) => {
        try {
            const response = await fetch(`${window.appConfig.basePath}/api/boards/${board.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            
            if (response.ok) {
                const updatedBoard = await response.json();
                state.boards[board.id] = updatedBoard;
                renderBoards(); // Update the board list to reflect the change
                return true;
            }
            return false;
    } catch (error) {
            console.error('Failed to update board name:', error);
            return false;
        }
    });
    elements.columns.innerHTML = '';

    // Ensure sectionOrder exists and is an array
    if (!board.sectionOrder || !Array.isArray(board.sectionOrder)) {
        console.warn(`Invalid or missing sectionOrder for board: ${board.id}`);
        board.sectionOrder = [];
    }
    
    // Render sections
    board.sectionOrder.forEach(sectionId => {
        if (!sectionId) {
            console.warn('Null or undefined section ID found in sectionOrder');
            return;
        }
        
        const section = state.sections?.[sectionId];
        if (!section) {
            console.warn(`Section ${sectionId} not found in state`);
            return;
        }

        const columnEl = renderColumn(section);
        if (columnEl) {
        elements.columns.appendChild(columnEl);
        }
    });

    // Add the "Add Column" button
    const addColumnBtn = document.createElement('button');
    addColumnBtn.className = 'add-column-btn';
    addColumnBtn.setAttribute('aria-label', 'Add new column');
    addColumnBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    `;
    addColumnBtn.addEventListener('click', () => addColumn(board.id));
    elements.columns.appendChild(addColumnBtn);
}

// Event Listeners
function initEventListeners() {
    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Board menu
    elements.boardMenuBtn.addEventListener('click', () => {
        elements.boardMenu.hidden = !elements.boardMenu.hidden;
    });

    // Close board menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.boardMenu.hidden &&
            !elements.boardMenu.contains(e.target) &&
            !elements.boardMenuBtn.contains(e.target)) {
            elements.boardMenu.hidden = true;
        }
    });

    // Add board button
    elements.addBoardBtn.addEventListener('click', () => {
        const name = prompt('Enter board name:');
        if (name) createBoard(name);
    });

    // Task modal close button
    const modalClose = elements.taskModal?.querySelector('.modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            hideTaskModal();
        });
    }

    // Close task modal when clicking outside
    elements.taskModal?.addEventListener('click', (e) => {
            if (e.target === elements.taskModal) {
                hideTaskModal();
            }
        });

    // Task form submission
        elements.taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const taskId = elements.taskForm.dataset.taskId;
        const sectionId = elements.taskForm.dataset.sectionId;
            const title = elements.taskTitle.value.trim();
            const description = elements.taskDescription.value.trim();

        if (!title) return;

            try {
            if (taskId) {
                // Update existing task
                const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/sections/${sectionId}/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description })
                });
                
                if (response.ok) {
                    const updatedTask = await response.json();
                    state.tasks[taskId] = updatedTask;
                }
            } else {
                // Create new task
                await addTask(sectionId, title, description);
            }
            
            hideTaskModal();
            renderActiveBoard();
        } catch (error) {
            console.error('Failed to save task:', error);
        }
    });
}

// Initialize the application
async function init() {
    // Initialize DOM elements
    elements = {
        themeToggle: document.getElementById('themeToggle'),
        boardMenu: document.getElementById('boardMenu'),
        boardMenuBtn: document.getElementById('boardMenuBtn'),
        boardList: document.getElementById('boardList'),
        addBoardBtn: document.getElementById('addBoardBtn'),
        currentBoard: document.getElementById('currentBoard'),
        columns: document.getElementById('columns'),
        taskModal: document.getElementById('taskModal'),
        taskForm: document.getElementById('taskForm'),
        taskTitle: document.getElementById('taskTitle'),
        taskDescription: document.getElementById('taskDescription'),
        boardContainer: document.querySelector('.board-container'),
        deleteTaskBtn: document.querySelector('.btn-delete')
    };

    // Check required elements
    const requiredElements = [
        'themeToggle', 'boardMenu', 'boardMenuBtn', 'boardList', 
        'addBoardBtn', 'currentBoard', 'columns', 'boardContainer',
        'taskModal', 'taskForm', 'taskTitle', 'taskDescription'
    ];

    for (const key of requiredElements) {
        if (!elements[key]) {
            console.error(`Required element "${key}" not found`);
            return;
        }
    }
    
    initTheme();
    initEventListeners();

    // Add retry logic for loading boards
    let retryCount = 0;
    const maxRetries = 3;

    async function loadBoardsWithRetry() {
        try {
    await loadBoards();
        } catch (error) {
            console.error(`Failed to load boards (attempt ${retryCount + 1}/${maxRetries}):`, error);
            if (retryCount < maxRetries) {
                retryCount++;
                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
                await loadBoardsWithRetry();
            }
        }
    }

    await loadBoardsWithRetry();
}

// Add this before initLogin function
const DB_NAME = 'dumbkan-auth';
const DB_VERSION = 1;
const STORE_NAME = 'auth';

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function storeAuthData(pin) {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        // Store PIN with expiration (24 hours)
        await store.put({
            id: 'auth',
            pin,
            expires: Date.now() + (24 * 60 * 60 * 1000)
        });
    } catch (error) {
        console.error('Failed to store auth data:', error);
    }
}

async function getStoredAuth() {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        
        return new Promise((resolve, reject) => {
            const request = store.get('auth');
            
            request.onsuccess = () => {
                const data = request.result;
                if (data && data.expires > Date.now()) {
                    resolve(data);
                } else {
                    // Clear expired data
                    const deleteTx = db.transaction(STORE_NAME, 'readwrite');
                    const deleteStore = deleteTx.objectStore(STORE_NAME);
                    deleteStore.delete('auth');
                    resolve(null);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to get stored auth:', error);
        return null;
    }
}

function initLogin() {
    // Initialize theme on login page
    initTheme();
    const themeToggleElem = document.getElementById('themeToggle');
    if (themeToggleElem) {
        themeToggleElem.addEventListener('click', toggleTheme);
    }
    
    // Check for stored PIN first
    getStoredAuth().then(authData => {
        if (authData && authData.pin) {
            // Auto verify the stored PIN
            fetch(window.appConfig.basePath + '/verify-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: authData.pin })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    window.location.href = window.appConfig.basePath + '/';
                    return;
                }
                // If verification fails, proceed with normal login
                initPinInputs();
            })
            .catch(() => initPinInputs());
        } else {
            initPinInputs();
        }
    }).catch(() => initPinInputs());
    
    function initPinInputs() {
        // For the login page, fetch the PIN length and generate the input boxes
        fetch(window.appConfig.basePath + '/pin-length')
        .then((response) => response.json())
        .then((data) => {
            const pinLength = data.length;
            const container = document.querySelector('.pin-input-container');
            if (container && pinLength > 0) {
                container.innerHTML = ''; // Clear any preexisting inputs
                const inputs = [];
                for (let i = 0; i < pinLength; i++) {
                    const input = document.createElement('input');
                    input.type = 'password';
                    input.inputMode = 'numeric';
                    input.pattern = '[0-9]*';
                    input.classList.add('pin-input');
                    input.maxLength = 1;
                    input.autocomplete = 'off';
                    container.appendChild(input);
                    inputs.push(input);
                }
                
                // Force focus and show keyboard on mobile
                if (inputs.length > 0) {
                    setTimeout(() => {
                        inputs[0].focus();
                        inputs[0].click();
                    }, 100);
                }
                
                inputs.forEach((input, index) => {
                    input.addEventListener('input', () => {
                        if (input.value.length === 1) {
                            if (index < inputs.length - 1) {
                                inputs[index + 1].focus();
                            } else {
                                // Last digit entered, auto submit the PIN via fetch
                                const pin = inputs.map(inp => inp.value).join('');
                                fetch(window.appConfig.basePath + '/verify-pin', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ pin })
                                })
                                .then((response) => response.json())
                                .then((result) => {
                                    if (result.success) {
                                        // Store the PIN in IndexedDB
                                        storeAuthData(pin).then(() => {
                                            // Redirect to the index page using the base URL
                                            window.location.href = window.appConfig.basePath + '/';
                                        });
                                    } else {
                                        const errorElem = document.querySelector('.pin-error');
                                        if (result.attemptsLeft === 0) {
                                            if (errorElem) {
                                                errorElem.innerHTML = "Too many invalid attempts - 15 minute lockout";
                                                errorElem.setAttribute('aria-hidden', 'false');
                                            }
                                            // Disable all input fields and grey them out
                                            inputs.forEach(inp => {
                                                inp.value = '';
                                                inp.disabled = true;
                                                inp.style.backgroundColor = "#ddd";
                                            });
                                        } else {
                                            const invalidAttempt = 5 - (result.attemptsLeft || 0);
                                            if (errorElem) {
                                                errorElem.innerHTML = `Invalid PIN entry ${invalidAttempt}/5`;
                                                errorElem.setAttribute('aria-hidden', 'false');
                                            }
                                            // Clear all input fields and refocus the first one
                                            inputs.forEach(inp => inp.value = '');
                                            inputs[0].focus();
                                        }
                                    }
                                })
                                .catch((err) => console.error('Error verifying PIN:', err));
                            }
                        }
                    });
                    
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Backspace' && input.value === '' && index > 0) {
                            inputs[index - 1].focus();
                        }
                    });
                });
            }
        })
        .catch((err) => console.error('Error fetching PIN length:', err));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('pinForm')) {
        initLogin();
    } else {
        init();
    }
});

function makeEditable(element, onSave) {
    // Prevent text selection on double-click
    element.addEventListener('dblclick', (e) => {
        e.preventDefault();
    });

    element.addEventListener('click', function(e) {
        if (e.target.closest('.task-move')) return; // Don't trigger edit on move button click
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; // Don't trigger if already editing
        
        const text = this.innerHTML.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, '').trim();
        const isDescription = this.classList.contains('task-description');
        const input = document.createElement(isDescription ? 'textarea' : 'input');
        
        input.value = text;
        input.className = 'inline-edit';
        input.style.width = isDescription ? '100%' : 'auto';
        
        // Add editing class to show background
        element.classList.add('editing');
        
        const saveEdit = async () => {
            const newText = input.value.trim();
            if (newText !== text) {
                const success = await onSave(newText);
                if (success) {
                    if (isDescription && !newText) {
                        renderActiveBoard(); // Re-render to show the arrow hook
                    } else {
                    element.innerHTML = isDescription ? linkify(newText) : newText;
                    }
                } else {
                    element.innerHTML = isDescription ? linkify(text) : text;
                }
            } else {
                element.innerHTML = isDescription ? linkify(text) : text;
            }
            element.classList.remove('editing');
        };

        const cancelEdit = () => {
            element.innerHTML = isDescription ? linkify(text) : text;
            element.classList.remove('editing');
            input.removeEventListener('blur', saveEdit);
        };

        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (e) => {
            if (!isDescription && e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (isDescription && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                cancelEdit();
            }
        });

        // Replace the content with the input
        element.textContent = '';
        element.appendChild(input);
        input.focus();
        if (!isDescription) {
            // For title, put cursor at end instead of selecting all
            input.setSelectionRange(input.value.length, input.value.length);
        } else {
            // For descriptions, put cursor at end
            input.setSelectionRange(input.value.length, input.value.length);
        }
    });
}

// Helper function to convert URLs in text to clickable links and include line breaks
function linkify(text) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text
    .replace(urlRegex, function(url) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    })
    .replace(/\n/g, '<br>');
}

function getPrioritySymbol(priority) {
    switch (priority) {
        case 'urgent': return '!';
        case 'high': return '↑';
        case 'medium': return '⇈';
        case 'low': return '↓';
        default: return '⇈';
    }
}

// Section drag and drop
async function handleSectionMove(sectionId, newIndex) {
    try {
        const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/sections/${sectionId}/move`, {
            method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newIndex })
        });

        if (!response.ok) {
            throw new Error('Failed to move section');
        }

        // Update local state
        const board = state.boards[state.activeBoard];
        const currentIndex = board.sectionOrder.indexOf(sectionId);
        if (currentIndex !== -1) {
            board.sectionOrder.splice(currentIndex, 1);
            board.sectionOrder.splice(newIndex, 0, sectionId);
        }

        renderActiveBoard();
        } catch (error) {
        console.error('Failed to move section:', error);
        loadBoards(); // Reload the board state in case of error
    }
}

function handleSectionDragStart(e) {
    const column = e.target.closest('.column');
    if (!column) return;
    
    column.classList.add('dragging');
        e.dataTransfer.setData('application/json', JSON.stringify({
        sectionId: column.dataset.sectionId,
        type: 'section'
        }));
        e.dataTransfer.effectAllowed = 'move';
}

function handleSectionDragOver(e) {
    e.preventDefault();
    const column = e.target.closest('.column');
    if (!column) return;

    const draggingElement = document.querySelector('.column.dragging');
    if (!draggingElement) return;

    const columns = [...document.querySelectorAll('.column:not(.dragging)')];
    const afterElement = getDragAfterElement(columns, e.clientX);
    
    if (afterElement) {
        column.parentNode.insertBefore(draggingElement, afterElement);
    } else {
        column.parentNode.appendChild(draggingElement);
    }
}

function getDragAfterElement(elements, x) {
    const draggableElements = elements.filter(element => {
        const box = element.getBoundingClientRect();
        return x < box.left + box.width / 2;
    });
    
    return draggableElements[0];
}

async function handleSectionDrop(e) {
                e.preventDefault();
    const column = e.target.closest('.column');
    if (!column) return;

    try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.type !== 'section') return;

        const { sectionId } = data;
        const columns = [...document.querySelectorAll('.column')];
        const newIndex = columns.indexOf(column);
        
        if (newIndex !== -1) {
            await handleSectionMove(sectionId, newIndex);
                    }
        } catch (error) {
        console.error('Error handling section drop:', error);
        loadBoards();
    }
}

// Update renderColumn function to only make the header draggable
function renderColumn(section) {
    if (!section) return null;

    const columnEl = document.createElement('div');
    columnEl.className = 'column';
    columnEl.dataset.sectionId = section.id;
    columnEl.draggable = false; // Column itself is not draggable

    // Add drag event listeners for columns
    columnEl.addEventListener('dragover', handleDragOver);
    columnEl.addEventListener('drop', handleDrop);

    // Ensure taskIds exists and is an array
    const taskIds = Array.isArray(section.taskIds) ? section.taskIds : [];
    const taskCount = taskIds.length;

    const headerEl = document.createElement('div');
    headerEl.className = 'column-header';
    headerEl.draggable = true; // Only the header is draggable
    
    const columnTitle = document.createElement('h2');
    columnTitle.className = 'column-title';
    columnTitle.textContent = section.name || 'Unnamed Section';
    makeEditable(columnTitle, async (newName) => {
        try {
            const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/sections/${section.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
                });
                
                if (response.ok) {
                const updatedSection = await response.json();
                state.sections[section.id] = updatedSection;
                    return true;
                }
                return false;
            } catch (error) {
            console.error('Failed to update section name:', error);
                return false;
            }
        });
        
    headerEl.innerHTML = `
        <div class="column-count">${taskCount}</div>
        <div class="column-drag-handle">
            <svg viewBox="0 0 24 24" width="16" height="16">
                <circle cx="9" cy="12" r="1.5"/>
                <circle cx="15" cy="12" r="1.5"/>
            </svg>
        </div>
    `;
    headerEl.insertBefore(columnTitle, headerEl.lastElementChild);

    // Add drag event listeners to the header
    headerEl.addEventListener('dragstart', handleSectionDragStart);
    headerEl.addEventListener('dragend', () => columnEl.classList.remove('dragging'));

    columnEl.appendChild(headerEl);

    const tasksContainer = document.createElement('div');
    tasksContainer.className = 'tasks';
    tasksContainer.dataset.sectionId = section.id;
    columnEl.appendChild(tasksContainer);

    // Render tasks
    taskIds.forEach(taskId => {
        const task = state.tasks?.[taskId];
        if (task) {
            const taskEl = renderTask(task);
            if (taskEl) {
                tasksContainer.appendChild(taskEl);
            }
        }
    });

    // Add task button
    const addTaskBtn = document.createElement('button');
    addTaskBtn.className = 'add-task-btn';
    addTaskBtn.setAttribute('aria-label', 'Add task');
    addTaskBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    `;
    addTaskBtn.addEventListener('click', () => {
        showTaskModal({ sectionId: section.id });
    });
    columnEl.appendChild(addTaskBtn);

    return columnEl;
}

// Add this function to handle moving task to the right
async function moveTaskRight(taskId, currentSectionId) {
    const board = state.boards[state.activeBoard];
    if (!board || !board.sectionOrder) return;

    // Find the current section's index
    const currentIndex = board.sectionOrder.indexOf(currentSectionId);
    if (currentIndex === -1 || currentIndex >= board.sectionOrder.length - 1) return;

    // Get the next section
    const nextSectionId = board.sectionOrder[currentIndex + 1];
    if (!nextSectionId) return;

    // Move the task
    await handleTaskMove(taskId, currentSectionId, nextSectionId, 0);
}

function renderTask(task) {
    if (!task) return null;

    const taskElement = document.createElement('div');
    taskElement.className = 'task';
    taskElement.dataset.taskId = task.id;
    taskElement.draggable = true;

    // Add drag event listeners for tasks
    taskElement.addEventListener('dragstart', handleDragStart);
    taskElement.addEventListener('dragend', handleDragEnd);

    // Create content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'task-content-wrapper';

    // Create task header with title and move button
    const taskHeader = document.createElement('div');
    taskHeader.className = 'task-header';
    
    const taskTitle = document.createElement('h3');
    taskTitle.className = 'task-title';
    
    // Create priority tray
    const priorityTray = document.createElement('div');
    priorityTray.className = 'priority-tray';
    
    const priorities = [
        { name: 'low', symbol: '↓' },
        { name: 'medium', symbol: '⇈' },
        { name: 'high', symbol: '↑' },
        { name: 'urgent', symbol: '!' }
    ];
    
    priorities.forEach(priority => {
        const option = document.createElement('div');
        option.className = `priority-option ${priority.name}`;
        option.textContent = priority.symbol;
        option.setAttribute('title', priority.name.charAt(0).toUpperCase() + priority.name.slice(1));
        option.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/sections/${task.sectionId}/tasks/${task.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ priority: priority.name })
                });

                if (response.ok) {
                    const updatedTask = await response.json();
                    state.tasks[task.id] = updatedTask;
                    renderActiveBoard();
                }
            } catch (error) {
                console.error('Failed to update task priority:', error);
            }
            priorityTray.classList.remove('active');
        });
        priorityTray.appendChild(option);
    });
    
    const priorityBadge = document.createElement('span');
    priorityBadge.className = `badge priority-badge ${task.priority}`;
    priorityBadge.setAttribute('title', task.priority.charAt(0).toUpperCase() + task.priority.slice(1));
    priorityBadge.textContent = getPrioritySymbol(task.priority);
    
    priorityBadge.appendChild(priorityTray);
    
    // Handle priority badge click
    priorityBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        const allTrays = document.querySelectorAll('.priority-tray');
        allTrays.forEach(tray => {
            if (tray !== priorityTray) {
                tray.classList.remove('active');
            }
        });
        priorityTray.classList.toggle('active');
    });
    
    // Close tray when clicking outside or pressing Escape
    document.addEventListener('click', (e) => {
        if (!priorityBadge.contains(e.target)) {
            priorityTray.classList.remove('active');
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            priorityTray.classList.remove('active');
        }
    });
    
    const titleText = document.createElement('span');
    titleText.className = 'title-text';
    titleText.textContent = task.title || 'Untitled Task';
    
    taskTitle.appendChild(priorityBadge);
    taskTitle.appendChild(titleText);
    
    makeEditable(titleText, async (newTitle) => {
        try {
            const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/sections/${task.sectionId}/tasks/${task.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            
            if (response.ok) {
                const updatedTask = await response.json();
                state.tasks[task.id] = updatedTask;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update task title:', error);
            return false;
        }
    });
    taskHeader.appendChild(taskTitle);

    // Create badges container without priority badge
    const metadataBadges = document.createElement('div');
    metadataBadges.className = 'task-badges';

    if (task.assignee) {
        const assigneeBadge = document.createElement('span');
        assigneeBadge.className = 'badge assignee-badge';
        assigneeBadge.textContent = task.assignee;
        metadataBadges.appendChild(assigneeBadge);
    }

    taskHeader.appendChild(metadataBadges);
    contentWrapper.appendChild(taskHeader);

    // Create task content for description and tags
    const taskContent = document.createElement('div');
    taskContent.className = 'task-content';

    // Add description or arrow hook symbol
    if (task.description) {
        const taskDescription = document.createElement('div');
        taskDescription.className = 'task-description';
        taskDescription.innerHTML = linkify(task.description);
        makeEditable(taskDescription, async (newDescription) => {
            try {
                const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/sections/${task.sectionId}/tasks/${task.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: newDescription })
                });
                
                if (response.ok) {
                    const updatedTask = await response.json();
                    state.tasks[task.id] = updatedTask;
                    if (!newDescription) {
                        renderActiveBoard(); // Re-render to show the arrow hook
                    }
                    return true;
                }
                return false;
            } catch (error) {
                console.error('Failed to update task description:', error);
                return false;
            }
        });
        taskContent.appendChild(taskDescription);
    } else {
        const arrowHook = document.createElement('span');
        arrowHook.className = 'description-hook';
        arrowHook.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    `;
        arrowHook.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent task modal from opening
            const taskDescription = document.createElement('div');
            taskDescription.className = 'task-description';
            const textarea = document.createElement('textarea');
            textarea.className = 'inline-edit';
            textarea.placeholder = 'Add a description...';
            
            const saveDescription = async () => {
                const newDescription = textarea.value.trim();
                try {
                    const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/sections/${task.sectionId}/tasks/${task.id}`, {
                        method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ description: newDescription })
            });
            
            if (response.ok) {
                        const updatedTask = await response.json();
                        state.tasks[task.id] = updatedTask;
            }
        } catch (error) {
                    console.error('Failed to add task description:', error);
                }
                renderActiveBoard();
            };

            textarea.addEventListener('blur', saveDescription);
            textarea.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    textarea.blur();
                } else if (e.key === 'Escape') {
                    renderActiveBoard();
                }
            });

            taskDescription.appendChild(textarea);
            taskContent.appendChild(taskDescription);
            textarea.focus();
        });
        taskContent.appendChild(arrowHook);
    }

    // Add tags if they exist
    if (Array.isArray(task.tags) && task.tags.length > 0) {
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'task-tags';
        
        task.tags.forEach(tag => {
            if (tag) {
                const tagBadge = document.createElement('span');
                tagBadge.className = 'badge tag-badge';
                tagBadge.textContent = tag;
                tagsContainer.appendChild(tagBadge);
            }
        });
        
        taskContent.appendChild(tagsContainer);
    }

    contentWrapper.appendChild(taskContent);
    taskElement.appendChild(contentWrapper);

    // Add move right button
    const moveRightBtn = document.createElement('button');
    moveRightBtn.className = 'task-move';
    moveRightBtn.setAttribute('aria-label', 'Move task right');
    moveRightBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
    `;
    moveRightBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent task modal from opening
        moveTaskRight(task.id, task.sectionId);
    });

    // Only show the move right button if there's a section to the right
    const board = state.boards[state.activeBoard];
    if (board && board.sectionOrder) {
        const currentSectionIndex = board.sectionOrder.indexOf(task.sectionId);
        if (currentSectionIndex === -1 || currentSectionIndex >= board.sectionOrder.length - 1) {
            moveRightBtn.style.visibility = 'hidden';
        }
    }

    taskElement.appendChild(moveRightBtn);

    // Double click to edit
    taskElement.addEventListener('dblclick', () => {
        showTaskModal(task);
    });

    return taskElement;
}

// Add the deleteTask function
async function deleteTask(taskId, sectionId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
        const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/sections/${sectionId}/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            // Remove task from state
            delete state.tasks[taskId];
            
            // Remove task from section's taskIds
            const section = state.sections[sectionId];
            if (section) {
                const taskIndex = section.taskIds.indexOf(taskId);
                if (taskIndex !== -1) {
                    section.taskIds.splice(taskIndex, 1);
                }
            }
            
            // Close modal and refresh board
            hideTaskModal();
            renderActiveBoard();
        } else {
            console.error('Failed to delete task:', response.statusText);
        }
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

// Add back the handleTaskMove function
async function handleTaskMove(taskId, fromSectionId, toSectionId, newIndex) {
    try {
        const response = await fetch(`${window.appConfig.basePath}/api/boards/${state.activeBoard}/tasks/${taskId}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fromSectionId,
                toSectionId,
                newIndex
            })
        });

        if (!response.ok) {
            throw new Error('Failed to move task');
        }

        // Update local state
        const task = state.tasks[taskId];
        const fromSection = state.sections[fromSectionId];
        const toSection = state.sections[toSectionId];

        // Remove task from source section
        const taskIndex = fromSection.taskIds.indexOf(taskId);
        if (taskIndex !== -1) {
            fromSection.taskIds.splice(taskIndex, 1);
        }

        // Add task to target section
        if (typeof newIndex === 'number') {
            toSection.taskIds.splice(newIndex, 0, taskId);
        } else {
            toSection.taskIds.push(taskId);
        }

        // Update task's section reference
        task.sectionId = toSectionId;
        
        renderActiveBoard();
    } catch (error) {
        console.error('Failed to move task:', error);
        loadBoards(); // Reload the board state in case of error
    }
}