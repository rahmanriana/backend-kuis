class Room {
  constructor(roomCode, theme, hostSocketId) {
    this.roomCode = roomCode;
    this.theme = theme;
    this.host = hostSocketId;
    this.players = [];
    this.status = 'waiting'; // waiting, playing, finished
    this.createdAt = new Date();
    this.maxPlayers = 2;
  }

  /**
   * Add a player to the room
   * @param {string} socketId - Player's socket ID
   * @param {string} name - Player's name
   * @returns {boolean} - True if added successfully, false if room is full
   */
  addPlayer(socketId, name) {
    if (this.players.length >= this.maxPlayers) {
      return false;
    }

    // Assign symbol based on player order (X for first player, O for second)
    const symbol = this.players.length === 0 ? 'X' : 'O';

    const player = {
      socketId,
      name,
      symbol,
      lives: 5,
      score: 0
    };

    this.players.push(player);
    console.log(`Player ${name} (${symbol}) joined room ${this.roomCode}`);
    return true;
  }

  /**
   * Remove a player from the room
   * @param {string} socketId - Player's socket ID
   * @returns {object|null} - Removed player object or null if not found
   */
  removePlayer(socketId) {
    const playerIndex = this.players.findIndex(player => player.socketId === socketId);
    if (playerIndex === -1) {
      return null;
    }

    const removedPlayer = this.players.splice(playerIndex, 1)[0];
    console.log(`Player ${removedPlayer.name} left room ${this.roomCode}`);
    return removedPlayer;
  }

  /**
   * Get player by socket ID
   * @param {string} socketId - Player's socket ID
   * @returns {object|null} - Player object or null if not found
   */
  getPlayer(socketId) {
    return this.players.find(player => player.socketId === socketId) || null;
  }

  /**
   * Check if room is full
   * @returns {boolean} - True if room is full
   */
  isFull() {
    return this.players.length >= this.maxPlayers;
  }

  /**
   * Get current player count
   * @returns {number} - Number of players in room
   */
  getPlayerCount() {
    return this.players.length;
  }

  /**
   * Check if room can start game (has 2 players)
   * @returns {boolean} - True if can start
   */
  canStart() {
    return this.players.length === this.maxPlayers;
  }

  /**
   * Convert room to serializable object
   * @returns {object} - Serializable room data
   */
  toJSON() {
    return {
      roomCode: this.roomCode,
      theme: this.theme,
      host: this.host,
      players: this.players.map(player => ({
        socketId: player.socketId,
        name: player.name,
        symbol: player.symbol,
        lives: player.lives,
        score: player.score
      })),
      status: this.status,
      createdAt: this.createdAt,
      maxPlayers: this.maxPlayers
    };
  }
}

module.exports = { Room };