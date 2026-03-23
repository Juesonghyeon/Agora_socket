require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
}));

app.use(express.json());

const rooms = {}; 

const io = new Server(server, {
    cors: { origin: "*" },
});

io.on("connection", (socket) => {
    socket.on("joinRoom", ({ gameCode, username, userId, profileImageUrl }) => {
        if (!gameCode) return;
        
        socket.join(gameCode);
        socket.username = username;
        socket.gameCode = gameCode;
        socket.userId = userId;

        if (!rooms[gameCode]) rooms[gameCode] = [];

        // 동일 유저 중복 제거
        rooms[gameCode] = rooms[gameCode].filter(u => u.userId !== userId);
        
        const isHost = rooms[gameCode].length === 0;
        const newUser = {
            socketId: socket.id,
            userId,
            username,
            profileImageUrl: profileImageUrl || "", // 클라이언트가 준 최신 URL 저장
            role: isHost ? "HOST" : "PLAYER"
        };
        rooms[gameCode].push(newUser);

        io.to(gameCode).emit("system", { type: "JOIN", username: username });
        // 모든 유저에게 사진이 포함된 최신 명단 전송
        io.to(gameCode).emit("updatePlayers", rooms[gameCode]);
        
        console.log(`✅ ${username} 입장 (사진: ${profileImageUrl})`);
    });

    socket.on("disconnect", () => {
        const { gameCode, username } = socket;
        if (gameCode && rooms[gameCode]) {
            const userIdx = rooms[gameCode].findIndex(u => u.socketId === socket.id);
            if (userIdx !== -1) {
                const wasHost = rooms[gameCode][userIdx].role === "HOST";
                rooms[gameCode].splice(userIdx, 1);

                io.to(gameCode).emit("system", { type: "LEAVE", username: username });

                if (wasHost && rooms[gameCode].length > 0) {
                    rooms[gameCode][0].role = "HOST";
                    io.to(gameCode).emit("system", { type: "INFO", message: `방장이 변경되었습니다: ${rooms[gameCode][0].username}` });
                }

                io.to(gameCode).emit("updatePlayers", rooms[gameCode]);

                if (rooms[gameCode].length === 0) delete rooms[gameCode];
                console.log(`❌ ${username} 퇴장`);
            }
        }
    });

    socket.on("chat", (data) => {
        io.to(data.gameCode).emit("chat", data);
    });
});

app.post('/room-deleted', (req, res) => {
    const { gameCode } = req.body;
    if (gameCode) {
        io.to(gameCode).emit('ROOM_DELETED'); 
        delete rooms[gameCode];
    }
    res.status(200).send("OK");
});

app.post('/start', (req, res) => {
    const { gameCode } = req.query;
    if (gameCode) io.to(gameCode).emit('GAME_START'); 
    res.status(200).send("OK");
});

app.post("/gemini-topic", async (req, res) => {
    try {
        const API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "토론하기 좋은 흥미로운 주제를 딱 한 문장으로 추천해줘. 질문 형태가 좋아." }] }]
            }),
        });
        const data = await response.json();
        if (data.candidates) {
            const topic = data.candidates[0].content.parts[0].text.trim();
            res.json({ topic });
        }
    } catch (err) {
        res.status(500).json({ error: "Gemini API 오류" });
    }
});

server.listen(8081, () => console.log(`✅ Socket Server running on 8081`));