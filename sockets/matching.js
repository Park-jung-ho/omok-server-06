const { v4: uuidv4 } = require('uuid');

module.exports = function (server, app) {
  const io = require('socket.io')(server, {
    cors: { origin: "*" },
    allowEIO3: true,
    transports: ["websocket"]
  });

  // 대기 중인 방
  let waitingRoom = null; // 동시에 하나만 관리 (필요하다면 배열로 확장 가능)
  let socketRooms = new Map();

  io.on('connection', async (socket) => {
    console.log('A user Connected:', socket.id);

    try {
      // 클라이언트에서 email query로 전달
      const email = socket.handshake.query.email;
      if (!email) {
        console.log('No email provided. Disconnecting...');
        socket.disconnect();
        return;
      }

      // DB에서 유저 정보 조회
      const database = app.get('database');
      const users = database.collection('users');
      const user = await users.findOne({ _id: email });

      if (!user) {
        console.log('User not found in DB:', email);
        socket.disconnect();
        return;
      }

      // rank는 DB에서 가져온 값
      const rank = user.rank;
      const newUser = { socketId: socket.id, email, rank };

      // --- 방 생성 or 매칭 시도 ---
      if (!waitingRoom) {
        // 방이 없으면 새로운 방 생성 (호스트)
        const roomId = uuidv4();
        waitingRoom = { roomId, host: newUser, guest: null };

        socket.join(roomId);
        socket.emit('waiting', { roomId });
        socketRooms.set(socket.id, roomId);

        console.log(`New room created by ${email} (rank ${rank})`);
      } else {
        // 이미 방이 있으면 → 게스트로 들어옴
        const host = waitingRoom.host;
        const roomId = waitingRoom.roomId;

        if (Math.abs(host.rank - newUser.rank) <= 1) {
          // 급수 차이 ±1 → 매칭 성공
          waitingRoom.guest = newUser;

          socket.join(roomId);
          io.to(roomId).emit('startGame', {
            roomId,
            players: [host.email, newUser.email]
          });

          socketRooms.set(socket.id, roomId);
          socketRooms.set(host.socketId, roomId);

          console.log(`Match success: ${host.email}(rank ${host.rank}) vs ${newUser.email}(rank ${newUser.rank})`);
          waitingRoom = null; // 방 채워졌으니 초기화
        } else {
          // 급수 조건 불만족, 호스트는 AI 매칭
          io.to(host.socketId).emit('startGameWithAI', {
            roomId,
            ai: true
          });
          console.log(`AI Match: ${host.email}(rank ${host.rank}) vs AI`);

          // 게스트는 새로운 방의 호스트로 전환
          const newRoomId = uuidv4();
          waitingRoom = { roomId: newRoomId, host: newUser, guest: null };

          socket.join(newRoomId);
          socket.emit('waiting', { roomId: newRoomId });
          socketRooms.set(socket.id, newRoomId);

          console.log(`New room created by ${newUser.email} (rank ${newUser.rank})`);
        }
      }
    } catch (err) {
      console.error('Error during matchmaking:', err);
      socket.disconnect();
    }

    // --- 플레이 동작 전달 ---
    socket.on('doPlayer', ({ roomId, blockIndex }) => {
      console.log(`Action in ${roomId}, block ${blockIndex}`);
      socket.to(roomId).emit('doOpponent', { blockIndex });
    });

    // --- 연결 종료 처리 ---
    socket.on('disconnect', (reason) => {
      console.log(`Disconnected: ${socket.id}, Reason: ${reason}`);

      // 대기 방의 호스트가 나가면 방 초기화
      if (waitingRoom && waitingRoom.host.socketId === socket.id) {
        console.log(`Host ${waitingRoom.host.email} left, removing room ${waitingRoom.roomId}`);
        waitingRoom = null;
      }

      socketRooms.delete(socket.id);
    });
  });
};
