const { v4: uuidv4 } = require('uuid');

module.exports = function(server) {

    const io = require('socket.io')(server, { 
        transports: ['websocket']
    });


    // 방 정보
    var rooms = []; // 게임 대기방
    var socketRooms = new Map(); // 게임 진행방

    io.on('connection', (socket) => {

        // 서버 구현
        console.log('A user Connected: ', socket.id);


        // 특정 socket(클라이언트)이 방에 입장했을 때 처리
        // 1. 대기방에 방이 있으면 입장
        // 2. 대기방에 방이 없으면 새로 생성 후 입장
        if (rooms.length > 0) {
            var roomId = rooms.shift();
            socket.join(roomId);
            socket.emit('joinRoom', { roomId: roomId});
            socket.to(roomId).emit('startGame', { roomId: roomId});
            socketRooms.set(socket.id, roomId);
        }
        else {
            var roomId = uuidv4();
            
            socket.join(roomId);
            socket.emit('createRoom', { roomId: roomId});
            rooms.push(roomId);
            socketRooms.set(socket.id, roomId);
        }

        // 특정 socket(클라이언트)이 방을 나갔을 때 처리
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

        // 소켓(클라이언트) 특정 Block을 터치했을 때 처리
        socket.on('doPlayer', function(playerInfo) {
            var roomId = playerInfo.roomId;
            var blockIndex = playerInfo.blockIndex;

            console.log('Player action in room ', roomId, 'Block index ', blockIndex);

            // 본인 제외, 상대방에게만 이벤트 전달
            socket.to(roomId).emit('doOpponent', { blockIndex: blockIndex });
        });

        socket.on("disconnect", (reason) => {
            console.log('Disconnected: ' + socket.id + 'Reason' + reason);
        });
    });

};