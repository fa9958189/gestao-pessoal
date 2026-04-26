import express from 'express'
import cors from 'cors'
import workoutRoutes from './routes/workoutRoutes.js'

const app = express()

app.use(cors())
app.use(express.json())

// suas rotas aqui
app.use('/api/workouts', workoutRoutes)

app.listen(3001, () => {
  console.log('Servidor rodando na porta 3001')
})
