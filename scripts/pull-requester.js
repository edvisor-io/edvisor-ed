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

module.exports = (robot) => {
  robot.respond(/pull request status/i, async (res) => {
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

      res.send(`*Approved: *${approved}\n*Eyes Needed: * ${eyes}`)
  })
}