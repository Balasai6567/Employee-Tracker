// app.js - Final Enhanced Version
// Global variables
let isAdminAuthenticated = false;
let employees = [];
let assignments = [];
let dropdowns = {
    designations: [],
    machines: [],
    workAreas: []
};
let filteredReportData = [];
let currentReportType = 'assignment';
let currentAssignments = {};
let isDemoMode = false;

// Configuration - UPDATE THIS URL WITH YOUR APPS SCRIPT URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw-I5jNLO-PGj5XMuAzKZWDlka6Jk_vTbmwxRs5IXrDILmvaMy6ze2k-0RHpJbpjBEhfA/exec';
const ADMIN_PIN = '1234';

// Area colors for visual coding
const areaColors = {
    "Tunnel Zone-1": "#e0f7fa",
    "Tunnel Zone-2": "#ffe0b2", 
    "Reach 0-2km": "#f3e5f5",
    "Reach 2-4km": "#c8e6c9",
    "Office Area": "#d1c4e9",
    "Storage Yard": "#ffccbc",
    "Equipment Yard": "#dcedc8"
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    showOverlay('Initializing system...');
    initializeSystem();
});

// Loading overlay helpers
const showOverlay = (msg) => {
    const overlay = document.getElementById('loadingOverlay');
    const message = document.getElementById('loadingMessage');
    if (message) message.textContent = msg || 'Loading...';
    overlay.style.display = 'flex';
};

const hideOverlay = () => {
    document.getElementById('loadingOverlay').style.display = 'none';
};

// Enhanced system initialization
async function initializeSystem() {
    try {
        setTodayDate();
        
        // Auto-load last used board date and update display
        const lastUsed = localStorage.getItem('LAST_BOARD_DATE');
        if (lastUsed) {
            document.getElementById('assignmentDate').value = lastUsed;
            updateLastSelectionDisplay(lastUsed);
        } else {
            // Initialize with today's date
            const today = new Date().toISOString().split('T')[0];
            updateLastSelectionDisplay(today);
        }
        
        const isConnected = await testConnection();
        
        if (isConnected) {
            showConnectionStatus('✅ Connected to Google Sheets - Live data mode', 'success');
            isDemoMode = false;
        } else {
            showConnectionStatus('⚠️ Demo mode - Data limited to current session', 'warning');
            isDemoMode = true;
        }
        
        await loadDropdowns();
        await loadAllData();
        showTab(null, 'employee-entry');
        
    } catch (error) {
        console.error('System initialization failed:', error);
        showConnectionStatus('❌ System initialization failed - Demo mode active', 'danger');
        isDemoMode = true;
        await loadDropdowns();
        await loadAllData();
    } finally {
        hideOverlay();
    }
}

// Enhanced load all data for accurate reporting
async function loadAllData() {
    try {
        showOverlay('Loading employee data...');
        
        const employeesData = await makeApiCall('getEmployees');
        if (Array.isArray(employeesData)) {
            employees = employeesData;
        } else if (employeesData && Array.isArray(employeesData.data)) {
            employees = employeesData.data;
        } else {
            employees = [];
        }

        // Load assignments for the last 30 days
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        try {
            const assignmentsData = await makeApiCall('getReport', { 
                filters: { startDate, endDate } 
            });
            if (Array.isArray(assignmentsData)) {
                assignments = assignmentsData;
            } else if (assignmentsData && Array.isArray(assignmentsData.data)) {
                assignments = assignmentsData.data;
            } else {
                assignments = [];
            }
        } catch (error) {
            console.log('Could not load assignment history');
            assignments = [];
        }

        // Extract work areas from assignments and update dropdowns
        if (assignments.length > 0) {
            const workAreasFromAssignments = [...new Set(assignments.map(a => a.workArea))].filter(Boolean);
            if (workAreasFromAssignments.length > 0) {
                dropdowns.workAreas = [...new Set([...dropdowns.workAreas, ...workAreasFromAssignments])];
                populateDropdowns();
            }
        }

        console.log('✅ Data loaded:', {
            employees: employees.length,
            assignments: assignments.length,
            workAreas: dropdowns.workAreas.length
        });

    } catch (error) {
        console.error('Error loading data:', error);
        employees = [];
        assignments = [];
    }
}

// Test connection
async function testConnection() {
    try {
        const result = await makeJsonpCall('ping', {});
        return true;
    } catch (error) {
        return false;
    }
}

// JSONP API call function
function makeJsonpCall(action, data = {}) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Request timeout'));
        }, 15000);

        const callbackName = 'jsonp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const script = document.createElement('script');
        
        window[callbackName] = function(response) {
            cleanup();
            if (response && response.success) {
                resolve(response.data);
            } else {
                reject(new Error(response?.error || 'API call failed'));
            }
        };

        function cleanup() {
            clearTimeout(timeout);
            try {
                if (script.parentNode) {
                    document.head.removeChild(script);
                }
                if (window[callbackName]) {
                    delete window[callbackName];
                }
            } catch (e) {
                console.log('Cleanup warning:', e.message);
            }
        }

        script.onerror = function() {
            cleanup();
            reject(new Error('Script load error'));
        };

        const params = new URLSearchParams({
            action: action,
            callback: callbackName,
            _t: Date.now()
        });

        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'object') {
                params.append(key, JSON.stringify(data[key]));
            } else {
                params.append(key, data[key]);
            }
        });

        script.src = `${APPS_SCRIPT_URL}?${params.toString()}`;
        document.head.appendChild(script);
    });
}

// Enhanced API call function
async function makeApiCall(action, data = {}) {
    try {
        const result = await makeJsonpCall(action, data);
        
        if (isDemoMode) {
            isDemoMode = false;
            showConnectionStatus('✅ Reconnected to Google Sheets', 'success');
        }
        
        return result;
    } catch (error) {
        console.log('❌ API call failed:', action, error.message);
        
        if (['getDropdowns', 'getEmployees', 'getAssignments', 'getReport'].includes(action)) {
            return simulateApiCall(action, data);
        } else {
            throw new Error('Connection required for this operation');
        }
    }
}

// Show connection status
function showConnectionStatus(message, type) {
    const statusDiv = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    const indicator = document.getElementById('statusIndicator');
    
    statusDiv.style.display = 'block';
    statusText.textContent = message;
    indicator.className = 'status-indicator';
    
    const styles = {
        success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb', class: 'status-online' },
        warning: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7', class: 'status-demo' },
        danger: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb', class: 'status-offline' },
        info: { bg: '#cce7ff', color: '#004085', border: '#99d6ff', class: 'status-demo' }
    };
    
    const style = styles[type];
    statusDiv.style.background = style.bg;
    statusDiv.style.color = style.color;
    statusDiv.style.border = `1px solid ${style.border}`;
    indicator.classList.add(style.class);
    
    if (type === 'success') {
        setTimeout(() => statusDiv.style.display = 'none', 5000);
    }
}

// Manual connection test
async function testManualConnection() {
    showConnectionStatus('🔄 Testing connection...', 'info');
    
    try {
        const result = await makeJsonpCall('ping', {});
        showConnectionStatus('✅ Connection working perfectly!', 'success');
        showAlert('🎉 Connection is working! All features available.', 'success');
        isDemoMode = false;
        await loadAllData();
    } catch (error) {
        showConnectionStatus('❌ Connection failed - using demo mode', 'danger');
        showAlert('❌ Connection test failed: ' + error.message, 'danger');
        isDemoMode = true;
    }
}

