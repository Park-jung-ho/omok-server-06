const { v4: uuidv4 } = require('uuid');

module.exports = function (server, app) {
  const io = require('socket.io')(server, {
    cors: { origin: "*" },
    allowEIO3: true,
    transports: ["websocket", "polling"]
  });

  let waitingRoom = null;      
  let socketRooms = new Map(); 

  io.on('connection', (socket) => {
    const email = socket.handshake.query?.email || null;
    if (!email) {
      console.log(`이메일 없는 클라이언트(${socket.id}) → disconnect`);
      socket.disconnect();
      return;
    }

    // connection 시점에는 로그 출력 안 함
    // joinMatch 이벤트 들어올 때만 로그 출력

    socket.on("joinMatch", async (email) => {
      console.log(`Player connected: ${email}, socketId=${socket.id}`);

      try {
        const database = app.get('database');
        const users = database.collection('users');
        const user = await users.findOne({ _id: email });
        if (!user) {
          console.log('User not found in DB:', email);
          return;
        }

        const rank = user.rank;
        const newUser = { socketId: socket.id, email, rank };

        if (!waitingRoom) {
          const roomId = uuidv4();
          waitingRoom = { roomId, host: newUser, guest: null };

          socket.join(roomId);
          socket.emit('waiting', { roomId });
          socketRooms.set(socket.id, roomId);

          console.log(`New room created by ${email} (rank ${rank})`);

          let countdown = 9;
          waitingRoom.timer = setInterval(() => {
            if (!waitingRoom) return;

            console.log(`[${waitingRoom.host.email}] 매칭 대기 ${countdown}초`);
            io.to(roomId).emit("matchTimer", { timeLeft: countdown });
            countdown--;

            if (countdown < 0) {
              clearInterval(waitingRoom.timer);
              waitingRoom.timer = null;

              if (waitingRoom && !waitingRoom.guest) {
                io.to(waitingRoom.host.socketId).emit('startGameWithAI', {
                  roomId,
                  ai: true
                });
                console.log(`AI Match triggered for ${waitingRoom.host.email}`);
                waitingRoom = null;
              }
            }
          }, 1000);

        } else {
          const host = waitingRoom.host;
          const roomId = waitingRoom.roomId;

          if (Math.abs(host.rank - newUser.rank) <= 1) {
            waitingRoom.guest = newUser;

            if (waitingRoom.timer) {
              clearInterval(waitingRoom.timer);
              waitingRoom.timer = null;
            }

            socket.join(roomId);
            io.to(roomId).emit('startGame', {
              roomId,
              players: [host.email, newUser.email]
            });

            socketRooms.set(socket.id, roomId);
            socketRooms.set(host.socketId, roomId);

            console.log(`Match success: ${host.email}(rank ${host.rank}) vs ${newUser.email}(rank ${newUser.rank})`);
            waitingRoom = null;
          } else {
            io.to(host.socketId).emit('startGameWithAI', { roomId, ai: true });
            console.log(`Rank mismatch → ${host.email} vs AI`);

            const newRoomId = uuidv4();
            waitingRoom = { roomId: newRoomId, host: newUser, guest: null };

            socket.join(newRoomId);
            socket.emit('waiting', { roomId: newRoomId });
            socketRooms.set(socket.id, newRoomId);

            console.log(`New room created by ${newUser.email} (rank ${newUser.rank})`);

            let countdown = 9;
            waitingRoom.timer = setInterval(() => {
              if (!waitingRoom) return;

              console.log(`[${waitingRoom.host.email}] 매칭 대기 ${countdown}초`);
              io.to(newRoomId).emit("matchTimer", { timeLeft: countdown });
              countdown--;

              if (countdown < 0) {
                clearInterval(waitingRoom.timer);
                waitingRoom.timer = null;

                if (waitingRoom && !waitingRoom.guest) {
                  io.to(waitingRoom.host.socketId).emit('startGameWithAI', {
                    roomId: newRoomId,
                    ai: true
                  });
                  console.log(`AI Match triggered for ${waitingRoom.host.email}`);
                  waitingRoom = null;
                }
              }
            }, 1000);
          }
        }
      } catch (err) {
        console.error("Error in joinMatch:", err);
      }
    });

    socket.on("cancelMatch", (email) => {
      console.log(`매칭 취소 요청: ${email}`);

      if (!waitingRoom) return;

      if (waitingRoom.host && waitingRoom.host.email === email) {
        if (waitingRoom.timer) {
          clearInterval(waitingRoom.timer);
          waitingRoom.timer = null;
        }
        console.log(`Host ${email} canceled match → 방 삭제`);
        waitingRoom = null;
      } else if (waitingRoom.guest && waitingRoom.guest.email === email) {
        console.log(`Guest ${email} canceled match`);
        waitingRoom.guest = null;
      }

      socket.leaveAll();
    });

    socket.on('doPlayer', ({ roomId, blockIndex }) => {
      console.log(`Action in ${roomId}, block ${blockIndex}`);
      socket.to(roomId).emit('doOpponent', { blockIndex });
    });

    socket.on('disconnect', (reason) => {
      console.log(`Disconnected: ${socket.id}, Reason: ${reason}`);

      if (waitingRoom && waitingRoom.host.socketId === socket.id) {
        console.log(`Host ${waitingRoom.host.email} left → 방 삭제 ${waitingRoom.roomId}`);

        if (waitingRoom.timer) {
          clearInterval(waitingRoom.timer);
          waitingRoom.timer = null;
        }
        waitingRoom = null;
      }

      socketRooms.delete(socket.id);
    });
  });
};
