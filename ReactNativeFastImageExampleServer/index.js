const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const morgan = require('morgan')

const app = express()

const port = process.env.PORT || 8080
const welcome = 'Test images API at http://localhost:' + port
console.log(welcome)

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(morgan('dev'))
app.get('/', (req, res) => res.send(welcome))
app.listen(port)

const authentication = (req, res, next) => {
    const token = req.query.token || req.headers['token']
    if (token) {
        next()
    } else {
        return res.status(403).send({ success: false })
    }
}

const staticPictures = express.static(path.join(__dirname, 'pictures'))

app.use('/pictures', authentication, staticPictures)
