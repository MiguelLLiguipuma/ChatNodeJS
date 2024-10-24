import express from 'express';
import logger from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
import 'dotenv/config';

dotenv.config();

const port = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
	connectionStateRecovery: {},
});
const db = createClient({
	url: 'libsql://handy-pandemic-miguellliguipuma.turso.io',
	authToken: process.env.DB_TOKEN,
});

async function setupDatabase() {
	try {
		await db.execute(`
		CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			content TEXT,
			user TEXT
		);
		`);
		console.log('Table created or already exists.');
	} catch (e) {
		console.error('Error creating table:', e);
	}
}

setupDatabase();

io.on('connection', async (socket) => {
	console.log('A user has connected');

	socket.on('disconnect', () => {
		console.log('A user has disconnected');
	});

	socket.on('chat message', async (msg) => {
		let result;
		const username = socket.handshake.auth.username ?? 'anonymous'; // Cambié 'anonymus' a 'anonymous'

		try {
			result = await db.execute({
				sql: `INSERT INTO messages (content, user) VALUES (:msg, :username)`,
				args: { msg, username }, // Asegúrate de pasar bien los parámetros
			});
		} catch (e) {
			console.error('Error inserting message:', e);
			return;
		}

		io.emit('chat message', msg, result.lastInsertRowid.toString(), username);
	});

	if (!socket.recovered) {
		try {
			const results = await db.execute({
				sql: 'SELECT id, content, user FROM messages WHERE id > ?',
				args: [socket.handshake.auth.serverOffset ?? 0],
			});

			results.rows.forEach((row) => {
				socket.emit(
					'chat message',
					row.content,
					row.id.toString(),
					row.user, // Cambié row.username a row.user
				);
			});
		} catch (e) {
			console.error('Error fetching messages:', e);
		}
	}
});

app.use(logger('dev'));

app.get('/', (req, res) => {
	res.sendFile(process.cwd() + '/client/index.html');
});

server.listen(port, () => {
	console.log(`Server running on port ${port}`);
});
