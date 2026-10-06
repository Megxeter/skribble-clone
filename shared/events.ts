// WebSocket Event Names
export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',

  // Room & Lobby
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  JOIN_PUBLIC: 'join_public',
  LEAVE_ROOM: 'leave_room',
  UPDATE_SETTINGS: 'update_settings',
  SET_READY: 'set_ready',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  ROOM_STATE: 'room_state',
  START_GAME: 'start_game',
  ERROR_MESSAGE: 'error_message',

  // Game Lifecycle & Turns
  GAME_STATE: 'game_state',
  ROUND_START: 'round_start',
  CHOOSE_WORD: 'choose_word',
  TIMER_TICK: 'timer_tick',
  HINT_REVEALED: 'hint_revealed',
  ROUND_END: 'round_end',
  GAME_OVER: 'game_over',

  // Canvas Drawing
  DRAW_START: 'draw_start',
  DRAW_MOVE: 'draw_move',
  DRAW_END: 'draw_end',
  DRAW_UNDO: 'draw_undo',
  CANVAS_CLEAR: 'canvas_clear',
  DRAW_SYNC: 'draw_sync',

  // Chat & Guesses
  CHAT_INPUT: 'chat_input',
  CHAT_MESSAGE: 'chat_message',
  CORRECT_GUESS: 'correct_guess',
} as const;

export type SocketEventName = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