// Tab switching
function showTab(event, tabId) {
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => tab.classList.remove('active'));

    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => tab.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');

    if (event) {
        event.target.classList.add('active');
    } else {
        document.querySelector('.nav-tab').classList.add('active');
    }

    if (tabId === 'assignment-board') {
        loadAssignmentBoard();
    } else if (tabId === 'reports') {
        loadReportFilters();
    }
}

// Enhanced load dropdown data with work area sync
async function loadDropdowns() {
    try {
        showOverlay('Loading dropdown data...');
        const response = await makeApiCall('getDropdowns', {});
        
        if (response && response.designations && response.designations.length > 0) {
            dropdowns = response;
            isDemoMode = false;
        } else {
            dropdowns = getDefaultDropdowns();
        }

        // If we have assignment data, extract unique work areas from it
        if (assignments && assignments.length > 0) {
            const assignmentWorkAreas = [...new Set(assignments.map(a => a.workArea))].filter(Boolean);
            
            // Merge with existing work areas
            const allWorkAreas = [...new Set([...dropdowns.workAreas, ...assignmentWorkAreas])];
            dropdowns.workAreas = allWorkAreas;
            
            console.log('Work areas updated from assignments:', allWorkAreas);
        }

        populateDropdowns();
    } catch (error) {
        console.error('Error loading dropdowns:', error);
        dropdowns = getDefaultDropdowns();
        populateDropdowns();
    }
}

// Enhanced default dropdown values to match your data
function getDefaultDropdowns() {
    return {
        designations: [
            'Project Manager', 'Planning Manager', 'Survey Manager', 'Procurement',
            'Plant Incharge', 'Incharge', 'Accountant', 'Store Incharge', 'Store Assistant',
            'Supervisor', 'Sr Engineer', 'Mech Engineer', 'Sr Engineer (Mech)', 'Civil Engineer',
            'Gr Engineer Trainee', 'QC Engineer', 'Jr Engineer', 'Surveyor', 'Mechanical Engineer',
            'Electrician', 'Driver', 'B Plant Operator', 'Mess Supervisor', 'Office Boy',
            'Foreman', 'Supervisor (B Plant)', 'Diesel Supervisor'
        ],
        machines: [
            'Excavator-01', 'Bulldozer-02', 'Crane-03', 'Dump Truck-04', 
            'Concrete Mixer-05', 'Loader-06', 'Grader-07'
        ],
        workAreas: [
            'ch154 - ch159 - RamBabu', 'ch159 - ch165 - Shyam', 'ch165 - ch170 - Narayana',
            'ch170 - ch177 - Nagaraju', 'ch177 - ch187 - SudharshanBala',
            'Reach 0-2km', 'Reach 2-4km', 'Tunnel Zone-1', 'Tunnel Zone-2', 
            'Office Area', 'Storage Yard', 'Equipment Yard'
        ]
    };
}

// Enhanced populate dropdown elements
function populateDropdowns() {
    // Populate designation dropdowns
    const designationSelects = ['designation', 'filterDesignation', 'editEmpDesignation'];
    designationSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            // Keep the first option (usually "Select..." or "All...")
            while (select.children.length > 1) {
                select.removeChild(select.lastChild);
            }
            
            // Add unique designations
            const uniqueDesignations = [...new Set(dropdowns.designations)];
            uniqueDesignations.forEach(designation => {
                const option = document.createElement('option');
                option.value = designation;
                option.textContent = designation;
                select.appendChild(option);
            });
        }
    });

    // Populate machine dropdowns
    const machineSelects = ['machine', 'editEmpMachine'];
    machineSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            while (select.children.length > 1) {
                select.removeChild(select.lastChild);
            }
            
            const uniqueMachines = [...new Set(dropdowns.machines)];
            uniqueMachines.forEach(machine => {
                const option = document.createElement('option');
                option.value = machine;
                option.textContent = machine;
                select.appendChild(option);
            });
        }
    });

    // Populate work area dropdowns with enhanced handling
    const workAreaSelects = ['workArea', 'filterWorkArea'];
    workAreaSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            while (select.children.length > 1) {
                select.removeChild(select.lastChild);
            }
            
            const uniqueWorkAreas = [...new Set(dropdowns.workAreas)];
            uniqueWorkAreas.forEach(workArea => {
                const option = document.createElement('option');
                option.value = workArea;
                option.textContent = workArea;
                select.appendChild(option);
            });
        }
    });
    
    console.log('Dropdowns populated:', dropdowns);
}

// Employee form submission with duplicate prevention
document.getElementById('employeeForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const loading = submitBtn.querySelector('.loading');
    
    btnText.style.display = 'none';
    loading.style.display = 'inline-block';
    submitBtn.disabled = true;

    try {
        const formData = new FormData(this);
        const employeeData = {
            name: formData.get('employeeName').trim(),
            designation: formData.get('designation'),
            type: formData.get('employmentType'),
            machine: formData.get('machine') || '',
            workArea: formData.get('workArea'),
            phone: formData.get('phoneNumber').trim(),
            notes: formData.get('notes').trim() || ''
        };

        if (!/^\d{10}$/.test(employeeData.phone)) {
            throw new Error('Phone number must be exactly 10 digits');
        }

        const duplicateCheck = await makeApiCall('checkDuplicate', { 
            name: employeeData.name, 
            phone: employeeData.phone 
        });
        
        if (duplicateCheck.isDuplicate) {
            throw new Error('Employee with this name and phone number already exists!');
        }

        const result = await makeApiCall('addEmployee', { employee: employeeData });
        showAlert(`✅ Employee added successfully! ID: ${result.empId}`, 'success');
        this.reset();
        
        await loadAllData();
        
        if (isAdminAuthenticated) {
            loadEmployeeTable();
        }
        
    } catch (error) {
        console.error('Error adding employee:', error);
        showAlert(error.message || 'Error adding employee. Please try again.', 'danger');
    } finally {
        btnText.style.display = 'inline';
        loading.style.display = 'none';
        submitBtn.disabled = false;
    }
});

// Admin authentication
async function authenticateAdmin() {
    const pin = document.getElementById('adminPin').value;
    const statusDiv = document.getElementById('adminStatus');
    const controlsDiv = document.getElementById('adminControls');

    if (!pin) {
        statusDiv.innerHTML = '<div class="alert alert-danger">❌ Please enter admin PIN</div>';
        return;
    }

    try {
        const result = await makeApiCall('authenticateAdmin', { pin });
        
        if (result.isValid) {
            isAdminAuthenticated = true;
            statusDiv.innerHTML = '<div class="alert alert-success">✅ Admin authenticated successfully!</div>';
            controlsDiv.style.display = 'block';
            document.getElementById('adminPin').value = '';
            await loadAdminData();
        } else {
            statusDiv.innerHTML = '<div class="alert alert-danger">❌ Invalid PIN. Please try again.</div>';
            controlsDiv.style.display = 'none';
        }
    } catch (error) {
        console.error('Authentication error:', error);
        statusDiv.innerHTML = '<div class="alert alert-danger">❌ Authentication failed. Please try again.</div>';
        controlsDiv.style.display = 'none';
    }
}

// Load admin panel data
async function loadAdminData() {
    displayDropdownItems();
    await loadEmployeeTable();
}

// Display dropdown items for admin management
function displayDropdownItems() {
    displayList('designationsList', dropdowns.designations, 'designations');
    displayList('machinesList', dropdowns.machines, 'machines');
    displayList('workAreasList', dropdowns.workAreas, 'workAreas');
}

