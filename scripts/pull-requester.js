const graphql = require('graphql-request')
const pullQueries = require('./queries/pull-requests')
const Bluebird = require('bluebird')
const dotenv = require('dotenv')
dotenv.load()

const URL = 'https://api.github.com/graphql'

const BEERPOD_AUTHORS = ['bollain', 'brjmc', 'variousauthors', 'Spencerhutch']


const parseGithubResponse = (pullRequests) => {
  const output = []
  pullRequests.forEach((pull) => {
    if (!BEERPOD_AUTHORS.includes(pull.node.author.login)){
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
  variousauthors: '@andre'
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

const isPRClosed = async (url) => {
  const result = await client.request(pullQueries.isPrStillOpen(url))
  return (result.resource && result.resource.closed)
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

      if (filteredChangesRequested.length > 0) {
        changeRequestOutput += `- ${pullRequest.link} ${pullRequest.author}\n`
        return
      }

      if (pullRequest.approvals.length >= 2) {
        const isOpen = pullRequest.isOpen
        approval += `${(isOpen ? '' : '~')}- ${pullRequest.link} ${pullRequest.author}${(isOpen ? '' : '~')}\n`
      }

      if (pullRequest.approvals.length < 2) {
        const usersNeeded = BEERPOD_AUTHORS.filter(x => (x !== pullRequest.author) && !commentsSeenfrom.includes(x))
        eyes += `- ${pullRequest.link} ${usersNeeded}\n`
      }
    })

    let outputString = ''

    if (approval !== '') {
      outputString += `*Approved: *\n${approval}`
    }

    if (eyes !== '') {
      outputString += `*Eyes Needed: *\n${eyes}`
    }

    if (changeRequestOutput !== '') {
      outputString += `*Change Requests: *\n${changeRequestOutput}`
    }

    return outputString
  }
}

module.exports = (robot) => {
  robot.respond(/pull request status/i, async (res) => {
    const channelId = res.envelope.room
    // const ts = res.message.item.ts
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

    const parsedOutput = parseGithubResponse(allPulls)
      const approved = []
      const eyes = []
      parsedOutput.forEach((o) => {
        if(o.state === 'ACCEPTED') {
          approved.push(`\n- ${o.link} ${gitNamesToSlackNames([o.author])}`)
        }
        if(o.state === 'NEEDS_EYES') {
          const usersApproved = o.accepts.map((a) => a.author)
          const usersRejected = o.changeRequests.map((a) => a.author)
          const usersNeeded = BEERPOD_AUTHORS.filter(x => (x !== o.author) && !usersApproved.includes(x) && !usersRejected.includes(x))
          eyes.push(`\n- ${o.link} ${gitNamesToSlackNames(usersNeeded)}`)
        }
      })

      // res.send(`*Approved: *${approved}\n*Eyes Needed: * ${eyes}`)
      robot.adapter.client.web.chat.postMessage(channelId, `*Approved: *${approved}\n*Eyes Needed: * ${eyes}`, {as_user: true})
        .then((post) => {
          robot.adapter.client.web.reactions.add('recycle', {channel: channelId, timestamp: post.ts})
        })
  })

  robot.listen(recycleReactionMatcher, (res) => {
    const STATUSES = {
      APPROVED: 'APPROVED',
      PENDING: 'PENDING'
    }
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
          await c.buildFromString(message.text)
          // c.spy()
          // console.log(c.toString())
          robot.adapter.client.web.chat.update(ts, channelId, c.toString())
        }
      })
    }
  })
}