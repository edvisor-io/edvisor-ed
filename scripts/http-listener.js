const pullRequestHelper = require('./pull-request-helper')
const dotenv = require('dotenv')
dotenv.load()

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
    await pullRequestHelper.sendPullRequestsToChannel(robot, process.env.PERIODIC_PRS_SLACK_DESTINATION_CHANNEL_ID, [])
    res.send()
  })
}