// Display list items with delete buttons
function displayList(containerId, items, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (items.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No items found</div>';
        return;
    }
    
    items.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; margin: 5px 0; background: #f8f9fa; border-radius: 5px;';
        itemDiv.innerHTML = `
            <span>${item}</span>
            <button class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;" onclick="removeDropdownItem('${type}', ${index})">Delete</button>
        `;
        container.appendChild(itemDiv);
    });
}

// Add dropdown item
async function addDropdownItem(type, inputId) {
    const input = document.getElementById(inputId);
    const value = input.value.trim();
    
    if (!value) {
        showAlert('Please enter a value', 'danger');
        return;
    }

    if (value.length > 30) {
        showAlert('Value too long (max 30 characters)', 'danger');
        return;
    }

    if (dropdowns[type].includes(value)) {
        showAlert('Item already exists', 'danger');
        return;
    }

    const button = input.nextElementSibling;
    const originalText = button.textContent;
    button.innerHTML = '<div class="loading" style="display: inline-block; margin-right: 5px;"></div>Adding...';
    button.disabled = true;

    try {
        await makeApiCall('addDropdownItem', { type, value });
        dropdowns[type].push(value);
        input.value = '';
        displayDropdownItems();
        populateDropdowns();
        showAlert(`✅ "${value}" added successfully!`, 'success');
    } catch (error) {
        console.error('Error adding dropdown item:', error);
        showAlert(error.message || 'Error adding item', 'danger');
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Remove dropdown item
async function removeDropdownItem(type, index) {
    const itemName = dropdowns[type][index];
    
    if (!confirm(`Are you sure you want to delete "${itemName}"?`)) {
        return;
    }

    const container = document.getElementById(`${type}List`);
    const itemDiv = container.children[index];
    const button = itemDiv.querySelector('.btn-danger');
    
    button.innerHTML = '<div class="loading" style="display: inline-block;"></div>';
    button.disabled = true;

    try {
        await makeApiCall('removeDropdownItem', { type, index });
        dropdowns[type].splice(index, 1);
        displayDropdownItems();
        populateDropdowns();
        showAlert(`✅ "${itemName}" deleted successfully!`, 'success');
    } catch (error) {
        console.error('Error removing dropdown item:', error);
        showAlert(error.message || 'Error deleting item', 'danger');
        button.textContent = 'Delete';
        button.disabled = false;
    }
}

// Load employee table
async function loadEmployeeTable() {
    const tbody = document.querySelector('#employeeTable tbody');
    
    try {
        showOverlay('Loading employee table...');
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;"><div class="loading" style="display: inline-block; margin-right: 10px;"></div>Loading employees...</td></tr>';
        
        let employeesData = employees;
        if (!employeesData || employeesData.length === 0) {
            employeesData = await makeApiCall('getEmployees');
            if (Array.isArray(employeesData)) {
                employees = employeesData;
            } else if (employeesData && Array.isArray(employeesData.data)) {
                employees = employeesData.data;
            } else {
                employees = [];
            }
        }

        tbody.innerHTML = '';

        if (!Array.isArray(employees) || employees.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">No employees found. Add employees using the Employee Entry tab.</td></tr>';
            return;
        }

        employees.forEach(employee => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${employee.empId}</td>
                <td>${employee.name}</td>
                <td>${employee.designation}</td>
                <td>${employee.type}</td>
                <td>${employee.machine || 'N/A'}</td>
                <td>${employee.phone}</td>
                <td>
                    <button class="btn btn-warning" style="padding: 5px 10px; margin-right: 5px; font-size: 12px;" onclick="editEmployee('${employee.empId}')">Edit</button>
                    <button class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;" onclick="deleteEmployee('${employee.empId}')">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        showAlert(`✅ Loaded ${employees.length} employees`, 'success');
    } catch (error) {
        console.error('Error loading employee table:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #dc3545;">❌ Error loading employees. Please try again.</td></tr>';
        showAlert('Error loading employee data', 'danger');
    } finally {
        hideOverlay();
    }
}

// Enhanced assignment board with color coding and work area updates
async function loadAssignmentBoard() {
    try {
        showOverlay('Loading assignment board...');
        
        const selectedDate = document.getElementById('assignmentDate').value;
        
        if (!selectedDate) {
            showAlert('Please select a date', 'warning');
            return;
        }
        
        // Save date to localStorage and update display
        localStorage.setItem('LAST_BOARD_DATE', selectedDate);
        updateLastSelectionDisplay(selectedDate);
        
        if (!Array.isArray(employees) || employees.length === 0) {
            await loadEmployeeTable();
        }

        try {
            const assignmentsData = await makeApiCall('getAssignments', { date: selectedDate });
            let dayAssignments = [];
            if (Array.isArray(assignmentsData)) {
                dayAssignments = assignmentsData;
            } else if (assignmentsData && Array.isArray(assignmentsData.data)) {
                dayAssignments = assignmentsData.data;
            }
            
            currentAssignments = {};
            dayAssignments.forEach(assignment => {
                if (!currentAssignments[assignment.workArea]) {
                    currentAssignments[assignment.workArea] = [];
                }
                currentAssignments[assignment.workArea].push(assignment.empId);
                
                // Update employee's current work area
                const employee = employees.find(emp => emp.empId === assignment.empId);
                if (employee) {
                    employee.currentWorkArea = assignment.workArea;
                }
            });
        } catch (error) {
            console.log('No existing assignments found for date');
            currentAssignments = {};
        }

        const employeePool = document.getElementById('employeePool');
        employeePool.innerHTML = '';

        const assignmentBoard = document.getElementById('assignmentBoard');
        assignmentBoard.innerHTML = '';

        dropdowns.workAreas.forEach(workArea => {
            const column = createWorkAreaColumn(workArea);
            assignmentBoard.appendChild(column);
        });

        let availableCount = 0;
        employees.forEach(employee => {
            const card = createEmployeeCard(employee);
            
            let isAssigned = false;
            for (const [workArea, assignedEmployees] of Object.entries(currentAssignments)) {
                if (assignedEmployees.includes(employee.empId)) {
                    const column = document.querySelector(`[data-work-area="${workArea}"]`);
                    if (column) {
                        column.appendChild(card);
                        isAssigned = true;
                        break;
                    }
                }
            }
            
            if (!isAssigned) {
                employeePool.appendChild(card);
                availableCount++;
            }
        });

        document.getElementById('availableCount').textContent = `(${availableCount})`;
        updateAssignmentSummary();
        initializeDragAndDrop();
        
    } catch (error) {
        console.error('Error loading assignment board:', error);
        showAlert('Error loading assignment board', 'danger');
    } finally {
        hideOverlay();
    }
}

// Update last selection display
function updateLastSelectionDisplay(date) {
    const lastSelectedSpan = document.getElementById('lastSelectedDate');
    if (lastSelectedSpan) {
        const formattedDate = new Date(date).toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        lastSelectedSpan.textContent = formattedDate;
    }
}

// Create employee card with color coding
function createEmployeeCard(employee) {
    const card = document.createElement('div');
    card.className = 'employee-card';
    card.draggable = true;
    card.dataset.empId = employee.empId;
    card.innerHTML = `
        <div class="name">${employee.name}</div>
        <div class="details">${employee.designation} • ${employee.type}</div>
        <div class="details">${employee.machine || 'No Machine'} • ${employee.phone}</div>
    `;
    return card;
}

// Create work area column with color coding
function createWorkAreaColumn(workArea) {
    const column = document.createElement('div');
    column.className = 'work-area-column';
    column.dataset.workArea = workArea;
    
    // Apply color coding
    const colorClass = getWorkAreaColorClass(workArea);
    if (colorClass) {
        column.classList.add(colorClass);
    }
    
    column.innerHTML = `<h3>${workArea} <span class="count">(0)</span></h3>`;
    return column;
}

// Get work area color class
function getWorkAreaColorClass(workArea) {
    const colorMap = {
        'Tunnel Zone-1': 'work-area-tunnel-1',
        'Tunnel Zone-2': 'work-area-tunnel-2',
        'Reach 0-2km': 'work-area-reach-1',
        'Reach 2-4km': 'work-area-reach-2',
        'Office Area': 'work-area-office',
        'Storage Yard': 'work-area-storage',
        'Equipment Yard': 'work-area-equipment'
    };
    return colorMap[workArea] || null;
}

// Initialize drag and drop
function initializeDragAndDrop() {
    const employeePool = document.getElementById('employeePool');
    const workAreaColumns = document.querySelectorAll('.work-area-column');

    new Sortable(employeePool, {
        group: 'employees',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onAdd: function(evt) {
            updateCounts();
            updateAssignmentSummary();
            trackAssignmentChange(evt.item.dataset.empId, evt.from.dataset.workArea, null);
        },
        onRemove: function(evt) {
            updateCounts();
            updateAssignmentSummary();
            trackAssignmentChange(evt.item.dataset.empId, null, evt.to.dataset.workArea);
        }
    });

    workAreaColumns.forEach(column => {
        if (column.id !== 'unassignedEmployees') {
            new Sortable(column, {
                group: 'employees',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onAdd: function(evt) {
                    updateCounts();
                    updateAssignmentSummary();
                    trackAssignmentChange(evt.item.dataset.empId, evt.from.dataset.workArea, evt.to.dataset.workArea);
                },
                onRemove: function(evt) {
                    updateCounts();
                    updateAssignmentSummary();
                    trackAssignmentChange(evt.item.dataset.empId, evt.to.dataset.workArea, evt.from.dataset.workArea);
                }
            });
        }
    });
}

// Track assignment changes
function trackAssignmentChange(empId, fromWorkArea, toWorkArea) {
    console.log(`Employee ${empId} moved from ${fromWorkArea || 'Available'} to ${toWorkArea || 'Available'}`);
    
    if (fromWorkArea && currentAssignments[fromWorkArea]) {
        const index = currentAssignments[fromWorkArea].indexOf(empId);
        if (index > -1) {
            currentAssignments[fromWorkArea].splice(index, 1);
        }
    }
    
    if (toWorkArea) {
        if (!currentAssignments[toWorkArea]) {
            currentAssignments[toWorkArea] = [];
        }
        if (!currentAssignments[toWorkArea].includes(empId)) {
            currentAssignments[toWorkArea].push(empId);
        }
    }
}

// Update counts
function updateCounts() {
    const availableCards = document.querySelectorAll('#employeePool .employee-card');
    document.getElementById('availableCount').textContent = `(${availableCards.length})`;

    const workAreaColumns = document.querySelectorAll('.work-area-column[data-work-area]');
    workAreaColumns.forEach(column => {
        const cards = column.querySelectorAll('.employee-card');
        const countSpan = column.querySelector('.count');
        if (countSpan) {
            countSpan.textContent = `(${cards.length})`;
        }
    });
}

// Update assignment summary
function updateAssignmentSummary() {
    const summary = document.getElementById('assignmentSummary');
    if (!summary) return;
    
    const totalAssigned = Object.values(currentAssignments).reduce((sum, arr) => sum + arr.length, 0);
    const totalAvailable = employees.length - totalAssigned;
    
    summary.innerHTML = `
        <strong>Assigned:</strong> ${totalAssigned} | 
        <strong>Available:</strong> ${totalAvailable}
    `;
}

// Enhanced save all assignments with work area updates
async function saveAllAssignments() {
    try {
        showOverlay('Saving assignments...');
        
        const selectedDate = document.getElementById('assignmentDate').value;
        
        if (!selectedDate) {
            showAlert('Please select a date', 'warning');
            return;
        }

        const assignmentData = [];
        const seen = new Set();
        const workAreaColumns = document.querySelectorAll('.work-area-column[data-work-area]');
        
        workAreaColumns.forEach(column => {
            const workArea = column.dataset.workArea;
            const employeeCards = column.querySelectorAll('.employee-card');
            
            employeeCards.forEach(card => {
                const empId = card.dataset.empId;
                
                // Prevent duplicate assignments
                if (seen.has(empId)) {
                    throw new Error(`Duplicate assignment detected for employee ID: ${empId}`);
                }
                seen.add(empId);
                
                const employee = employees.find(emp => emp.empId === empId);
                if (employee) {
                    // Update employee's current work area
                    employee.currentWorkArea = workArea;
                    
                    assignmentData.push({
                        date: selectedDate,
                        workArea: workArea,
                        empId: employee.empId,
                        name: employee.name,
                        designation: employee.designation,
                        type: employee.type,
                        machine: employee.machine || '',
                        phone: employee.phone
                    });
                }
            });
        });

        await makeApiCall('saveAssignments', { assignments: assignmentData });
        showAlert(`✅ Saved ${assignmentData.length} assignments for ${selectedDate}`, 'success');
        
        // Update local assignments data
        assignments = assignments.filter(a => a.date !== selectedDate);
        assignments.push(...assignmentData);
        
        currentAssignments = {};
        assignmentData.forEach(assignment => {
            if (!currentAssignments[assignment.workArea]) {
                currentAssignments[assignment.workArea] = [];
            }
            currentAssignments[assignment.workArea].push(assignment.empId);
        });
        
        console.log('Assignments saved and employee work areas updated');
        
    } catch (error) {
        console.error('Error saving assignments:', error);
        showAlert(error.message || 'Error saving assignments', 'danger');
    } finally {
        hideOverlay();
    }
}

// Clear assignments for selected date
async function clearAssignmentsForDate() {
    const selectedDate = document.getElementById('assignmentDate').value;
    
    if (!selectedDate) {
        showAlert('Please select a date', 'warning');
        return;
    }
    
    if (!confirm(`Are you sure you want to clear all assignments for ${selectedDate}?`)) {
        return;
    }

    try {
        showOverlay('Clearing assignments...');
        
        await makeApiCall('saveAssignments', { assignments: [] });
        showAlert(`✅ Cleared all assignments for ${selectedDate}`, 'success');
        
        // Move all employees back to available pool
        const employeePool = document.getElementById('employeePool');
        const workAreaColumns = document.querySelectorAll('.work-area-column[data-work-area]');
        
        workAreaColumns.forEach(column => {
            const employeeCards = column.querySelectorAll('.employee-card');
            employeeCards.forEach(card => {
                employeePool.appendChild(card);
            });
        });

        currentAssignments = {};
        updateCounts();
        updateAssignmentSummary();
        
    } catch (error) {
        console.error('Error clearing assignments:', error);
        showAlert('Error clearing assignments', 'danger');
    } finally {
        hideOverlay();
    }
}

// Export assignments to Excel
async function exportAssignmentsToExcel() {
    try {
        const selectedDate = document.getElementById('assignmentDate').value;
        
        if (!selectedDate) {
            showAlert('Please select a date', 'warning');
            return;
        }
        
        showOverlay('Exporting assignments to Excel...');
        
        const assignmentsData = await makeApiCall('getAssignments', { date: selectedDate });
        
        if (!assignmentsData || assignmentsData.length === 0) {
            showAlert('No assignments found for the selected date', 'info');
            return;
        }
        
        const exportData = assignmentsData.map(assignment => ({
            'Date': assignment.date,
            'Work Area': assignment.workArea,
            'Employee ID': assignment.empId,
            'Name': assignment.name,
            'Designation': assignment.designation,
            'Type': assignment.type,
            'Machine': assignment.machine || 'N/A',
            'Phone': assignment.phone
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Assignments');
        
        XLSX.writeFile(wb, `assignments_${selectedDate}.xlsx`);
        showAlert('✅ Excel file exported successfully!', 'success');
        
    } catch (error) {
        console.error('Error exporting assignments:', error);
        showAlert('Error exporting assignments', 'danger');
    } finally {
        hideOverlay();
    }
}

// Export employees to PDF
function exportEmployeesToPDF() {
    try {
        showOverlay('Exporting employees to PDF...');
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFontSize(18);
        doc.text('Employee List Report', 20, 20);

        doc.setFontSize(12);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 35);
        doc.text(`Total Employees: ${employees.length}`, 20, 45);

        let yPos = 60;
        const headers = ['ID', 'Name', 'Designation', 'Type', 'Machine', 'Phone'];
        const colWidths = [25, 50, 45, 35, 45, 40];
        let xPos = 20;
        
        doc.setFontSize(9);
        doc.setFillColor(102, 126, 234);
        doc.rect(20, yPos - 5, 240, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont(undefined, 'bold');
        
        headers.forEach((header, index) => {
            doc.text(header, xPos + 2, yPos);
            xPos += colWidths[index];
        });

        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        yPos += 15;

        employees.forEach(employee => {
            if (yPos > 180) {
                doc.addPage();
                yPos = 20;
            }
            
            xPos = 20;
            const rowData = [
                employee.empId || '',
                employee.name || '',
                employee.designation || '',
                employee.type || '',
                employee.machine || 'N/A',
                employee.phone || ''
            ];
            
            rowData.forEach((data, index) => {
                const maxWidth = colWidths[index] - 4;
                const lines = doc.splitTextToSize(data.toString(), maxWidth);
                doc.text(lines[0] || '', xPos + 2, yPos);
                xPos += colWidths[index];
            });
            yPos += 12;
        });

        doc.save(`employee_list_${new Date().toISOString().split('T')[0]}.pdf`);
        showAlert('✅ PDF exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting PDF:', error);
        showAlert('Error exporting PDF', 'danger');
    } finally {
        hideOverlay();
    }
}

// Export employees to Excel
function exportEmployeesToExcel() {
    try {
        showOverlay('Exporting employees to Excel...');
        
        const ws = XLSX.utils.json_to_sheet(employees.map(emp => ({
            'Employee ID': emp.empId,
            'Name': emp.name,
            'Designation': emp.designation,
            'Type': emp.type,
            'Machine': emp.machine || 'N/A',
            'Phone': emp.phone,
            'Notes': emp.notes || ''
        })));
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Employees');
        
        XLSX.writeFile(wb, `employees_${new Date().toISOString().split('T')[0]}.xlsx`);
        showAlert('✅ Excel file exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showAlert('Error exporting to Excel', 'danger');
    } finally {
        hideOverlay();
    }
}

// Set today's date for date inputs
function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = ['assignmentDate', 'startDate', 'endDate'];
    dateInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = today;
        }
    });
}

// Enhanced load report filters with sync button
function loadReportFilters() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;
    
    // Add sync button
    addSyncButtonToReports();
}

// Update report type
function updateReportType() {
    currentReportType = document.getElementById('reportType').value;
    console.log('Report type changed to:', currentReportType);
}

// Enhanced generate report with flexible filtering
async function generateReport() {
    try {
        showOverlay('Generating report...');
        
        const reportType = document.getElementById('reportType').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const workArea = document.getElementById('filterWorkArea').value;
        const designation = document.getElementById('filterDesignation').value;
        const type = document.getElementById('filterType').value;

        if (!startDate || !endDate) {
            showAlert('Please select date range', 'danger');
            return;
        }

        if (new Date(startDate) > new Date(endDate)) {
            showAlert('Start date cannot be after end date', 'danger');
            return;
        }

        let rawData = [];

        if (reportType === 'assignment') {
            try {
                const reportResponse = await makeApiCall('getReport', { 
                    filters: { startDate, endDate, workArea, designation, type } 
                });
                
                if (Array.isArray(reportResponse)) {
                    rawData = reportResponse;
                } else if (reportResponse && Array.isArray(reportResponse.data)) {
                    rawData = reportResponse.data;
                } else {
                    rawData = [];
                }
                
                console.log('API Response:', rawData);
                
                if (rawData.length === 0) {
                    console.log('No API data, checking local assignments...');
                    rawData = assignments.filter(a => {
                        const aDate = a.date;
                        return aDate >= startDate && aDate <= endDate;
                    });
                    console.log('Local assignments:', rawData);
                }
                
            } catch (error) {
                console.log('Using local assignment data due to API error:', error);
                rawData = assignments.filter(a => {
                    const aDate = a.date;
                    return aDate >= startDate && aDate <= endDate;
                });
            }
        } else if (reportType === 'employee') {
            // For employee reports, get current work area from latest assignment
            rawData = employees.map(emp => {
                const latestAssignment = assignments
                    .filter(a => a.empId === emp.empId)
                    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                
                return {
                    empId: emp.empId,
                    name: emp.name,
                    designation: emp.designation,
                    type: emp.type,
                    machine: emp.machine || 'N/A',
                    workArea: latestAssignment ? latestAssignment.workArea : (emp.currentWorkArea || emp.workArea || 'Not Assigned'),
                    phone: emp.phone,
                    notes: emp.notes || ''
                };
            });
        } else if (reportType === 'summary') {
            rawData = generateSummaryData(startDate, endDate);
        }

        console.log('Raw data before filtering:', rawData);

        // Enhanced flexible filtering
        filteredReportData = rawData.filter(item => {
            // Work area filter with flexible matching
            if (workArea && workArea !== "") {
                const itemWorkArea = item.workArea || '';
                const filterWorkArea = workArea;
                
                // Exact match first
                if (itemWorkArea === filterWorkArea) {
                    // Continue to other filters
                } else if (itemWorkArea.toLowerCase().includes(filterWorkArea.toLowerCase()) ||
                          filterWorkArea.toLowerCase().includes(itemWorkArea.toLowerCase())) {
                    // Partial match - continue to other filters
                } else {
                    return false;
                }
            }
            
            // Designation filter
            if (designation && designation !== "" && item.designation !== designation) {
                return false;
            }
            
            // Type filter
            if (type && type !== "" && item.type !== type) {
                return false;
            }
            
            return true;
        });

        console.log('Filtered data:', filteredReportData);

        displayReportStats(filteredReportData, reportType);
        displayReportTable(filteredReportData, reportType);
        document.getElementById('exportButtons').style.display = 'block';

        if (filteredReportData.length === 0) {
            showAlert('ℹ️ No data found matching the selected filters. Check console for details.', 'info');
            console.log('Debug info:', {
                reportType, startDate, endDate, workArea, designation, type,
                rawDataLength: rawData.length,
                filteredDataLength: filteredReportData.length,
                availableWorkAreas: [...new Set(rawData.map(d => d.workArea))],
                selectedWorkArea: workArea
            });
        } else {
            showAlert(`✅ Generated ${reportType} report with ${filteredReportData.length} records`, 'success');
        }

    } catch (error) {
        console.error('Error generating report:', error);
        showAlert('Error generating report: ' + error.message, 'danger');
    } finally {
        hideOverlay();
    }
}

// Generate summary data
function generateSummaryData(startDate, endDate) {
    const summaryData = [];
    
    const dateRangeAssignments = assignments.filter(a => {
        return a.date >= startDate && a.date <= endDate;
    });
    
    employees.forEach(employee => {
        const empAssignments = dateRangeAssignments.filter(a => a.empId === employee.empId);
        const uniqueWorkAreas = [...new Set(empAssignments.map(a => a.workArea))];
        const totalDaysWorked = empAssignments.length;
        
        // Get latest work area
        const latestAssignment = assignments
            .filter(a => a.empId === employee.empId)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        
        summaryData.push({
            empId: employee.empId,
            name: employee.name,
            designation: employee.designation,
            type: employee.type,
            machine: employee.machine || 'N/A',
            workArea: latestAssignment ? latestAssignment.workArea : (uniqueWorkAreas.join(', ') || 'Not Assigned'),
            phone: employee.phone,
            totalDaysWorked: totalDaysWorked,
            workAreasCount: uniqueWorkAreas.length
        });
    });
    
    return summaryData;
}

// Display report statistics
function displayReportStats(data, reportType) {
    const statsContainer = document.getElementById('reportStats');
    statsContainer.innerHTML = '';
    statsContainer.style.display = 'grid';

    if (data.length === 0) {
        statsContainer.innerHTML = '<div class="alert alert-info">No data found for the selected criteria</div>';
        return;
    }

    // Total records card
    const totalCard = document.createElement('div');
    totalCard.className = 'stat-card';
    totalCard.style.background = 'linear-gradient(45deg, #667eea, #764ba2)';
    totalCard.innerHTML = `<h3>${data.length}</h3><p>Total ${reportType === 'assignment' ? 'Assignments' : reportType === 'employee' ? 'Employees' : 'Records'}</p>`;
    statsContainer.appendChild(totalCard);

    if (reportType === 'assignment' || reportType === 'summary') {
        const uniqueEmployees = new Set(data.map(item => item.name || item.empId)).size;
        const uniqueCard = document.createElement('div');
        uniqueCard.className = 'stat-card';
        uniqueCard.style.background = 'linear-gradient(45deg, #56ab2f, #a8e6cf)';
        uniqueCard.innerHTML = `<h3>${uniqueEmployees}</h3><p>Unique Employees</p>`;
        statsContainer.appendChild(uniqueCard);
    }

    // Work area breakdown
    const workAreaStats = {};
    data.forEach(item => {
        const workArea = item.workArea || 'Unassigned';
        workAreaStats[workArea] = (workAreaStats[workArea] || 0) + 1;
    });

    Object.entries(workAreaStats).slice(0, 3).forEach(([workArea, count]) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.background = 'linear-gradient(45deg, #ff9a9e, #fecfef)';
        card.innerHTML = `<h3>${count}</h3><p>${workArea}</p>`;
        statsContainer.appendChild(card);
    });

    // Type breakdown
    const typeStats = {};
    data.forEach(item => {
        typeStats[item.type] = (typeStats[item.type] || 0) + 1;
    });

    Object.entries(typeStats).forEach(([type, count]) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.background = 'linear-gradient(45deg, #f093fb, #f5576c)';
        card.innerHTML = `<h3>${count}</h3><p>${type}</p>`;
        statsContainer.appendChild(card);
    });
}

// Display report table
function displayReportTable(data, reportType) {
    const table = document.getElementById('reportTable');
    const thead = document.getElementById('reportTableHeader');
    const tbody = table.querySelector('tbody');
    
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #666;">No data found matching the filters</td></tr>';
        table.style.display = 'table';
        return;
    }

    let headers = [];
    if (reportType === 'assignment') {
        headers = ['Date', 'Employee', 'Designation', 'Type', 'Machine', 'Work Area', 'Phone'];
    } else if (reportType === 'employee') {
        headers = ['ID', 'Name', 'Designation', 'Type', 'Machine', 'Current Area', 'Phone'];
    } else if (reportType === 'summary') {
        headers = ['Employee', 'Designation', 'Type', 'Machine', 'Work Areas', 'Days Worked', 'Phone'];
    }

    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        thead.appendChild(th);
    });

    data.forEach(item => {
        const row = document.createElement('tr');
        
        if (reportType === 'assignment') {
            row.innerHTML = `
                <td>${item.date || 'N/A'}</td>
                <td>${item.name || 'N/A'}</td>
                <td>${item.designation || 'N/A'}</td>
                <td>${item.type || 'N/A'}</td>
                <td>${item.machine || 'N/A'}</td>
                <td>${item.workArea || 'N/A'}</td>
                <td>${item.phone || 'N/A'}</td>
            `;
        } else if (reportType === 'employee') {
            row.innerHTML = `
                <td>${item.empId || 'N/A'}</td>
                <td>${item.name || 'N/A'}</td>
                <td>${item.designation || 'N/A'}</td>
                <td>${item.type || 'N/A'}</td>
                <td>${item.machine || 'N/A'}</td>
                <td>${item.workArea || 'N/A'}</td>
                <td>${item.phone || 'N/A'}</td>
            `;
        } else if (reportType === 'summary') {
            row.innerHTML = `
                <td>${item.name || 'N/A'}</td>
                <td>${item.designation || 'N/A'}</td>
                <td>${item.type || 'N/A'}</td>
                <td>${item.machine || 'N/A'}</td>
                <td>${item.workArea || 'N/A'}</td>
                <td>${item.totalDaysWorked || 0}</td>
                <td>${item.phone || 'N/A'}</td>
            `;
        }
        
        tbody.appendChild(row);
    });

    table.style.display = 'table';
}

