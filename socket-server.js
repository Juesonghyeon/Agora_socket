const express = require("express");
const { Server } = require("socket.io");

const app = express();

// 🔥 HTTP + Socket 서버 같이 실행
const server = app.listen(8081, () => {
  console.log("🔥 Socket + HTTP server running on 8081");
});

// 🔥 기존 new Server(8081) → 이걸로 교체
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("✅ 클라이언트 연결:", socket.id);

  socket.on("joinRoom", ({ gameCode, username }) => {
    socket.join(gameCode);
    socket.username = username;
    socket.gameCode = gameCode;

    console.log(`👤 ${username} joined ${gameCode}`);

    // 본인에게 ACK
    socket.emit("joined", { username });

    // 다른 사람들에게 JOIN 알림
    socket.to(gameCode).emit("system", {
      type: "JOIN",
      username,
    });
  });

  socket.on("chat", ({ gameCode, username, message }) => {
    io.to(gameCode).emit("chat", {
      username,
      message,
    });
  });

  socket.on("disconnect", () => {
    if (socket.gameCode && socket.username) {
      console.log(`🚪 ${socket.username} left ${socket.gameCode}`);

      socket.to(socket.gameCode).emit("system", {
        type: "LEAVE",
        username: socket.username,
      });
    }
  });
});

// =======================
// 🔥 Spring이 호출하는 게임 시작 트리거
// =======================
app.post("/start", (req, res) => {
  const gameCode = req.query.gameCode;

  console.log("🎮 GAME START:", gameCode);

  let count = 3;
  io.to(gameCode).emit("COUNTDOWN", count);

  const interval = setInterval(() => {
    count--;
    if (count === 0) {
      io.to(gameCode).emit("GAME_START");
      clearInterval(interval);
    } else {
      io.to(gameCode).emit("COUNTDOWN", count);
    }
  }, 1000);

  res.send("OK");
});
