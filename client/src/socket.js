import { io } from 'socket.io-client'

const URL = import.meta.env.VITE_SERVER_URL || window.location.origin

export const socket = io(URL, { autoConnect: false })
