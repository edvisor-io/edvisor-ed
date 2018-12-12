const graphql = require('graphql-request')
const pullQueries = require('./queries/pull-requests')
const Bluebird = require('bluebird')
const dotenv = require('dotenv')
dotenv.load()

const URL = 'https://api.github.com/graphql'

const EDVISOR_AUTHORS = [
  'bollain',
  'brjmc',
  'variousauthors',
  'Spencerhutch',
  'stringbeans',
  'hotaru355',
  'austin-sa-wang'
]


const parseGithubResponse = (pullRequests) => {
  const output = []
  pullRequests.forEach((pull) => {
    if (!EDVISOR_AUTHORS.includes(pull.node.author.login)){
      return
    }
    const accepts = []
    const changeRequests = []
    pull.node.reviews.nodes.forEach((review) => {
      if(review.state === 'APPROVED') {
        accepts.push({
          author: review.author.login,
          createdAt: review.createdAt
        })
      } else if (review.state === 'CHANGES_REQUESTED') {
        changeRequests.push({
          createdAt: review.createdAt,
          author: review.author.login
        })
      }
    })


    let state = null
    if (accepts.length < 2) {
      state = 'NEEDS_EYES'
    } else {
      const accepters = accepts.map(a => a.author)
      const changeRequesters = changeRequests.map(a => a.author)
      const diff = changeRequesters.filter(x => !accepters.includes(x))
      if (diff.length > 0) {
        state = 'CHANGES_REQUESTED'
      } else {
        state = 'ACCEPTED'
      }
    }

    output.push({
      link: pull.node.permalink,
      author: pull.node.author.login,
      accepts,
      changeRequests,
      state
    })
  })
  return output
}

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
    repo: pullRequest.repository.name,
    prNumber: pullRequest.number,
    author: pullRequest.author.login,
    isOpen: !pullRequest.closed,
    approvals,
    changeRequests,
    lastCommitTimestamp: lastCommit.committedDate
  }
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
    const [
      database,
      webClient,
      apiServer,
      apiServerV2,
      b2c,
      reactWebClient
    ] = await Bluebird.all([
      client.request(pullQueries.database),
      client.request(pullQueries.webClient),
      client.request(pullQueries.apiServer),
      client.request(pullQueries.apiServerV2),
      client.request(pullQueries.b2c),
      client.request(pullQueries.reactWebClient),
    ])

    const allPulls = [].concat(
      database.repository.pullRequests.edges,
      webClient.repository.pullRequests.edges,
      apiServer.repository.pullRequests.edges,
      apiServerV2.repository.pullRequests.edges,
      b2c.repository.pullRequests.edges,
      reactWebClient.repository.pullRequests.edges,
    )

    const prLinks = allPulls.map((pr) => pr.node.permalink)

    return Bluebird.each(prLinks, async (link) => this.pullRequests.push(await prStructByUrL(link)))
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
        const usersNeeded = EDVISOR_AUTHORS.filter(x => (x !== pullRequest.author) && !commentsSeenfrom.includes(x))
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
          robot.adapter.client.web.chat.update(ts, channelId, '*Pull Requests: *', c.toString())
        }
      })
    }
  })
}