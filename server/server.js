import process from 'node:process'
import { createApp } from './app.js'

export const DEFAULT_PORT = 3001

const port = Number(process.env.PORT) || DEFAULT_PORT

createApp().listen(port, () => {
  console.log(`SomaNami API listening on http://localhost:${port}`)
})
