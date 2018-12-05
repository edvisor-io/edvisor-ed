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
  const isEd = (i.item_user.real_name.toLowerCase() == 'ed')
  return (isRecycle && isEd)
}

const isPRClosed = async (url) => {
  const result = await client.request(pullQueries.isPrStillOpen(url))
  return true//(result.resource && result.resource.closed)
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
      }).then((i) => {
        if (i && i.messages[0]) {
          const message = i.messages[0]
          const lines = message.text.split('\n')
          let status = null
          const approved = []
          const eyes = []
          // lines.forEach((line) => {
          Bluebird.each(lines, async (line) => {
            // console.log('LINE: ', line)
            const urlMatches = line.match(/(https?:\/\/[^\s]+(\d))/)
            if (urlMatches) {
              if (status === STATUSES.APPROVED) {
                // console.log(`Is ${urlMatches[0]} still open?`)
                const isClosed = await isPRClosed(urlMatches[0])
                if (isClosed && (line[0] != '~')) {
                  approved.push(`\n~${line}~`)
                } else {
                  approved.push(`\n${line}`)
                }
              }
              if (status === STATUSES.PENDING) {
                // console.log(`Has anyone new reviewd ${urlMatches[0]}?`)
                eyes.push(`\n${line}`)
              }
            } else {
              if (line.includes('Approved')) {
                status = STATUSES.APPROVED
              } else if (line.includes('Eyes Needed')) {
                status = STATUSES.PENDING
              }
            }
          })
          .then(() => {
            robot.adapter.client.web.chat.update(ts, channelId, `*Approved: *${approved}\n*Eyes Needed: * ${eyes}`)
          })
        }
      })
    }

    //
  })
}