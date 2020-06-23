
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./react-native-fast-image.cjs.production.min.js')
} else {
  module.exports = require('./react-native-fast-image.cjs.development.js')
}