// Export report to Excel
function exportReportToExcel() {
    try {
        if (!filteredReportData || filteredReportData.length === 0) {
            showAlert('No data to export', 'warning');
            return;
        }

        showOverlay('Exporting report to Excel...');
        
        const reportType = document.getElementById('reportType').value;
        let exportData = [];

        if (reportType === 'assignment') {
            exportData = filteredReportData.map(item => ({
                'Date': item.date || 'N/A',
                'Employee Name': item.name || 'N/A',
                'Designation': item.designation || 'N/A',
                'Employment Type': item.type || 'N/A',
                'Machine/Vehicle': item.machine || 'N/A',
                'Work Area': item.workArea || 'N/A',
                'Phone Number': item.phone || 'N/A'
            }));
        } else if (reportType === 'employee') {
            exportData = filteredReportData.map(item => ({
                'Employee ID': item.empId || 'N/A',
                'Name': item.name || 'N/A',
                'Designation': item.designation || 'N/A',
                'Employment Type': item.type || 'N/A',
                'Machine/Vehicle': item.machine || 'N/A',
                'Current Work Area': item.workArea || 'N/A',
                'Phone Number': item.phone || 'N/A'
            }));
        } else if (reportType === 'summary') {
            exportData = filteredReportData.map(item => ({
                'Employee Name': item.name || 'N/A',
                'Designation': item.designation || 'N/A',
                'Employment Type': item.type || 'N/A',
                'Machine/Vehicle': item.machine || 'N/A',
                'Work Areas': item.workArea || 'N/A',
                'Total Days Worked': item.totalDaysWorked || 0,
                'Phone Number': item.phone || 'N/A'
            }));
        }

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`);
        
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const filename = `${reportType}_report_${startDate}_to_${endDate}.xlsx`;
        
        XLSX.writeFile(wb, filename);
        showAlert('✅ Excel file exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showAlert('Error exporting to Excel', 'danger');
    } finally {
        hideOverlay();
    }
}

// Export report to PDF
function exportReportToPDF() {
    try {
        if (!filteredReportData || filteredReportData.length === 0) {
            showAlert('No data to export', 'warning');
            return;
        }

        showOverlay('Exporting report to PDF...');
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const reportType = document.getElementById('reportType').value;

        doc.setFontSize(16);
        doc.text(`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`, 20, 20);

        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        doc.setFontSize(11);
        doc.text(`Date Range: ${startDate} to ${endDate}`, 20, 35);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 45);
        doc.text(`Total Records: ${filteredReportData.length}`, 20, 55);

        let yPos = 70;
        let headers = [];
        let colWidths = [];
        
        if (reportType === 'assignment') {
            headers = ['Date', 'Employee', 'Designation', 'Type', 'Machine', 'Work Area', 'Phone'];
            colWidths = [25, 40, 35, 25, 35, 40, 35];
        } else if (reportType === 'employee') {
            headers = ['ID', 'Name', 'Designation', 'Type', 'Machine', 'Area', 'Phone'];
            colWidths = [20, 40, 35, 25, 35, 40, 35];
        } else if (reportType === 'summary') {
            headers = ['Employee', 'Designation', 'Type', 'Machine', 'Areas', 'Days', 'Phone'];
            colWidths = [40, 35, 25, 35, 40, 20, 35];
        }
        
        // Headers
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setFillColor(102, 126, 234);
        doc.rect(20, yPos - 5, 250, 8, 'F');
        doc.setTextColor(255, 255, 255);
        
        let xPos = 20;
        headers.forEach((header, index) => {
            doc.text(header, xPos + 2, yPos);
            xPos += colWidths[index];
        });

        // Data
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0);
        yPos += 15;
        
        filteredReportData.forEach((item) => {
            if (yPos > 180) {
                doc.addPage();
                yPos = 20;
            }
            
            xPos = 20;
            let rowData = [];
            
            if (reportType === 'assignment') {
                rowData = [
                    item.date || 'N/A',
                    item.name || 'N/A',
                    item.designation || 'N/A',
                    item.type || 'N/A',
                    item.machine || 'N/A',
                    item.workArea || 'N/A',
                    item.phone || 'N/A'
                ];
            } else if (reportType === 'employee') {
                rowData = [
                    item.empId || 'N/A',
                    item.name || 'N/A',
                    item.designation || 'N/A',
                    item.type || 'N/A',
                    item.machine || 'N/A',
                    item.workArea || 'N/A',
                    item.phone || 'N/A'
                ];
            } else if (reportType === 'summary') {
                rowData = [
                    item.name || 'N/A',
                    item.designation || 'N/A',
                    item.type || 'N/A',
                    item.machine || 'N/A',
                    item.workArea || 'N/A',
                    (item.totalDaysWorked || 0).toString(),
                    item.phone || 'N/A'
                ];
            }
            
            rowData.forEach((data, index) => {
                const maxWidth = colWidths[index] - 4;
                const lines = doc.splitTextToSize(data.toString(), maxWidth);
                doc.text(lines[0] || '', xPos + 2, yPos);
                xPos += colWidths[index];
            });
            yPos += 10;
        });

        const filename = `${reportType}_report_${startDate}_to_${endDate}.pdf`;
        doc.save(filename);
        showAlert('✅ PDF exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        showAlert('Error exporting to PDF', 'danger');
    } finally {
        hideOverlay();
    }
}

// Edit employee with enhanced functionality
function editEmployee(empId) {
    const employee = employees.find(emp => emp.empId === empId);
    if (employee) {
        // Populate form fields
        document.getElementById('editEmpId').value = employee.empId;
        document.getElementById('editEmpName').value = employee.name;
        document.getElementById('editEmpDesignation').value = employee.designation;
        document.getElementById('editEmpMachine').value = employee.machine || '';
        document.getElementById('editEmpPhone').value = employee.phone;
        
        // Set employment type radio buttons
        const employmentType = employee.type;
        if (employmentType === 'Own Company') {
            document.getElementById('editOwnCompany').checked = true;
        } else if (employmentType === 'Rental') {
            document.getElementById('editRental').checked = true;
        }
        
        // Show modal
        document.getElementById('editModal').style.display = 'block';
    }
}

// Delete employee
async function deleteEmployee(empId) {
    const employee = employees.find(emp => emp.empId === empId);
    const employeeName = employee ? employee.name : empId;
    
    if (!confirm(`Are you sure you want to delete employee "${employeeName}"? This action cannot be undone.`)) {
        return;
    }

    const row = event.target.closest('tr');
    const buttons = row.querySelectorAll('button');
    buttons.forEach(btn => {
        btn.innerHTML = '<div class="loading" style="display: inline-block;"></div>';
        btn.disabled = true;
    });

    try {
        await makeApiCall('deleteEmployee', { empId });
        employees = employees.filter(emp => emp.empId !== empId);
        loadEmployeeTable();
        showAlert(`✅ Employee "${employeeName}" deleted successfully!`, 'success');
    } catch (error) {
        console.error('Error deleting employee:', error);
        showAlert(error.message || 'Error deleting employee', 'danger');
        loadEmployeeTable();
    }
}

// Enhanced edit employee form submission
document.getElementById('editEmployeeForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const empId = document.getElementById('editEmpId').value;
    const name = document.getElementById('editEmpName').value.trim();
    const designation = document.getElementById('editEmpDesignation').value;
    const machine = document.getElementById('editEmpMachine').value;
    const phone = document.getElementById('editEmpPhone').value.trim();
    const type = document.querySelector('input[name="editEmploymentType"]:checked')?.value;

    // Validation
    if (!name || name.length < 2) {
        showAlert('Name must be at least 2 characters', 'danger');
        return;
    }

    if (!designation) {
        showAlert('Please select a designation', 'danger');
        return;
    }

    if (!type) {
        showAlert('Please select employment type', 'danger');
        return;
    }

    if (!/^\d{10}$/.test(phone)) {
        showAlert('Phone number must be exactly 10 digits', 'danger');
        return;
    }

    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = '<div class="loading" style="display: inline-block; margin-right: 5px;"></div>Updating...';
    submitBtn.disabled = true;

    try {
        await makeApiCall('updateEmployee', { 
            empId, 
            employee: { 
                name, 
                designation, 
                type, 
                machine: machine || '',
                phone 
            } 
        });

        // Update local employee data
        const employeeIndex = employees.findIndex(emp => emp.empId === empId);
        if (employeeIndex !== -1) {
            employees[employeeIndex].name = name;
            employees[employeeIndex].designation = designation;
            employees[employeeIndex].type = type;
            employees[employeeIndex].machine = machine || '';
            employees[employeeIndex].phone = phone;
        }

        loadEmployeeTable();
        closeModal();
        showAlert(`✅ Employee "${name}" updated successfully!`, 'success');
    } catch (error) {
        console.error('Error updating employee:', error);
        showAlert(error.message || 'Error updating employee', 'danger');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// Close modal
function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

// Show alert messages
function showAlert(message, type) {
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="float: right; background: none; border: none; font-size: 18px; cursor: pointer; color: inherit;">&times;</button>
    `;

    const activeTab = document.querySelector('.tab-content.active');
    activeTab.insertBefore(alert, activeTab.firstChild);

    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 5000);
}

