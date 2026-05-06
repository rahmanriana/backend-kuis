const { Game } = require('../models/Game');
const { quizData } = require('../utils/quizData');
const { getRoom } = require('./roomController');

// In-memory storage for games
const games = new Map();

/**
 * Start a new game
 * @param {string} roomCode - Room code
 * @param {string} theme - Game theme
 * @param {array} players - Array of players
 * @returns {object} - {success, game, question}
 */
function startGame(roomCode, theme, players) {
  try {
    // Validate inputs
    if (!roomCode || !theme || !players || players.length !== 2) {
      return { success: false, message: 'Invalid game parameters' };
    }

    // Check if game already exists
    if (games.has(roomCode)) {
      return { success: false, message: 'Game already exists' };
    }

    // Create game
    const game = new Game(roomCode, theme, players, quizData);

    // Get first question
    const question = game.getRandomQuestion();
    if (!question) {
      return { success: false, message: 'No questions available' };
    }

    // Store game
    games.set(roomCode, game);

    console.log(`Game started for room ${roomCode} with theme ${theme}`);
    return { success: true, game, question };
  } catch (error) {
    console.error('Error starting game:', error);
    return { success: false, message: 'Internal server error' };
  }
}

/**
 * Get current question for room
 * @param {string} roomCode - Room code
 * @returns {object|null} - Current question or null
 */
function getQuestion(roomCode) {
  try {
    const game = games.get(roomCode);
    return game ? game.currentQuestion : null;
  } catch (error) {
    console.error('Error getting question:', error);
    return null;
  }
}

/**
 * Submit answer for current question
 * @param {string} roomCode - Room code
 * @param {string} playerSocketId - Player's socket ID
 * @param {number} answer - Answer index (0-3)
 * @returns {object} - {correct, livesLeft?, nextTurn?}
 */
function submitAnswer(roomCode, playerSocketId, answer, position) {
  try {
    const game = games.get(roomCode);
    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    if (game.gameStatus !== 'active') {
      return { success: false, message: 'Game not active' };
    }

    if (game.currentTurn !== playerSocketId) {
      return { success: false, message: 'Not your turn' };
    }

    // Ensure answer is a number (socket may send strings)
    const numericAnswer = Number(answer);
    console.log(`Checking answer (raw: ${answer}, numeric: ${numericAnswer}) against correctIndex: ${game.currentQuestion?.correctAnswer}`);
    const correct = game.checkAnswer(numericAnswer);

    // Track whether this submit caused a round advancement (win or draw)
    let roundAdvanced = false;
    let advancedToRound = null;

    if (correct) {
      const points = game.round === 1 ? 10 : game.round === 2 ? 20 : 30;
      game.addScore(playerSocketId, points);

      const moveResult = game.makeMove(position, playerSocketId);
      if (!moveResult.success) {
        return { success: false, message: 'Invalid move' };
      }

      const winner = game.checkWinner();
      if (winner) {
        // This is a round winner, not game winner yet
        // Advance to next round instead of ending game
        console.log(`=== ROUND ${game.round} WINNER: ${winner} - ADVANCING TO NEXT ROUND ===`);
        game.nextRound();
        roundAdvanced = true;
        advancedToRound = game.round;
        console.log(`=== NOW IN ROUND ${game.round} ===`);
        
        // Check if GAME is over (all 3 rounds done)
        const gameOver = game.checkGameOver();
        if (gameOver) {
          console.log(`=== GAME OVER - Winner: ${game.winner} ===`);
          return {
            correct: true,
            points,
            winner: game.winner, // Only set winner if GAME is over
            board: game.board,
            gameState: game.getGameState()
          };
        }
        
        // Game continues, no winner field = not game over yet
        game.switchTurn();
        return {
          correct: true,
          points,
          board: game.board,
          nextTurn: game.currentTurn,
          gameState: game.getGameState()
        };
      }

      // Check if board is full (draw) - BEFORE switching turn
      const isBoardFull = game.board.every(cell => cell !== null);
      console.log(`[ANSWER CORRECT] Board: [${game.board.join(',')}] Full: ${isBoardFull}, Round: ${game.round}`);
      
        if (isBoardFull) {
        console.log(`=== ROUND ${game.round} ENDED IN DRAW - ADVANCING TO NEXT ROUND ===`);
          game.nextRound();
          roundAdvanced = true;
          advancedToRound = game.round;
        console.log(`=== NOW IN ROUND ${game.round} ===`);
        
        // Check if game is over after next round
        const gameOver = game.checkGameOver();
        if (gameOver) {
          console.log(`=== GAME OVER - Winner: ${game.winner} ===`);
          return {
            correct: true,
            points,
            winner: game.winner,
            board: game.board,
            gameState: game.getGameState()
          };
        }
      }

      // Switch turn after everything is resolved (if game still active)
      if (game.gameStatus === 'active') {
        game.switchTurn();
      }
      console.log(`[ANSWER CORRECT] Turn switched to: ${game.currentTurn}, Now Round: ${game.round}`);
      
      return {
        correct: true,
        points,
        board: game.board,
        nextTurn: game.currentTurn,
        gameState: game.getGameState(),
        roundAdvanced,
        advancedToRound
      };
    } else {
      const livesLeft = game.deductLife(playerSocketId);
      
      // Check if any player has 0 lives after deduction
      if (livesLeft <= 0) {
        console.log(`Player ${playerSocketId} has no lives left, game over`);
        const gameOver = game.checkGameOver();
        if (gameOver) {
          return {
            correct: false,
            livesLeft,
            winner: game.winner,
            gameState: game.getGameState()
          };
        }
      }
      
      game.switchTurn();
      return {
        correct: false,
        livesLeft,
        nextTurn: game.currentTurn,
        gameState: game.getGameState(),
        roundAdvanced: false
      };
    }
  } catch (error) {
    console.error('Error submitting answer:', error);
    return { success: false, message: 'Internal server error' };
  }
}

