module.exports = (robot) => {
  robot.router.get('/', (req, res) => {
    res.send('<body> '+
      '  <iframe src="https://giphy.com/embed/ZlL9U0DNaOdFK" width="480" height="210" frameBorder="0" class="giphy-embed" allowFullScreen></iframe> ' +
      '  <p> <a href="https://giphy.com/gifs/simon-pegg-shaun-of-the-dead-ZlL9U0DNaOdFK">via GIPHY</a></p> ' +
      '</body> '
    )
  })
}