// Enhanced work area sync from data
async function syncWorkAreasFromData() {
    try {
        showOverlay('Syncing work areas from data...');
        
        // Get unique work areas from assignments
        const workAreasFromAssignments = [...new Set(assignments.map(a => a.workArea))].filter(Boolean);
        
        // Try to get more data from API
        try {
            const allAssignments = await makeApiCall('getReport', { 
                filters: { 
                    startDate: '2020-01-01', 
                    endDate: '2030-12-31' 
                } 
            });
            
            if (allAssignments && allAssignments.length > 0) {
                const apiWorkAreas = [...new Set(allAssignments.map(a => a.workArea))].filter(Boolean);
                workAreasFromAssignments.push(...apiWorkAreas);
            }
        } catch (error) {
            console.log('Could not get additional work areas from API');
        }
        
        // Update dropdowns
        const uniqueWorkAreas = [...new Set([...dropdowns.workAreas, ...workAreasFromAssignments])];
        dropdowns.workAreas = uniqueWorkAreas;
        
        // Repopulate dropdowns
        populateDropdowns();
        
        console.log('Work areas synced:', uniqueWorkAreas);
        showAlert(`✅ Synchronized ${workAreasFromAssignments.length} work areas from data`, 'success');
        
    } catch (error) {
        console.error('Error syncing work areas:', error);
        showAlert('Error syncing work areas', 'danger');
    } finally {
        hideOverlay();
    }
}

