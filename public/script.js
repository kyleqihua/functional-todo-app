let currentUserIp = '';

async function getUserInfo() {
    const response = await fetch('/api/user');
    const userInfo = await response.json();
    currentUserIp = userInfo.ip;
    document.getElementById('userIp').textContent = userInfo.ip;
    document.getElementById('displayName').value = userInfo.display_name || userInfo.ip;
    console.log('User info:', userInfo); // 新增日志
}

async function updateDisplayName() {
    const displayName = document.getElementById('displayName').value.trim();
    if (displayName) {
        const response = await fetch('/api/update-name', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ displayName }),
        });
        if (response.ok) {
            alert('显示名称已更新');
            await renderTasks();
        }
    }
}

async function getTasks() {
    console.log('Fetching tasks...'); // 新增日志
    const response = await fetch('/api/tasks');
    const tasks = await response.json();
    console.log('Fetched tasks:', tasks); // 新增日志
    return tasks;
}

async function addTask() {
    const newTaskInput = document.getElementById('newTask');
    const tasks = newTaskInput.value.trim().split('\n').filter(task => task.trim() !== '');
    
    if (tasks.length > 0) {
        for (const task of tasks) {
            console.log('Adding task:', task); // 新增日志
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: task.trim() }),
            });
            if (!response.ok) {
                console.error('Failed to add task:', task);
            } else {
                console.log('Task added successfully:', task); // 新增日志
            }
        }
        newTaskInput.value = '';
        await renderTasks();
    }
}

async function toggleTask(id, completed, userIp) {
    if (userIp !== currentUserIp) {
        alert('您不能修改其他用户的任务');
        return;
    }
    const response = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: !completed }),
    });
    if (response.ok) {
        await renderTasks();
    }
}

async function deleteTask(id, userIp) {
    if (userIp !== currentUserIp) {
        alert('您不能删除其他用户的任务');
        return;
    }
    const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
    });
    if (response.ok) {
        await renderTasks();
    }
}

async function renderTasks() {
    console.log('Rendering tasks...'); // 新增日志
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '';
    
    const tasks = await getTasks();
    console.log('Tasks to render:', tasks); // 新增日志
    tasks.forEach(task => {
        const li = document.createElement('li');
        const isCurrentUser = task.user_ip === currentUserIp;
        li.className = `flex items-center mb-2 p-2 rounded ${isCurrentUser ? 'bg-blue-100' : ''}`;
        li.innerHTML = `
            <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id}, ${task.completed}, '${task.user_ip}')" class="mr-2" ${isCurrentUser ? '' : 'disabled'}>
            <span class="${task.completed ? 'task-done' : ''} flex-grow">${task.text}</span>
            <span class="text-sm text-gray-500 mr-2">(${task.display_name || task.user_ip})</span>
            ${isCurrentUser ? `<button onclick="deleteTask(${task.id}, '${task.user_ip}')" class="text-red-500 hover:text-red-700 focus:outline-none">删除</button>` : ''}
        `;
        taskList.appendChild(li);
    });
    console.log('Tasks rendered'); // 新增日志
}

// 初始化
async function init() {
    console.log('Initializing...'); // 新增日志
    await getUserInfo();
    await renderTasks();
    console.log('Initialization complete'); // 新增日志
}

init();