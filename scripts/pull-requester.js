const graphql = require('graphql-request')
const pullQueries = require('./queries/pull-requests')
const Bluebird = require('bluebird')
const dotenv = require('dotenv')
dotenv.load()

const URL = 'https://api.github.com/graphql'

const HIDDEN_LABEL = 'Not ready for review'

const EDVISOR_AUTHORS = [
  'bollain',
  'brjmc',
  'variousauthors',
  'Spencerhutch',
  'stringbeans',
  'hotaru355',
  'austin-sa-wang'
]

const client = new graphql.GraphQLClient(URL, {
  headers: {
    'Content-Type': 'application/json',
    Authorization: `bearer ${process.env.HUBOT_GITHUB_TOKEN}`
  }
})

const userMap = {
  Spencerhutch: '@spencer',
  bollain: '@bollain',
  brjmc: '@Brendan',
  variousauthors: '@andre',
  stringbeans: '@john',
  hotaru355: '@kenta',
  'austin-sa-wang': '@austin'
}

const SLACK_TO_GITHUB = {
  spencer: 'Spencerhutch',
  armando: 'bollain',
  brendan: 'brjmc',
  andre: 'variousauthors',
  john: 'stringbeans',
  kenta: 'hotaru355',
  austin: 'austin-sa-wang',
}

const gitNamesToSlackNames = (users) => {
  let output = ''
  for(var ix = 0 ; ix < users.length - 1; ix++) {
    current = users[ix]
    output += `${userMap[current]} || `
  }

  output += userMap[users[users.length-1]]

  return output
}

const recycleReactionMatcher = (i) => {
  const isRecycle = (i.reaction === 'recycle')
  const isEd = (i.item_user && i.item_user.real_name.toLowerCase() == 'ed')
  return (isRecycle && isEd)
}

const prStructByUrL = async (url) => {
  const result = await client.request(pullQueries.prInfoByurl(url))
  const pullRequest = result.resource

  let labels = []
  if (pullRequest.labels.edges.length) {
    labels = labels.concat(pullRequest.labels.edges.map((e) => e.node.name))
  }


  const approvals = []
  const changeRequests = []

  const commits = pullRequest.commits.edges
  const lastCommit = commits[0].node.commit

  pullRequest.reviews.edges.forEach((node) => {
    const review = node.node
    switch(review.state) {
      case 'APPROVED':
        approvals.push({
          author: review.author.login,
          timestamp: review.submittedAt
        })
        break;
      case 'CHANGES_REQUESTED':
        changeRequests.push({
          author: review.author.login,
          timestamp: review.submittedAt,
        })
        break
    }
  })


  return {
    link: url,
    labels,
    repo: pullRequest.repository.name,
    prNumber: pullRequest.number,
    author: pullRequest.author.login,
    isOpen: !pullRequest.closed,
    approvals,
    changeRequests,
    lastCommitTimestamp: lastCommit.committedDate
  }
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

class edvisorPuller {
  constructor() {
    this.pullRequests = []
  }

  async buildFromNothing() {
    const org = await client.request(pullQueries.edvisorRepositories)
    const allRepos = org.organization.repositories.edges

    const allPrs = allRepos.reduce((memo, current) => {
      const pullRequests = current.node.pullRequests.edges
      if (pullRequests.length > 0) {
        pullRequests.forEach((pullRequest) => {
          const link = pullRequest.node.permalink
          return memo.push(link)
        })
      }
      return memo
    }, [])

    return Bluebird.each(allPrs, async (link) => this.pullRequests.push(await prStructByUrL(link)))
  }

  async buildFromString(text) {
    const lines = text.split('\n')
    return Bluebird.each(lines, async (line) => {
      const urlMatches = line.match(/(https?:\/\/[^\s]+(\d))/)
      if (urlMatches) {
        const link = urlMatches[0]
        const pullRequest = {}
        pullRequest.link = urlMatches[0]

        this.pullRequests.push(await prStructByUrL(link))
      }
    })
  }

  async buildFromAttachments(attachments) {
    const prLinks = []
    attachments.forEach((attachment) => {
      const lines = attachment.text.split('\n')
      lines.forEach((line) => {
        const urlMatches = line.match(/(https?:\/\/[^\s]+(\d)(?=\|))/)
        if (urlMatches) {
          prLinks.push(urlMatches[0])
        }
      })
    })

    return Bluebird.each(prLinks, async (link) => this.pullRequests.push(await prStructByUrL(link)))
  }

  spy() {
    console.log('Struct: ', JSON.stringify(this.pullRequests, null, 2))
  }

  toString() {
    let approval = ''
    let eyes = ''
    let changeRequestOutput = ''
    this.pullRequests.forEach((pullRequest) => {

      if(pullRequest.labels.includes(HIDDEN_LABEL)) {
        return
      }

      const commentsSeenfrom = []

      pullRequest.changeRequests.forEach((changeRequest) => {
        commentsSeenfrom.push(changeRequest.author)
      })
      pullRequest.approvals.forEach((approval) => {
        commentsSeenfrom.push(approval.author)
      })

      const filteredChangesRequested = pullRequest.changeRequests.filter((changeRequest) => {
        const previousApprovals = pullRequest.approvals.filter((item) => (item.author === changeRequest.author && item.timestamp > changeRequest.timestamp))
        if(previousApprovals.length > 0) {
          return false
        }
        return true
      })

      const prLink = `- <${pullRequest.link}|${pullRequest.repo} #${pullRequest.prNumber} > `

      if (filteredChangesRequested.length > 0) {
        changeRequestOutput += `${prLink} ${userMap[pullRequest.author]}\n`
        return
      }

      if (pullRequest.approvals.length >= 2) {
        const isOpen = pullRequest.isOpen
        const lineItem = `${prLink} ${userMap[pullRequest.author]}`
        approval += `${(isOpen ? '' : '~')}${lineItem}${(isOpen ? '' : '~')}\n`
      }

      if (pullRequest.approvals.length < 2) {
        const usersNeeded = EDVISOR_AUTHORS.filter(x => (x !== pullRequest.author) && !commentsSeenfrom.includes(x) && (x !== 'stringbeans'))
        eyes += `${prLink} ${gitNamesToSlackNames(usersNeeded)}\n`
      }
    })

    let attachments = []

    if (approval !== '') {
      attachments.push({
        color: 'good',
        text: `*Approved: * \n${approval}`
      })
    }

    if (eyes !== '') {
      attachments.push({
        color: 'warning',
        text: `*Eyes Needed: * \n${eyes}`
      })
    }

    if (changeRequestOutput !== '') {
      attachments.push({
        color: 'danger',
        text: `*Change Requests: * \n${changeRequestOutput}`
      })
    }

    return attachments

  }
}


module.exports = (robot) => {
  populateSlacktoGithubUserMap(robot)

  robot.respond(/prs|(pull request status)/i, async (res) => {
    const channelId = res.envelope.room
    const PullRequests = new edvisorPuller()
    await PullRequests.buildFromNothing()

    return robot.adapter.client.web.chat.postMessage(channelId, `*Pull Requests: *`, {as_user: true, attachments: PullRequests.toString()})
      .then((post) => {
        robot.adapter.client.web.reactions.add('recycle', {channel: channelId, timestamp: post.ts})
      })
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

          const c = new edvisorPuller()
          await c.buildFromAttachments(message.attachments)

          robot.adapter.client.web.chat.update(ts, channelId, '*Pull Requests: *', {as_user: true, attachments: c.toString()})
        }
      })
    }
  })
}