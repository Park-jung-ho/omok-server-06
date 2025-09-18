const { v4: uuidv4 } = require('uuid')

module.exports = function (server, app) {
  const io = require('socket.io')(server, {
    cors: { origin: "*" },
    allowEIO3: true,
    transports: ["websocket", "polling"]
  })

  // 여러 방을 관리하기 위해 Map 사용
  const waitingRooms = new Map()
  const socketRooms = new Map()

  io.on('connection', (socket) => {
    const email = socket.handshake.query?.email || null
    if (!email) {
      console.log(`이메일 없는 클라이언트(${socket.id}) → disconnect`)
      socket.disconnect()
      return
    }

    // joinMatch 이벤트
    socket.on("joinMatch", async (email) => {
      console.log(`Player connected: ${email}, socketId=${socket.id}`)

      try {
        const database = app.get('database')
        const users = database.collection('users')
        const user = await users.findOne({ _id: email })
        if (!user) {
          console.log('User not found in DB:', email)
          return
        }

        const rank = user.rank
        const newUser = { socketId: socket.id, email, rank }

        // 대기 중인 방 찾기
        let matchedRoom = null
        for (let [roomId, room] of waitingRooms.entries()) {
          if (!room.guest) {
            matchedRoom = room
            break
          }
        }

        if (!matchedRoom) {
          // 첫 번째 유저 → 대기방 생성
          const roomId = uuidv4()
          const room = { roomId, host: newUser, guest: null }

          socket.join(roomId)
          socket.emit('waiting', { roomId })
          socketRooms.set(socket.id, roomId)
          waitingRooms.set(roomId, room)

          console.log(`New room created by ${email} (rank ${rank})`)

          let countdown = 10
          room.timer = setInterval(() => {
            if (!waitingRooms.has(roomId)) return

            console.log(`[${room.host.email}] 매칭 대기 ${countdown}초`)
            io.to(roomId).emit("matchTimer", { timeLeft: countdown })
            countdown--

            if (countdown < 0) {
              clearInterval(room.timer)
              room.timer = null

              if (waitingRooms.has(roomId) && !room.guest) {
                io.to(room.host.socketId).emit('startGameWithAI', {
                  roomId,
                  ai: true
                })
                console.log(`[startGameWithAI emit] host=${room.host.email}, roomId=${roomId}`)
                waitingRooms.delete(roomId)
              }
            }
          }, 1000)

        } else {
          // 두 번째 유저 → 매칭 시도
          const host = matchedRoom.host
          const roomId = matchedRoom.roomId

          if (Math.abs(host.rank - newUser.rank) <= 1) {
            // 정상 매칭
            matchedRoom.guest = newUser

            if (matchedRoom.timer) {
              clearInterval(matchedRoom.timer)
              matchedRoom.timer = null
            }

            const hostSocket = io.sockets.sockets.get(host.socketId)
            if (hostSocket) hostSocket.join(roomId)
            socket.join(roomId)

            // 흑/백 결정 로직
            let blackPlayer, whitePlayer
            if (host.rank === newUser.rank) {
              // 급수가 같으면 랜덤
              const isHostBlack = Math.random() < 0.5
              blackPlayer = isHostBlack ? host : newUser
              whitePlayer = isHostBlack ? newUser : host
            } else {
              // 급수가 다르면 높은 급수가 흑
              blackPlayer = (host.rank > newUser.rank) ? host : newUser
              whitePlayer = (blackPlayer === host) ? newUser : host
            }

            // 흑/백 정보 포함해서 전달
            io.to(roomId).emit('startGame', {
              roomId,
              black: blackPlayer.email,
              white: whitePlayer.email
            })

            socketRooms.set(socket.id, roomId)
            socketRooms.set(host.socketId, roomId)

            console.log(`Match success: ${host.email}(rank ${host.rank}) vs ${newUser.email}(rank ${newUser.rank})`)
            console.log(`흑: ${blackPlayer.email}, 백: ${whitePlayer.email}`)

            waitingRooms.delete(roomId)

          } else {
            // 랭크 차이 → 새로운 방 생성해서 기다리게
            console.log(`[랭크 불일치] host=${host.email}(rank ${host.rank}), guest=${newUser.email}(rank ${newUser.rank})`)

            const newRoomId = uuidv4()
            const newRoom = { roomId: newRoomId, host: newUser, guest: null }

            socket.join(newRoomId)
            socket.emit('waiting', { roomId: newRoomId })
            socketRooms.set(socket.id, newRoomId)
            waitingRooms.set(newRoomId, newRoom)

            console.log(`New room created by ${newUser.email} (rank ${newUser.rank})`)

            let countdown = 10
            newRoom.timer = setInterval(() => {
              if (!waitingRooms.has(newRoomId)) return

              console.log(`[${newRoom.host.email}] 매칭 대기 ${countdown}초`)
              io.to(newRoomId).emit("matchTimer", { timeLeft: countdown })
              countdown--

              if (countdown < 0) {
                clearInterval(newRoom.timer)
                newRoom.timer = null

                if (waitingRooms.has(newRoomId) && !newRoom.guest) {
                  io.to(newRoom.host.socketId).emit('startGameWithAI', {
                    roomId: newRoomId,
                    ai: true
                  })
                  console.log(`[startGameWithAI emit] host=${newRoom.host.email}, roomId=${newRoomId}`)
                  waitingRooms.delete(newRoomId)
                }
              }
            }, 1000)
          }
        }
      } catch (err) {
        console.error("Error in joinMatch:", err)
      }
    })

    // 매칭 취소
    socket.on("cancelMatch", (email) => {
      console.log(`매칭 취소 요청: ${email}`)
      const roomId = socketRooms.get(socket.id)
      if (!roomId) return

      const room = waitingRooms.get(roomId)
      if (!room) return

      if (room.host && room.host.email === email) {
        if (room.timer) {
          clearInterval(room.timer)
          room.timer = null
        }
        console.log(`Host ${email} canceled match → 방 삭제`)
        waitingRooms.delete(roomId)
      } else if (room.guest && room.guest.email === email) {
        console.log(`Guest ${email} canceled match`)
        room.guest = null
      }

      socket.leaveAll()
      socketRooms.delete(socket.id)
    })

    // 착수 처리
    socket.on('doPlayer', ({ roomId, blockIndex }) => {
      console.log(`[SERVER] doPlayer 수신 from=${email}, roomId=${roomId}, blockIndex=${blockIndex}`)
      io.to(roomId).emit('doOpponent', { blockIndex, email })
    })

    socket.on('disconnect', (reason) => {
      console.log(`Disconnected: ${socket.id}, Reason: ${reason}`)
      const roomId = socketRooms.get(socket.id)
      if (roomId) {
        const room = waitingRooms.get(roomId)
        if (room && room.host.socketId === socket.id) {
          if (room.timer) clearInterval(room.timer)
          waitingRooms.delete(roomId)
          console.log(`Host ${room.host.email} left → 방 삭제 ${roomId}`)
        }
        socketRooms.delete(socket.id)
      }
    })
  })
}
