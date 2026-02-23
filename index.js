const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

// ============ DATABASE SEMENTARA (IN-MEMORY) ============
const users = [];
const messages = [];
const typingUsers = new Map();

// ============ REST API ============

// Cek server
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'PING Chat API by Bhutok',
        time: new Date().toISOString()
    });
});

// Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: 'Username dan password harus diisi'
        });
    }
    
    // Cek username sudah ada
    if (users.find(u => u.username === username)) {
        return res.json({
            success: false,
            error: 'Username sudah digunakan'
        });
    }
    
    // Buat user baru
    const newUser = {
        id: users.length + 1,
        username,
        password, // Dalam production, hash password!
        avatar: username[0].toUpperCase(),
        isOnline: false,
        createdAt: new Date()
    };
    
    users.push(newUser);
    
    res.json({
        success: true,
        user: {
            id: newUser.id,
            username: newUser.username,
            avatar: newUser.avatar
        }
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
        return res.json({
            success: false,
            error: 'Username atau password salah'
        });
    }
    
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar
        }
    });
});

// Get all users (kecuali diri sendiri)
app.get('/api/users/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    
    const otherUsers = users
        .filter(u => u.id !== userId)
        .map(u => ({
            id: u.id,
            username: u.username,
            avatar: u.avatar,
            isOnline: u.isOnline
        }));
    
    res.json({
        success: true,
        users: otherUsers
    });
});

// Get chat history antara dua user
app.get('/api/messages/:user1/:user2', (req, res) => {
    const user1 = parseInt(req.params.user1);
    const user2 = parseInt(req.params.user2);
    
    const chatMessages = messages.filter(m => 
        (m.from === user1 && m.to === user2) || 
        (m.from === user2 && m.to === user1)
    );
    
    res.json({
        success: true,
        messages: chatMessages
    });
});

// ============ SOCKET.IO ============

io.on('connection', (socket) => {
    console.log('🔵 User connected:', socket.id);
    
    let currentUserId = null;
    
    // ===== USER LOGIN =====
    socket.on('user-login', (userId) => {
        currentUserId = userId;
        
        // Update user status
        const user = users.find(u => u.id === userId);
        if (user) {
            user.isOnline = true;
            user.socketId = socket.id;
        }
        
        // Join ke room personal
        socket.join(`user-${userId}`);
        
        // Broadcast ke semua bahwa user online
        socket.broadcast.emit('user-online', userId);
        
        console.log(`✅ User ${userId} logged in`);
    });
    
    // ===== SEND MESSAGE =====
    socket.on('send-message', (data) => {
        const { from, to, text, replyTo } = data;
        
        // Simpan pesan
        const message = {
            id: messages.length + 1,
            from,
            to,
            text,
            replyTo: replyTo || null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date(),
            status: 'sent'
        };
        
        messages.push(message);
        
        // Kirim ke penerima jika online
        const recipient = users.find(u => u.id === to);
        if (recipient && recipient.isOnline) {
            io.to(`user-${to}`).emit('new-message', message);
            
            // Update status jadi delivered
            message.status = 'delivered';
        }
        
        // Kirim konfirmasi ke pengirim
        io.to(`user-${from}`).emit('message-sent', message);
        
        console.log(`📨 Message from ${from} to ${to}: ${text}`);
    });
    
    // ===== MARK AS READ =====
    socket.on('mark-read', (data) => {
        const { messageId, userId } = data;
        
        const message = messages.find(m => m.id === messageId);
        if (message) {
            message.status = 'read';
            
            // Notifikasi pengirim
            io.to(`user-${message.from}`).emit('message-read', {
                messageId,
                readBy: userId
            });
        }
    });
    
    // ===== TYPING INDICATOR =====
    socket.on('typing', (data) => {
        const { from, to, isTyping } = data;
        
        typingUsers.set(`${from}-${to}`, isTyping);
        
        // Kirim ke penerima
        const recipient = users.find(u => u.id === to);
        if (recipient && recipient.isOnline) {
            io.to(`user-${to}`).emit('user-typing', {
                userId: from,
                isTyping
            });
        }
    });
    
    // ===== DISCONNECT =====
    socket.on('disconnect', () => {
        console.log('🔴 User disconnected:', socket.id);
        
        if (currentUserId) {
            const user = users.find(u => u.id === currentUserId);
            if (user) {
                user.isOnline = false;
                user.socketId = null;
            }
            
            // Broadcast user offline
            socket.broadcast.emit('user-offline', currentUserId);
        }
    });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PING Chat Server running on port ${PORT}`);
    console.log(`📡 WebSocket ready`);
    console.log(`🎨 Created by Bhutok`);
});
