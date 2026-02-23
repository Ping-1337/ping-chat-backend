const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Data sementara
const users = [];
const messages = [];

// Cek API jalan
app.get('/', (req, res) => {
    res.json({ message: 'PING Chat API by Bhutok' });
});

// Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (users.find(u => u.username === username)) {
        return res.json({ success: false, error: 'Username sudah ada' });
    }
    
    const newUser = { id: users.length + 1, username, password };
    users.push(newUser);
    
    res.json({ success: true, user: { id: newUser.id, username } });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
        return res.json({ success: false, error: 'Username/password salah' });
    }
    
    res.json({ success: true, user: { id: user.id, username } });
});

// Chat realtime
io.on('connection', (socket) => {
    console.log('User connected');
    
    socket.emit('history', messages);
    
    socket.on('send-message', (data) => {
        const message = {
            id: messages.length + 1,
            username: data.username,
            text: data.text,
            time: new Date().toLocaleTimeString()
        };
        messages.push(message);
        io.emit('new-message', message);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ PING Chat API running on port ${PORT}`);
});
