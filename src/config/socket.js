const {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getRoomsList,
  getAllRooms
} = require('../controllers/roomController');

const {
  startGame,
  selectCell,
  submitAnswer,
  placeSymbol,
  getGameState,
  endGame
} = require('../controllers/gameController');

/**
 * Setup Socket.IO event handlers
 * @param {object} io - Socket.IO server instance
 */
function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

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
        socket.emit('room-created', {
          roomCode: result.roomCode,
          room: result.room.toJSON()
        });

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
        socket.emit('room-joined', {
          roomCode,
          room: result.room.toJSON()
        });

        socket.to(roomCode).emit('player-joined', {
          player: result.room.getPlayer(socket.id)
        });

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
          socket.to(roomCode).emit('player-left', { player: removedPlayer });
          io.emit('room-list-updated', getRoomsList());
        }
      } catch (error) {
        console.error('Error leaving room:', error);
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

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);

      try {
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