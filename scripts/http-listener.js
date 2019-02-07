const pullRequestHelper = require('./pull-request-helper')

// import { sendPullRequestsToChannel } from './pull-requester'

module.exports = (robot) => {
  robot.router.get('/', (req, res) => {
    res.send('<body> '+
      '  <iframe src="https://giphy.com/embed/ZlL9U0DNaOdFK" width="480" height="210" frameBorder="0" class="giphy-embed" allowFullScreen></iframe> ' +
      '</body> '
    )
  })

  robot.router.get('/pull-requests', async (req, res) => {
    // console.log('Pull: ', pullRequester.bind(robot)
    await pullRequestHelper.sendPullRequestsToChannel(robot, 'C03APLKM5', false) //'CEEP41W8K', false)
    res.send()
  })
}