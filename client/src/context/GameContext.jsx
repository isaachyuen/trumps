import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { socket } from '../socket'

const GameContext = createContext(null)

const initialState = {
  roomCode: null,
  playerId: null,
  mySeat: null,
  myHand: [],
  kitty: [],
  roomState: null,
  gameState: null,
  wins: { NS: 0, EW: 0 },
  gameOptions: { handsPerGame: 5, betPerGame: 0 },
  handsPlayed: 0,
  balance: 0,
  phase: 'home',   // home | lobby | highCardDraw | bidding | selectingTrump | playing | roundEnd | gameOver
  error: null,
  roundSummary: null,
  gameResult: null,
  highCardDraw: null
}

function reducer(state, action) {
  switch (action.type) {
    case 'ROOM_JOINED':
    case 'ROOM_CREATED': {
      const { roomCode, playerId, roomState } = action.payload
      return {
        ...state,
        roomCode, playerId, roomState,
        gameOptions: roomState?.gameOptions || state.gameOptions,
        balance: roomState?.balance ?? 0,
        phase: 'lobby',
        error: null
      }
    }
    case 'ROOM_UPDATED':
      return {
        ...state,
        roomState: action.payload.roomState,
        gameOptions: action.payload.roomState?.gameOptions || state.gameOptions
      }
    case 'GAME_STARTED': {
      const { gameState, yourHand, yourSeat } = action.payload
      return {
        ...state,
        gameState,
        myHand: yourHand,
        mySeat: yourSeat,
        kitty: [],
        phase: 'bidding',
        roundSummary: null,
        gameResult: null,
        error: null
      }
    }
    case 'BID_PLACED':
      return {
        ...state,
        gameState: {
          ...state.gameState,
          bids: { ...state.gameState.bids, [action.payload.seat]: action.payload.bid },
          highestBid: action.payload.highestBid,
          highestBidder: action.payload.highestBidder,
          currentTurn: action.payload.nextBidder || state.gameState.currentTurn
        }
      }
    case 'BIDDING_COMPLETE':
      return {
        ...state,
        gameState: {
          ...state.gameState,
          bids: action.payload.bids,
          highestBid: action.payload.bid,
          highestBidder: action.payload.winner,
          currentTurn: action.payload.winner
        },
        phase: 'selectingTrump'
      }
    case 'KITTY_DEALT':
      return { ...state, kitty: action.payload.kitty }
    case 'TRUMP_SELECTED':
      return { ...state, kitty: [], gameState: { ...action.payload.gameState }, phase: 'playing' }
    case 'HAND_UPDATED':
      return { ...state, myHand: action.payload.hand }
    case 'CARD_PLAYED': {
      const { seat, card, currentTrick, nextTurn } = action.payload
      const newHand = seat === state.mySeat ? state.myHand.filter(c => c !== card) : state.myHand
      return { ...state, myHand: newHand, gameState: { ...state.gameState, currentTrick, currentTurn: nextTurn } }
    }
    case 'TRICK_COMPLETE':
      return {
        ...state,
        gameState: {
          ...state.gameState,
          tricksWon: action.payload.tricksWon,
          currentTrick: [],
          currentTurn: action.payload.nextLeader
        }
      }
    case 'ROUND_COMPLETE':
      return {
        ...state,
        phase: 'roundEnd',
        roundSummary: action.payload.summary,
        wins: action.payload.wins,
        handsPlayed: action.payload.handsPlayed
      }
    case 'HIGH_CARD_DRAW':
      return { ...state, phase: 'highCardDraw', highCardDraw: action.payload }
    case 'GAME_COMPLETE':
      return {
        ...state,
        phase: 'gameOver',
        gameResult: action.payload,
        balance: action.payload.balance,
        gameOptions: action.payload.options
      }
    case 'PLAYER_DISCONNECTED':
    case 'PLAYER_RECONNECTED': {
      if (!state.roomState) return state
      const updated = state.roomState.players.map(p =>
        p.seat === action.payload.seat ? { ...p, connected: action.type === 'PLAYER_RECONNECTED' } : p
      )
      return { ...state, roomState: { ...state.roomState, players: updated } }
    }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    socket.on('roomUpdated', payload => dispatch({ type: 'ROOM_UPDATED', payload }))
    socket.on('gameStarted', payload => dispatch({ type: 'GAME_STARTED', payload }))
    socket.on('bidPlaced', payload => dispatch({ type: 'BID_PLACED', payload }))
    socket.on('biddingComplete', payload => dispatch({ type: 'BIDDING_COMPLETE', payload }))
    socket.on('kittyDealt', payload => dispatch({ type: 'KITTY_DEALT', payload }))
    socket.on('trumpSelected', payload => dispatch({ type: 'TRUMP_SELECTED', payload }))
    socket.on('handUpdated', payload => dispatch({ type: 'HAND_UPDATED', payload }))
    socket.on('cardPlayed', payload => dispatch({ type: 'CARD_PLAYED', payload }))
    socket.on('trickComplete', payload => setTimeout(() => dispatch({ type: 'TRICK_COMPLETE', payload }), 1500))
    socket.on('highCardDraw', payload => dispatch({ type: 'HIGH_CARD_DRAW', payload }))
    socket.on('roundComplete', payload => dispatch({ type: 'ROUND_COMPLETE', payload }))
    socket.on('gameComplete', payload => dispatch({ type: 'GAME_COMPLETE', payload }))
    socket.on('playerDisconnected', payload => dispatch({ type: 'PLAYER_DISCONNECTED', payload }))
    socket.on('playerReconnected', payload => dispatch({ type: 'PLAYER_RECONNECTED', payload }))

    return () => {
      ['roomUpdated','gameStarted','bidPlaced','biddingComplete','kittyDealt',
       'trumpSelected','handUpdated','cardPlayed','trickComplete','roundComplete',
       'gameComplete','highCardDraw','playerDisconnected','playerReconnected'].forEach(e => socket.off(e))
    }
  }, [])

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  return useContext(GameContext)
}