// Add sync button to reports
function addSyncButtonToReports() {
    const filtersGrid = document.querySelector('.filters-grid');
    if (filtersGrid && !document.getElementById('syncWorkAreasBtn')) {
        const syncDiv = document.createElement('div');
        syncDiv.className = 'form-group';
        syncDiv.innerHTML = `
            <button id="syncWorkAreasBtn" class="btn btn-info" onclick="syncWorkAreasFromData()">
                🔄 Sync Work Areas
            </button>
        `;
        filtersGrid.appendChild(syncDiv);
    }
}

// Debug helpers
function debugReportData() {
    console.log('=== DEBUG REPORT DATA ===');
    console.log('Employees:', employees.length, employees);
    console.log('Assignments:', assignments.length, assignments);
    console.log('Work Areas in Dropdowns:', dropdowns.workAreas);
    console.log('Work Areas in Assignments:', [...new Set(assignments.map(a => a.workArea))]);
    console.log('Current Assignments:', currentAssignments);
    console.log('========================');
}

// Simulate API call for demo mode
async function simulateApiCall(action, data = {}) {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log(`📡 Demo simulation for: ${action}`);
            
            switch (action) {
                case 'getDropdowns':
                    resolve(getDefaultDropdowns());
                    break;
                case 'getEmployees':
                    if (employees.length === 0) {
                        resolve([
                            {
                                empId: 'EMP001',
                                name: 'Bala Sai',
                                designation: 'Mech Engineer',
                                type: 'Own Company',
                                machine: '',
                                phone: '8367617012',
                                workArea: 'ch154 - ch159 - RamBabu',
                                notes: 'Sample employee'
                            },
                            {
                                empId: 'EMP002',
                                name: 'John Doe',
                                designation: 'Supervisor',
                                type: 'Rental',
                                machine: 'Excavator-01',
                                phone: '9876543211',
                                workArea: 'ch159 - ch165 - Shyam',
                                notes: 'Sample employee'
                            }
                        ]);
                    } else {
                        resolve(employees);
                    }
                    break;
                case 'getAssignments':
                    const date = data.date || new Date().toISOString().split('T')[0];
                    resolve(assignments.filter(a => a.date === date));
                    break;
                case 'getReport':
                    const filters = data.filters || {};
                    let reportData = assignments;
                    
                    if (filters.startDate && filters.endDate) {
                        reportData = reportData.filter(a => 
                            a.date >= filters.startDate && a.date <= filters.endDate
                        );
                    }
                    
                    resolve(reportData);
                    break;
                default:
                    resolve([]);
            }
        }, 300);
    });
}

