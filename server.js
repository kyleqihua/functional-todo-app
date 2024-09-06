const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;
const dbPath = process.env.DB_PATH || './todo.db';

// 设置信任代理
app.set('trust proxy', true);

// 连接到 SQLite 数据库
const db = new sqlite3.Database(dbPath);

// 将数据库操作包装在 Promise 中
const dbAll = (query, params) => new Promise((resolve, reject) => {
  db.all(query, params, (error, rows) => {
    if (error) reject(error);
    else resolve(rows);
  });
});

const dbRun = (query, params) => new Promise((resolve, reject) => {
  db.run(query, params, function(error) {
    if (error) reject(error);
    else resolve(this);
  });
});

// 迁移：检查并添加 last_updated 列
const migrateDatabase = async () => {
  try {
    const rows = await dbAll("PRAGMA table_info(tasks)", []);
    const hasLastUpdated = rows.some(row => row.name === 'last_updated');
    if (!hasLastUpdated) {
      await dbRun("ALTER TABLE tasks ADD COLUMN last_updated INTEGER");
      console.log('Added last_updated column to tasks table');
    }
  } catch (error) {
    console.error('Error during database migration:', error);
  }
};

// 创建任务表和用户表
const createTables = async () => {
  try {
    await dbRun(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_ip TEXT,
      text TEXT,
      completed INTEGER,
      last_updated INTEGER
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS users (
      ip TEXT PRIMARY KEY,
      display_name TEXT
    )`);
    console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
};

// 初始化数据库
const initializeDatabase = async () => {
  await createTables();
  await migrateDatabase();
};

initializeDatabase().then(() => {
  app.use(express.json());
  app.use(express.static('public'));

  // 获取用户IP的函数
  function getUserIp(req) {
    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
  }

  // 获取所有任务列表
  app.get('/api/tasks', async (req, res) => {
    const userIp = getUserIp(req);
    console.log('Fetching tasks for IP:', userIp);
    try {
      const rows = await dbAll(`
        SELECT tasks.*, users.display_name 
        FROM tasks 
        LEFT JOIN users ON tasks.user_ip = users.ip 
        ORDER BY 
          CASE WHEN user_ip = ? THEN 0 ELSE 1 END, 
          last_updated DESC
      `, [userIp]);
      console.log('Tasks fetched:', rows);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 添加新任务
  app.post('/api/tasks', async (req, res) => {
    const { text } = req.body;
    const userIp = getUserIp(req);
    const timestamp = Date.now();
    console.log('Adding new task:', { text, userIp, timestamp });
    try {
      const result = await dbRun('INSERT INTO tasks (user_ip, text, completed, last_updated) VALUES (?, ?, 0, ?)', [userIp, text, timestamp]);
      console.log('Task added successfully, ID:', result.lastID);
      res.json({ id: result.lastID });
    } catch (error) {
      console.error('Error adding task:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 更新任务状态
  app.put('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;
    const userIp = getUserIp(req);
    const timestamp = Date.now();
    try {
      const result = await dbRun('UPDATE tasks SET completed = ?, last_updated = ? WHERE id = ? AND user_ip = ?', [completed ? 1 : 0, timestamp, id, userIp]);
      res.json({ changes: result.changes });
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 删除任务
  app.delete('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const userIp = getUserIp(req);
    try {
      const result = await dbRun('DELETE FROM tasks WHERE id = ? AND user_ip = ?', [id, userIp]);
      res.json({ changes: result.changes });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 更新显示名称
  app.post('/api/update-name', async (req, res) => {
    const { displayName } = req.body;
    const userIp = getUserIp(req);
    try {
      await dbRun('INSERT OR REPLACE INTO users (ip, display_name) VALUES (?, ?)', [userIp, displayName]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating display name:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取当前用户信息
  app.get('/api/user', async (req, res) => {
    const userIp = getUserIp(req);
    try {
      const row = await dbAll('SELECT * FROM users WHERE ip = ?', [userIp]);
      res.json(row[0] || { ip: userIp, display_name: userIp });
    } catch (error) {
      console.error('Error fetching user info:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}).catch(error => {
  console.error('Failed to initialize the database:', error);
});