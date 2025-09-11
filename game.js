const { v4: uuidv4 } = require('uuid');

module.exports = function(server) {
    const io = require('socket.io')(server, {
        cors: { origin: "*" },
        allowEIO3: true,
        transports: ["websocket"]
    });

    // 방 정보
    var rooms = [];              // 대기 중인 방 목록
    var socketRooms = new Map(); // socket.id → roomId 매핑

    io.on('connection', (socket) => {
        console.log('A user Connected: ', socket.id);

        // 방 입장 처리
        if (rooms.length > 0) {
            // 이미 대기 중인 방이 있으면 → 해당 방에 참가
            var roomId = rooms.shift(); // 대기열에서 제거
            socket.join(roomId);

            // 참가자에게 알림 (게스트)
            socket.emit('joinRoom', { roomId: roomId, isHost: false });

            // 방장에게 게임 시작 알림
            socket.to(roomId).emit('startGame', { roomId: roomId });

            socketRooms.set(socket.id, roomId);
        } else {
            // 대기 중인 방이 없으면 → 새로 생성
            var roomId = uuidv4();
            socket.join(roomId);

            // 생성자에게 알림 (호스트)
            socket.emit('createRoom', { roomId: roomId, isHost: true });

            // 방을 대기열에 추가
            rooms.push(roomId);
            socketRooms.set(socket.id, roomId);
        }

        // 방 나가기 처리
        socket.on('leaveRoom', function(data) {
            var roomId = data.roomId;
            socket.leave(roomId);

            socket.emit('exitRoom');
            socket.to(roomId).emit('endGame');

            const roomIdx = rooms.indexOf(roomId);
            if (roomIdx !== -1) {
                rooms.splice(roomIdx, 1);
                console.log('Room deleted: ', roomId);
            }

            // 방 나간 소켓 정보 삭제
            socketRooms.delete(socket.id);
        });

        // 플레이 동작 전달
        socket.on('doPlayer', function(playerInfo) {
            var roomId = playerInfo.roomId;
            var blockIndex = playerInfo.blockIndex;

            console.log('Player action in room', roomId, 'Block index', blockIndex);

            // 본인 제외, 상대방에게만 이벤트 전달
            socket.to(roomId).emit('doOpponent', { blockIndex: blockIndex });
        });

        // 연결 종료
        socket.on("disconnect", (reason) => {
            console.log('Disconnected: ' + socket.id + ' Reason: ' + reason);
            const roomId = socketRooms.get(socket.id);

            if (roomId) {
                socket.leave(roomId);
                socket.to(roomId).emit('endGame');

                const roomIdx = rooms.indexOf(roomId);
                if (roomIdx !== -1) {
                    rooms.splice(roomIdx, 1);
                    console.log('Room deleted: ', roomId);
                }

                socketRooms.delete(socket.id);
            }
        });
    });
};