// Event listeners
window.onclick = function(event) {
    const modal = document.getElementById('editModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
    
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'assignment-board') {
            saveAllAssignments();
        }
    }

    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'reports') {
            generateReport();
        }
    }
});

// Phone number formatting
document.getElementById('phoneNumber').addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 10) {
        value = value.substring(0, 10);
    }
    e.target.value = value;
});

// Phone number formatting for edit form
document.getElementById('editEmpPhone').addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 10) {
        value = value.substring(0, 10);
    }
    e.target.value = value;
});

// Name validation for edit form
document.getElementById('editEmpName').addEventListener('input', function(e) {
    const value = e.target.value;
    if (value.length > 50) {
        e.target.value = value.substring(0, 50);
    }
});

// Form validation enhancements
document.getElementById('employeeName').addEventListener('input', function(e) {
    const value = e.target.value;
    if (value.length > 50) {
        e.target.value = value.substring(0, 50);
    }
});

document.getElementById('notes').addEventListener('input', function(e) {
    const value = e.target.value;
    if (value.length > 500) {
        e.target.value = value.substring(0, 500);
    }
});

// Date validation
document.getElementById('startDate').addEventListener('change', function(e) {
    const startDate = e.target.value;
    const endDateInput = document.getElementById('endDate');
    const endDate = endDateInput.value;
    
    if (endDate && startDate > endDate) {
        endDateInput.value = startDate;
        showAlert('End date adjusted to match start date', 'info');
    }
});

