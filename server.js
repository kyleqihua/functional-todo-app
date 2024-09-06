const { Pool } = require("@vercel/postgres");
const express = require("express");
const path = require("path");
const app = express();
const port = process.env.PORT || 3000;

// 设置信任代理
app.set("trust proxy", true);

// 创建 Postgres 连接池
const pool = new Pool({
	connectionString: process.env.POSTGRES_URL,
});

pool.on("error", (err) => {
	console.error("Unexpected error on idle client", err);
	process.exit(-1);
});

// 查询函数
const query = (text, params) => pool.query(text, params);

// 创建任务表和用户表
const createTables = async () => {
	try {
		await query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_ip TEXT,
        text TEXT,
        completed BOOLEAN,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS users (
        ip TEXT PRIMARY KEY,
        display_name TEXT
      )
    `);
		console.log("Tables created successfully");
	} catch (error) {
		console.error("Error creating tables:", error.message);
		console.error("Error stack:", error.stack);
		throw error;
	}
};

// 初始化数据库
const initializeDatabase = async () => {
	console.log("Initializing database...");
	try {
		await createTables();
		console.log("Database initialized successfully");
	} catch (error) {
		console.error("Failed to initialize database:", error.message);
		throw error;
	}
};

initializeDatabase()
	.then(() => {
		app.use(express.json());
		app.use(express.static("public"));

		// 获取用户IP的函数
		function getUserIp(req) {
			return (
				req.ip ||
				req.connection.remoteAddress ||
				req.socket.remoteAddress ||
				req.connection.socket.remoteAddress
			);
		}

		// 获取所有任务列表
		app.get("/api/tasks", async (req, res) => {
			const userIp = getUserIp(req);
			console.log("Fetching tasks for IP:", userIp);
			try {
				const { rows } = await query(
					`
          SELECT tasks.*, users.display_name 
          FROM tasks 
          LEFT JOIN users ON tasks.user_ip = users.ip 
          ORDER BY 
            CASE WHEN user_ip = $1 THEN 0 ELSE 1 END, 
            last_updated DESC
        `,
					[userIp],
				);
				console.log("Tasks fetched:", rows);
				res.json(rows);
			} catch (error) {
				console.error("Error fetching tasks:", error);
				res.status(500).json({ error: error.message });
			}
		});

		// 添加新任务
		app.post("/api/tasks", async (req, res) => {
			const { text } = req.body;
			const userIp = getUserIp(req);
			console.log("Adding new task:", { text, userIp });
			try {
				const { rows } = await query(
					"INSERT INTO tasks (user_ip, text, completed, last_updated) VALUES ($1, $2, false, CURRENT_TIMESTAMP) RETURNING id",
					[userIp, text],
				);
				console.log("Task added successfully, ID:", rows[0].id);
				res.json({ id: rows[0].id });
			} catch (error) {
				console.error("Error adding task:", error);
				res.status(500).json({ error: error.message });
			}
		});

		// 更新任务状态
		app.put("/api/tasks/:id", async (req, res) => {
			const { id } = req.params;
			const { completed } = req.body;
			const userIp = getUserIp(req);
			try {
				const { rowCount } = await query(
					"UPDATE tasks SET completed = $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2 AND user_ip = $3",
					[completed, id, userIp],
				);
				res.json({ changes: rowCount });
			} catch (error) {
				console.error("Error updating task:", error);
				res.status(500).json({ error: error.message });
			}
		});

		// 删除任务
		app.delete("/api/tasks/:id", async (req, res) => {
			const { id } = req.params;
			const userIp = getUserIp(req);
			try {
				const { rowCount } = await query(
					"DELETE FROM tasks WHERE id = $1 AND user_ip = $2",
					[id, userIp],
				);
				res.json({ changes: rowCount });
			} catch (error) {
				console.error("Error deleting task:", error);
				res.status(500).json({ error: error.message });
			}
		});

		// 更新显示名称
		app.post("/api/update-name", async (req, res) => {
			const { displayName } = req.body;
			const userIp = getUserIp(req);
			try {
				await query(
					"INSERT INTO users (ip, display_name) VALUES ($1, $2) ON CONFLICT (ip) DO UPDATE SET display_name = $2",
					[userIp, displayName],
				);
				res.json({ success: true });
			} catch (error) {
				console.error("Error updating display name:", error);
				res.status(500).json({ error: error.message });
			}
		});

		// 获取当前用户信息
		app.get("/api/user", async (req, res) => {
			const userIp = getUserIp(req);
			try {
				const { rows } = await query("SELECT * FROM users WHERE ip = $1", [
					userIp,
				]);
				res.json(rows[0] || { ip: userIp, display_name: userIp });
			} catch (error) {
				console.error("Error fetching user info:", error);
				res.status(500).json({ error: error.message });
			}
		});

		// 健康检查端点
		app.get("/health", async (req, res) => {
			try {
				await pool.query("SELECT 1");
				res.status(200).send("OK");
			} catch (error) {
				console.error("Health check failed:", error);
				res.status(500).send("Error");
			}
		});

		app.get("/", (req, res) => {
			res.sendFile(path.join(__dirname, "public", "index.html"));
		});

		app.listen(port, "0.0.0.0", () => {
			console.log(`Server running at http://localhost:${port}`);
		});
	})
	.catch((error) => {
		console.error("Failed to initialize the database:", error);
	});

module.exports = app;