/**
 * Select cell (get question for cell placement)
 * @param {string} roomCode - Room code
 * @param {string} playerSocketId - Player's socket ID
 * @param {number} position - Board position
 * @returns {object|null} - Question object or null
 */
function selectCell(roomCode, playerSocketId, position) {
  try {
    const game = games.get(roomCode);
    if (!game) {
      return null;
    }

    if (game.currentTurn !== playerSocketId) {
      return null;
    }

    // Get new question for this cell
    const question = game.getRandomQuestion();
    return question;
  } catch (error) {
    console.error('Error selecting cell:', error);
    return null;
  }
}

/**
 * Place symbol on board
 * @param {string} roomCode - Room code
 * @param {string} playerSocketId - Player's socket ID
 * @param {number} position - Board position
 * @returns {object} - {board, winner?, gameStatus}
 */
function placeSymbol(roomCode, playerSocketId, position) {
  try {
    const game = games.get(roomCode);
    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    if (game.gameStatus !== 'active') {
      return { success: false, message: 'Game not active' };
    }

    if (game.currentTurn !== playerSocketId) {
      return { success: false, message: 'Not your turn' };
    }

    // Make move
    const moveResult = game.makeMove(position, playerSocketId);
    if (!moveResult.success) {
      return { success: false, message: 'Invalid move' };
    }

    // Check for winner
    const winner = game.checkWinner();

    // Add score for successful placement
    const points = game.round === 1 ? 10 : game.round === 2 ? 20 : 30;
    game.addScore(playerSocketId, points);

    // Check game over conditions
    const gameOver = game.checkGameOver();

    return {
      board: game.board,
      winner: winner,
      gameStatus: game.gameStatus
    };
  } catch (error) {
    console.error('Error placing symbol:', error);
    return { success: false, message: 'Internal server error' };
  }
}

/**
 * Get current game state
 * @param {string} roomCode - Room code
 * @returns {object|null} - Game state or null
 */
function getGameState(roomCode) {
  try {
    const game = games.get(roomCode);
    return game ? game.getGameState() : null;
  } catch (error) {
    console.error('Error getting game state:', error);
    return null;
  }
}

/**
 * End game and get final results
 * @param {string} roomCode - Room code
 * @returns {object|null} - Final game results or null
 */
function endGame(roomCode) {
  try {
    const game = games.get(roomCode);
    if (!game) {
      return null;
    }

    const finalState = game.getGameState();

    // Clean up game
    games.delete(roomCode);

    console.log(`Game ended for room ${roomCode}`);
    return finalState;
  } catch (error) {
    console.error('Error ending game:', error);
    return null;
  }
}

/**
 * Delete game
 * @param {string} roomCode - Room code
 */
function deleteGame(roomCode) {
  games.delete(roomCode);
  console.log(`Game deleted for room ${roomCode}`);
}

/**
 * Get all games (debug)
 * @returns {Map} - All games
 */
function getAllGames() {
  return games;
}

module.exports = {
  startGame,
  getQuestion,
  submitAnswer,
  selectCell,
  placeSymbol,
  getGameState,
  endGame,
  deleteGame,
  getAllGames
};