document.getElementById('endDate').addEventListener('change', function(e) {
    const endDate = e.target.value;
    const startDateInput = document.getElementById('startDate');
    const startDate = startDateInput.value;
    
    if (startDate && endDate < startDate) {
        startDateInput.value = endDate;
        showAlert('Start date adjusted to match end date', 'info');
    }
});

// Global functions for debugging and utilities
window.debugReportData = debugReportData;
window.syncWorkAreasFromData = syncWorkAreasFromData;

// Console welcome message
console.log(`
🏗️ Construction Management System v4.0 - Final Enhanced Edition
✅ Latest Features:
  • Enhanced work area synchronization from Excel data
  • Flexible report filtering with partial matching
  • Current work area tracking from latest assignments
  • Real-time Google Sheets integration with fallback
  • Advanced debugging tools
  • Multiple export formats (PDF, Excel)
  • Drag & drop assignment board
  • Mobile responsive design

🔧 Key Enhancements:
  • Dynamic work area detection from assignment data
  • Employee current work area from latest assignment
  • Flexible filtering for report generation
  • Enhanced error handling and logging
  • Debug functions: debugReportData(), syncWorkAreasFromData()
  • Auto-sync work areas from Excel data
  • Keyboard shortcuts (Ctrl+S, Ctrl+R)
  • Complete employee management with edit functionality

📊 Current Status:
  • Employees: ${employees.length}
  • Assignments: ${assignments.length}
  • Work Areas: ${dropdowns.workAreas.length}
  • Demo Mode: ${isDemoMode}
  • Connection: ${isDemoMode ? 'Offline' : 'Online'}
  • Last Board Date: ${localStorage.getItem('LAST_BOARD_DATE') || 'None'}

🛠️ Debug Commands:
  • debugReportData() - View all loaded data
  • syncWorkAreasFromData() - Sync work areas from Excel
  • Use "🔄 Sync Work Areas" button in Reports tab
`);