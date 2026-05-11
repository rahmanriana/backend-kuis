const {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getRoomsList,
  getAllRooms,
  rebindPlayerSocket
} = require('../controllers/roomController');

const {
  startGame,
  selectCell,
  submitAnswer,
  placeSymbol,
  getGameState,
  endGame,
  rebindGamePlayerSocket
} = require('../controllers/gameController');

const {
  getOnlineUsers,
  setUserOnline,
  getUserById,
  saveMessage
} = require('../utils/userUtils');

const activeUsers = new Map();
const usernameToSocketId = new Map();

/**
 * Setup Socket.IO event handlers
 * @param {object} io - Socket.IO server instance
 */
function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    const broadcastOnlineUsers = async () => {
      const users = await getOnlineUsers();
      io.emit('online-users', users);
    };

    const updateUserStatus = async (userId, status) => {
      await setUserOnline(userId, status);
      await broadcastOnlineUsers();
    };

    socket.on('user-online', async (data) => {
      try {
        if (!data || !data.username) {
          return;
        }

        const username = String(data.username).trim();

        // Keep existing userId mapping (if provided) for backward compatibility.
        if (data.userId) {
          activeUsers.set(data.userId, {
            socketId: socket.id,
            userId: data.userId,
            username
          });
        }

        // Preferred mapping for targeted emits (invite, etc).
        if (username) {
          usernameToSocketId.set(username, socket.id);
        }

        if (data.userId) {
          await updateUserStatus(data.userId, true);
        } else {
          await broadcastOnlineUsers();
        }
        socket.emit('online-users', await getOnlineUsers());
      } catch (err) {
        console.error('Error on user-online:', err);
      }
    });

    socket.on('get-online-users', async () => {
      try {
        socket.emit('online-users', await getOnlineUsers());
      } catch (err) {
        console.error('Error on get-online-users:', err);
      }
    });

    socket.on('user-offline', async (data) => {
      try {
        if (!data || !data.userId) {
          return;
        }

        const userData = activeUsers.get(data.userId);
        if (userData?.username) {
          usernameToSocketId.delete(userData.username);
        }
        activeUsers.delete(data.userId);
        await updateUserStatus(data.userId, false);
      } catch (err) {
        console.error('Error on user-offline:', err);
      }
    });

    socket.on('invite-player', async (payload) => {
      try {
        if (!payload || !payload.fromUsername) {
          socket.emit('error', { message: 'Invalid invite payload' });
          return;
        }

        const toUsername = payload.toUsername ? String(payload.toUsername).trim() : '';
        const target = payload.toUserId ? activeUsers.get(payload.toUserId) : null;
        const targetSocketId = target?.socketId || (toUsername ? usernameToSocketId.get(toUsername) : null);

        if (!targetSocketId) {
          socket.emit('error', { message: 'Target player is not online' });
          return;
        }

        // Guard against wrong client payload / stale mapping (prevents sender seeing own invite popup).
        if (targetSocketId === socket.id) {
          socket.emit('error', { message: 'Tidak bisa mengundang diri sendiri' });
          return;
        }

        io.to(targetSocketId).emit('receive-invite', {
          fromUserId: payload.fromUserId,
          fromUsername: payload.fromUsername,
          toUserId: payload.toUserId,
          toUsername: payload.toUsername,
          roomCode: payload.roomCode || null
        });
      } catch (err) {
        console.error('Error on invite-player:', err);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('accept-invite', async (payload) => {
      try {
        if (!payload || !payload.fromUserId || !payload.toUserId) {
          socket.emit('error', { message: 'Invalid accept payload' });
          return;
        }

        const inviter = activeUsers.get(payload.fromUserId);
        const acceptor = activeUsers.get(payload.toUserId);
        if (!inviter || !acceptor) {
          socket.emit('error', { message: 'Both players must be online to accept invite' });
          return;
        }

        const inviterUser = await getUserById(payload.fromUserId);
        const acceptorUser = await getUserById(payload.toUserId);
        if (!inviterUser || !acceptorUser) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        // Host should remain the inviter (the player who sent the invite),
        // so lobby theme selection + start-game permissions are correct.
        const createResult = createRoom('umum', inviter.socketId, inviterUser.username);
        const roomCode = createResult.roomCode;
        const joinResult = joinRoom(roomCode, acceptor.socketId, acceptorUser.username);
        if (!joinResult.success) {
          socket.emit('error', { message: joinResult.message });
          return;
        }

        // Make sure both sockets actually join the Socket.IO room
        // so room-only events (chat/game) work after invite accept.
        const inviterSocket = io.sockets.sockets.get(inviter.socketId);
        const acceptorSocket = io.sockets.sockets.get(acceptor.socketId);
        inviterSocket?.join(roomCode);
        acceptorSocket?.join(roomCode);

        const finalRoom = joinResult.room.toJSON();

        // Both should receive the same final room state (already includes 2 players).
        // Use room-joined so clients can navigate to the waiting room lobby immediately.
        io.to(inviter.socketId).emit('room-joined', { roomCode, room: finalRoom });
        io.to(acceptor.socketId).emit('room-joined', { roomCode, room: finalRoom });

        // Also broadcast room-updated to the Socket.IO room channel (for realtime lobby UI)
        io.to(roomCode).emit('room-updated', { roomCode, room: finalRoom });

        io.emit('room-list-updated', getRoomsList());
      } catch (err) {
        console.error('Error on accept-invite:', err);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('reject-invite', async (payload) => {
      try {
        if (!payload || !payload.fromUserId || !payload.toUserId) {
          return;
        }
        const inviter = activeUsers.get(payload.fromUserId);
        if (inviter) {
          io.to(inviter.socketId).emit('invite-rejected', {
            fromUserId: payload.fromUserId,
            toUserId: payload.toUserId,
            toUsername: payload.toUsername || null
          });
        }
      } catch (err) {
        console.error('Error on reject-invite:', err);
      }
    });

    socket.on('send-message', async (data) => {
      try {
        if (!data || !data.roomCode || !data.sender_username || !data.message) {
          socket.emit('error', { message: 'Invalid message payload' });
          return;
        }

        await saveMessage(data.roomCode, data.sender_username, data.message);
        io.to(data.roomCode).emit('receive-message', {
          roomCode: data.roomCode,
          sender_username: data.sender_username,
          message: data.message,
          created_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error on send-message:', err);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    // Refresh/reconnect support: rejoin a room and rebind socketId (so room-only emits are realtime again).
    socket.on('rejoin-room', (data) => {
      try {
        if (!data || !data.roomCode || !data.playerName) {
          socket.emit('error', { message: 'Room code and player name are required' });
          return;
        }

        const room = getRoom(data.roomCode);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        const bindResult = rebindPlayerSocket(data.roomCode, data.playerName, socket.id);
        if (!bindResult.success) {
          socket.emit('error', { message: bindResult.message || 'Failed to rejoin room' });
          return;
        }

        socket.join(data.roomCode);

        // Notify room that room meta changed (socketId possibly changed)
        io.to(data.roomCode).emit('room-updated', {
          roomCode: data.roomCode,
          room: bindResult.room.toJSON()
        });

        // If a game is active, rebind socketId inside game state too and sync the rejoined client
        const game = getGameState(data.roomCode);
        if (game) {
          const gameBind = rebindGamePlayerSocket(data.roomCode, data.playerName, socket.id, bindResult.oldSocketId);
          if (gameBind.success) {
            socket.emit('game-updated', gameBind.gameState);
          }
        }

        socket.emit('rejoin-success', { roomCode: data.roomCode });
      } catch (error) {
        console.error('Error on rejoin-room:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    // LOBBY EVENTS
    socket.on('create-room', (data) => {
      try {
        if (!data || !data.theme || !data.playerName) {
          socket.emit('error', { message: 'Theme and player name are required' });
          return;
        }

        const { theme, playerName } = data;
        const result = createRoom(theme, socket.id, playerName);

        socket.join(result.roomCode);
        const currentRoom = result.room.toJSON();
        socket.emit('room-created', { roomCode: result.roomCode, room: currentRoom });
        io.to(result.roomCode).emit('room-updated', { roomCode: result.roomCode, room: currentRoom });

        io.emit('room-list-updated', getRoomsList());
      } catch (error) {
        console.error('Error creating room:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('join-room', (data) => {
      try {
        if (!data || !data.roomCode || !data.playerName) {
          socket.emit('error', { message: 'Room code and player name are required' });
          return;
        }

        const { roomCode, playerName } = data;
        const result = joinRoom(roomCode, socket.id, playerName);

        if (!result.success) {
          socket.emit('error', { message: result.message });
          return;
        }

        socket.join(roomCode);
        const currentRoom = result.room.toJSON();

        socket.emit('room-joined', { roomCode, room: currentRoom });

        socket.to(roomCode).emit('player-joined', {
          roomCode,
          player: result.room.getPlayer(socket.id)
        });

        // Keep both clients in sync with the full room state
        io.to(roomCode).emit('room-updated', { roomCode, room: currentRoom });

        io.emit('room-list-updated', getRoomsList());
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('leave-room', (data) => {
      try {
        if (!data || !data.roomCode) {
          socket.emit('error', { message: 'Room code is required' });
          return;
        }

        const { roomCode } = data;
        const removedPlayer = leaveRoom(roomCode, socket.id);

        if (removedPlayer) {
          socket.leave(roomCode);
          socket.to(roomCode).emit('player-left', { roomCode, player: removedPlayer });
          const room = getRoom(roomCode);
          if (room) {
            io.to(roomCode).emit('room-updated', { roomCode, room: room.toJSON() });
          }
          io.emit('room-list-updated', getRoomsList());
        }
      } catch (error) {
        console.error('Error leaving room:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    // Lobby-only: host can change theme before game starts
    socket.on('set-room-theme', (data) => {
      try {
        if (!data || !data.roomCode || !data.theme) {
          socket.emit('error', { message: 'Room code and theme are required' });
          return;
        }

        const room = getRoom(data.roomCode);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (room.status !== 'waiting') {
          socket.emit('error', { message: 'Game already started' });
          return;
        }

        if (room.host !== socket.id) {
          socket.emit('error', { message: 'Only host can change theme' });
          return;
        }

        room.theme = String(data.theme).toLowerCase();

        io.to(data.roomCode).emit('room-updated', {
          roomCode: data.roomCode,
          room: room.toJSON()
        });
        io.emit('room-list-updated', getRoomsList());
      } catch (error) {
        console.error('Error setting room theme:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('get-rooms', () => {
      try {
        socket.emit('rooms-list', getRoomsList());
      } catch (error) {
        console.error('Error getting rooms list:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    // GAME EVENTS
    socket.on('start-game', (data) => {
      try {
        if (!data || !data.roomCode) {
          socket.emit('error', { message: 'Room code is required' });
          return;
        }

        const { roomCode } = data;
        const room = getRoom(roomCode);

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (!room.canStart()) {
          socket.emit('error', { message: 'Need 2 players to start game' });
          return;
        }

        const result = startGame(roomCode, room.theme, room.players);
        if (!result.success) {
          socket.emit('error', { message: result.message });
          return;
        }

        room.status = 'playing';
        io.to(roomCode).emit('game-started', {
          game: result.game.getGameState(),
          question: result.question
        });
      } catch (error) {
        console.error('Error starting game:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('select-cell', (data) => {
      try {
        if (!data || !data.roomCode || data.position === undefined) {
          socket.emit('error', { message: 'Room code and position are required' });
          return;
        }

        const game = getGameState(data.roomCode);
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Prevent selecting an occupied position
        if (game.board[data.position] !== null) {
          socket.emit('error', { message: 'Position already occupied' });
          return;
        }

        // Prevent selecting when game not active
        if (game.gameStatus !== 'active') {
          socket.emit('error', { message: 'Game not active' });
          return;
        }

        const question = selectCell(data.roomCode, socket.id, data.position);
        if (!question) {
          socket.emit('error', { message: 'Failed to get question' });
          return;
        }

        socket.emit('question-popup', { question, position: data.position });
      } catch (error) {
        console.error('Error selecting cell:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('submit-answer', (data) => {
      try {
        if (!data || !data.roomCode || data.answer === undefined || data.position === undefined) {
          console.log('=== SUBMIT-ANSWER ERROR: missing data ===');
          socket.emit('error', { message: 'Room code, answer, and position are required' });
          return;
        }

        console.log(`\n=== SUBMIT-ANSWER EVENT ===`);
        console.log(`Room: ${data.roomCode}, Player: ${socket.id}, Answer: ${data.answer}, Position: ${data.position}`);

        const result = submitAnswer(data.roomCode, socket.id, data.answer, data.position);
        
        if (result.success === false) {
          console.log(`❌ Submit answer failed: ${result.message}`);
          socket.emit('error', { message: result.message });
          return;
        }

        console.log(`✅ Answer correct: ${result.correct}`);
        console.log(`📋 Board after move:`, result.board);
        console.log(`👤 Current turn after answer: ${result.gameState.currentTurn}`);

        // Send answer feedback ONLY to the player who answered
        if (result.correct) {
          console.log(`🎯 Sending answer-correct to player ${socket.id}`);
          socket.emit('answer-correct', {
            points: result.points || 0,
            board: result.board,
            nextTurn: result.nextTurn || null,
            gameState: result.gameState
          });
        } else {
          console.log(`❌ Sending answer-wrong to player ${socket.id}`);
          socket.emit('answer-wrong', {
            livesLeft: result.livesLeft,
            nextTurn: result.nextTurn,
            gameState: result.gameState
          });
        }

        // If the submit advanced the round (draw or round winner), notify clients explicitly
        if (result.roundAdvanced) {
          console.log(`🔁 Round advanced to ${result.advancedToRound} in room ${data.roomCode}`);
          io.to(data.roomCode).emit('round-advanced', {
            round: result.advancedToRound,
            gameState: result.gameState
          });
        }

        // Check for game over BEFORE broadcasting
        if (result.winner) {
          console.log(`🏆 Game winner: ${result.winner}`);
          const finalState = endGame(data.roomCode);
          io.to(data.roomCode).emit('game-over', {
            winner: result.winner,
            finalState
          });
          return;
        }

        // CRITICAL: Broadcast full game state to ALL players in the room
        console.log(`📢 Broadcasting game-updated to all players in room ${data.roomCode}`);
        console.log(`   Board: [${result.gameState.board.join(', ')}]`);
        console.log(`   Current Turn: ${result.gameState.currentTurn}`);
        console.log(`   Players:`, result.gameState.players.map(p => `${p.name}(${p.symbol}): lives=${p.lives}, score=${p.score}`).join(', '));
        
        io.to(data.roomCode).emit('game-updated', result.gameState);
        console.log(`✅ game-updated emitted\n`);
      } catch (error) {
        console.error('Error submitting answer:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('place-symbol', (data) => {
      try {
        if (!data || !data.roomCode || data.position === undefined) {
          socket.emit('error', { message: 'Room code and position are required' });
          return;
        }

        const result = placeSymbol(data.roomCode, socket.id, data.position);
        if (result.success === false) {
          socket.emit('error', { message: result.message });
          return;
        }

        io.to(data.roomCode).emit('board-updated', {
          board: result.board,
          lastMove: { player: socket.id, position: data.position }
        });

        if (result.winner) {
          const finalState = endGame(data.roomCode);
          io.to(data.roomCode).emit('game-over', {
            winner: result.winner,
            finalState
          });
          return;
        }

        io.to(data.roomCode).emit('turn-changed', {
          currentTurn: result.nextTurn
        });
        io.to(data.roomCode).emit('game-updated', getGameState(data.roomCode));
      } catch (error) {
        console.error('Error placing symbol:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('get-game-state', (data) => {
      try {
        if (!data || !data.roomCode) {
          socket.emit('error', { message: 'Room code is required' });
          return;
        }

        const gameState = getGameState(data.roomCode);
        if (!gameState) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        socket.emit('game-state', gameState);
      } catch (error) {
        console.error('Error getting game state:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.id}`);

      try {
        for (const [userId, userData] of activeUsers) {
          if (userData.socketId === socket.id) {
            if (userData.username) {
              usernameToSocketId.delete(userData.username);
            }
            activeUsers.delete(userId);
            await setUserOnline(userId, false);
            io.emit('online-users', await getOnlineUsers());
            break;
          }
        }

        for (const [roomCode, room] of getAllRooms()) {
          if (room.getPlayer(socket.id)) {
            const removedPlayer = leaveRoom(roomCode, socket.id);
            if (removedPlayer) {
              socket.to(roomCode).emit('player-disconnected', {
                player: removedPlayer
              });
            }

            const gameState = getGameState(roomCode);
            if (gameState && gameState.gameStatus === 'active') {
              const finalState = endGame(roomCode);
              io.to(roomCode).emit('game-ended', {
                reason: 'Player disconnected',
                finalState
              });
            }

            io.emit('room-list-updated', getRoomsList());
            break;
          }
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
}

module.exports = { setupSocketHandlers };
