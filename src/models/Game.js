class Game {
  constructor(roomCode, theme, players, quizData) {
    this.roomCode = roomCode;
    this.theme = theme;
    this.players = players.map(player => ({
      ...player,
      lives: 5,
      score: 0
    }));
    this.board = Array(9).fill(null);
    this.currentTurn = this.players[0].socketId; // Start with first player
    this.round = 1; // 1=mudah, 2=menengah, 3=sulit
    this.currentQuestion = null;
    this.usedQuestions = [];
    this.gameStatus = 'active'; // active, paused, finished
    this.winner = null;
    this.quizData = quizData;
  }

  /**
   * Get difficulty string based on current round
   * @returns {string} - Difficulty level
   */
  getDifficultyByRound() {
    switch (this.round) {
      case 1: return 'mudah';
      case 2: return 'menengah';
      case 3: return 'sulit';
      default: return 'mudah';
    }
  }

  /**
   * Get a random unused question for current round and theme
   * @returns {object|null} - Question object or null if no questions available
   */
  getRandomQuestion() {
    const difficulty = this.getDifficultyByRound();
    const themeQuestions = this.quizData[this.theme][difficulty];

    if (!themeQuestions) {
      console.error(`No questions found for theme ${this.theme} and difficulty ${difficulty}`);
      return null;
    }

    // Filter out used questions
    const availableQuestions = themeQuestions.filter(q => !this.usedQuestions.includes(q.id));

    if (availableQuestions.length === 0) {
      console.log(`No more questions available for ${this.theme} ${difficulty}`);
      return null;
    }

    // Select random question
    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    const selectedQuestion = availableQuestions[randomIndex];

    // Create a shuffled copy so the correct answer isn't always at a fixed index
    const shuffledQuestion = {
      ...selectedQuestion,
      options: Array.isArray(selectedQuestion.options) ? [...selectedQuestion.options] : []
    };

    // Shuffle options while preserving which one is correct
    // We shuffle (text, isCorrect) pairs then compute the new correctAnswer index.
    const optionPairs = shuffledQuestion.options.map((text, index) => ({
      text,
      isCorrect: index === selectedQuestion.correctAnswer
    }));

    // Fisher-Yates shuffle
    for (let i = optionPairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [optionPairs[i], optionPairs[j]] = [optionPairs[j], optionPairs[i]];
    }

    shuffledQuestion.options = optionPairs.map(p => p.text);
    // Ensure correctAnswer is numeric and points to the new index of the correct option
    const newCorrectIndex = optionPairs.findIndex(p => p.isCorrect);
    shuffledQuestion.correctAnswer = typeof newCorrectIndex === 'number' ? newCorrectIndex : -1;

    // Log shuffle for debugging (can be removed later)
    console.log(`Shuffled question ${selectedQuestion.id}: options=[${shuffledQuestion.options.join('|')}], correctAnswerIndex=${shuffledQuestion.correctAnswer}`);

    // Mark as used
    this.usedQuestions.push(selectedQuestion.id);
    this.currentQuestion = shuffledQuestion;

    console.log(`Selected question ${selectedQuestion.id} for round ${this.round}`);
    return shuffledQuestion;
  }

  /**
   * Check if answer is correct
   * @param {number} answer - Answer index (0-3)
   * @returns {boolean} - True if correct
   */
  checkAnswer(answer) {
    if (!this.currentQuestion) {
      return false;
    }
    return answer === this.currentQuestion.correctAnswer;
  }

  /**
   * Make a move on the board
   * @param {number} position - Board position (0-8)
   * @param {string} playerSocketId - Player's socket ID
   * @returns {object} - {success, board}
   */
  makeMove(position, playerSocketId) {
    if (position < 0 || position > 8 || this.board[position] !== null) {
      return { success: false, board: this.board };
    }

    const player = this.players.find(p => p.socketId === playerSocketId);
    if (!player) {
      return { success: false, board: this.board };
    }

    this.board[position] = player.symbol;
    console.log(`Player ${player.name} placed ${player.symbol} at position ${position}`);
    return { success: true, board: this.board };
  }

  /**
   * Check for winner or draw
   * @returns {string|null} - Winner socketId, 'draw', or null
   */
  checkWinner() {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
      [0, 4, 8], [2, 4, 6] // diagonals
    ];

    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
        return this.players.find(p => p.symbol === this.board[a]).socketId;
      }
    }

    // Check for draw
    if (this.board.every(cell => cell !== null)) {
      return 'draw';
    }

    return null;
  }

  /**
   * Switch turn to next player
   */
  switchTurn() {
    const currentPlayerIndex = this.players.findIndex(p => p.socketId === this.currentTurn);
    this.currentTurn = this.players[(currentPlayerIndex + 1) % this.players.length].socketId;
    this.currentQuestion = null; // Reset question for new turn
    console.log(`Turn switched to player ${this.currentTurn}`);
  }

  /**
   * Deduct life from player
   * @param {string} playerSocketId - Player's socket ID
   * @returns {number} - Remaining lives
   */
  deductLife(playerSocketId) {
    const player = this.players.find(p => p.socketId === playerSocketId);
    if (player) {
      player.lives = Math.max(0, player.lives - 1);
      console.log(`Player ${player.name} lost a life. Remaining: ${player.lives}`);
      return player.lives;
    }
    return 0;
  }

  /**
   * Add score to player
   * @param {string} playerSocketId - Player's socket ID
   * @param {number} points - Points to add
   */
  addScore(playerSocketId, points) {
    const player = this.players.find(p => p.socketId === playerSocketId);
    if (player) {
      player.score += points;
      console.log(`Player ${player.name} gained ${points} points. Total: ${player.score}`);
    }
  }

  /**
   * Advance to next round
   */
  nextRound() {
    this.round += 1;
    this.board = Array(9).fill(null); // Reset board
    this.usedQuestions = []; // Reset used questions for new round
    this.currentQuestion = null; // Reset current question
    console.log(`Advanced to round ${this.round}, board and questions reset`);
  }

  /**
   * Check if game is over
   * @returns {boolean} - True if game over
   */
  checkGameOver() {
    // Game over if any player has 0 lives
    const hasPlayerWithNoLives = this.players.some(p => p.lives <= 0);
    if (hasPlayerWithNoLives) {
      this.gameStatus = 'finished';
      const winner = this.players.find(p => p.lives > 0);
      this.winner = winner ? winner.socketId : 'draw';
      console.log(`Game over - Player ran out of lives. Winner: ${this.winner}`);
      return true;
    }

    // Game over only if all 3 rounds are COMPLETED (round would advance to 4)
    const allRoundsCompleted = this.round > 3;
    if (allRoundsCompleted) {
      this.gameStatus = 'finished';
      
      // Determine winner by score
      const sortedPlayers = [...this.players].sort((a, b) => b.score - a.score);
      if (sortedPlayers[0].score > sortedPlayers[1].score) {
        this.winner = sortedPlayers[0].socketId;
      } else {
        this.winner = 'draw';
      }
      
      console.log(`All 3 rounds completed. Winner: ${this.winner}`);
      return true;
    }

    return false;
  }

  /**
   * Get current game state
   * @returns {object} - Game state object
   */
  getGameState() {
    return {
      roomCode: this.roomCode,
      board: this.board,
      currentTurn: this.currentTurn,
      round: this.round,
      players: this.players,
      gameStatus: this.gameStatus,
      winner: this.winner
    };
  }
}

module.exports = { Game };