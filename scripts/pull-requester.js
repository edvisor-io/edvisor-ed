const dotenv = require('dotenv')
dotenv.load()

const pullRequestHelper = require('./pull-request-helper')

function swapKeyValue(obj) {
  var ret = {};
  for(let key in obj){
    ret[obj[key]] = key;
  }
  return ret;
}

const userMap = {...pullRequestHelper.userMap}
const SLACK_TO_GITHUB = swapKeyValue(pullRequestHelper.userMap)

const recycleReactionMatcher = (i) => {
  const isRecycle = (i.reaction === 'recycle')
  const isEd = (i.item_user && i.item_user.real_name.toLowerCase() === 'ed')
  return (isRecycle && isEd)
}

const populateSlacktoGithubUserMap = (robot) => {
  const brainUsers = robot.brain.data.users
  const userIds = Object.keys(brainUsers)
  const developers = Object.keys(SLACK_TO_GITHUB)
  userIds.forEach((userId) => {
    const user = brainUsers[userId]
    if (developers.includes(user.name)) {
      const githubUserName = SLACK_TO_GITHUB[user.name]
      userMap[githubUserName] = `<@${user.id}>`
    }
  })
}

const PR_STRUCTURE = [{
  isOpen: true,
  link: 'https://github.com/edvisor-io/web-client/pull/1128',
  repo: 'web-client',
  prNumber: 1128,
  labels: [],
  author: 'spencer',
  changesRequested: [{
    author: 'joe',
    timestamp: '2018-12-01'
  }],
  approvals: [{
    author: 'doe',
    timestamp: '2018-12-02'
  }],
  noCommentFrom: ['jane', 'zoey'],
  lastCommitTimestamp: '2018-12-02'
}]

module.exports = (robot) => {
  populateSlacktoGithubUserMap(robot)

  robot.respond(/prs|(pull request status)/i, async (res) => {
    const args = res.message.text.replace(/.*?(prs|(pull request status))/i, '')
      .trim()
      .split(' ')
      .filter(value => value !== '')
    const channelId = res.envelope.room
    return pullRequestHelper.sendPullRequestsToChannel(robot, channelId, args)
  })

  robot.listen(recycleReactionMatcher, (res) => {
    const message = res.message
    const channelId = message.item.channel
    const ts = message.item.ts
    item = message.item

    if (item.type === 'message') {
      robot.adapter.client.web.channels.history(channelId, {
        count: 1,
        inclusive: true,
        latest: ts
      }).then(async (i) => {
        if (i && i.messages[0]) {
          const message = i.messages[0]

          const c = new pullRequestHelper.edvisorPuller([])
          await c.buildFromAttachments(message.attachments)

          robot.adapter.client.web.chat.update(ts, channelId, '*Pull Requests: *', {as_user: true, attachments: c.toString()})
        }
      })
    }
  })
}
