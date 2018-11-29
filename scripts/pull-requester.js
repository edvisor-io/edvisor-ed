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

  // console.log('S: ', JSON.stringify(output, null, 2))

  return output
}

const client = new graphql.GraphQLClient(URL, {
  headers: {
    'Content-Type': 'application/json',
    Authorization: `bearer ${process.env.HUBOT_GITHUB_TOKEN}`
  }
})


module.exports = (robot) => {
  robot.hear(/database/i, (res) => {
    client.request(pullQueries.database).then(data => {

      const pullRequests = data.repository.pullRequests.edges

      const webClientOutput = parseGithubResponse(pullRequests)

      console.log('pullRequests: ', pullRequests)

      const approved = []
      const eyes = []

      webClientOutput.forEach((o) => {
        if(o.state === 'ACCEPTED') {
          approved.push(`\n- ${o.link} ${o.author} `)
        }
        if(o.state === 'NEEDS_EYES') {
          eyes.push(`\n- ${o.link} ${BEERPOD_AUTHORS.filter(x => x !== o.author)}`)
        }
      })


      res.send(`*Approved: *${approved}\n*Eyes: * ${eyes}`)
    })
  })

  robot.hear(/web/i, (res) => {
    client.request(pullQueries.webClient).then(data => {

      const pullRequests = data.repository.pullRequests.edges

      const webClientOutput = parseGithubResponse(pullRequests)


      const approved = []
      const eyes = []

      webClientOutput.forEach((o) => {
        if(o.state === 'ACCEPTED') {
          approved.push(`\n- ${o.link} ${o.author} `)
        }
        if(o.state === 'NEEDS_EYES') {
          eyes.push(`\n- ${o.link} ${BEERPOD_AUTHORS.filter(x => x !== o.author)}`)
        }
      })


      res.send(`*Approved: *${approved}\n*Eyes: * ${eyes}`)
    })
  })

  robot.hear(/v2/i, (res) => {
    client.request(pullQueries.apiServerV2).then(data => {

      const pullRequests = data.repository.pullRequests.edges

      const webClientOutput = parseGithubResponse(pullRequests)

      const approved = []
      const eyes = []

      webClientOutput.forEach((o) => {
        if(o.state === 'ACCEPTED') {
          approved.push(`\n- ${o.link} ${o.author} `)
        }
        if(o.state === 'NEEDS_EYES') {
          eyes.push(`\n- ${o.link} ${BEERPOD_AUTHORS.filter(x => x !== o.author)}`)
        }
      })


      res.send(`*Approved: *${approved}\n*Eyes: * ${eyes}`)
    })
  })

  robot.hear(/api-server/i, (res) => {
    client.request(pullQueries.apiServer).then(data => {

      const pullRequests = data.repository.pullRequests.edges

      const webClientOutput = parseGithubResponse(pullRequests)

      const approved = []
      const eyes = []

      webClientOutput.forEach((o) => {
        if(o.state === 'ACCEPTED') {
          approved.push(`\n- ${o.link} ${o.author}`)
        }
        if(o.state === 'NEEDS_EYES') {
          eyes.push(`\n- ${o.link} ${BEERPOD_AUTHORS.filter(x => x !== o.author)}`)
        }
      })


      res.send(`*Approved: *${approved}\n*Eyes: * ${eyes}`)
    })
  })


  robot.respond(/all/i, async (res) => {
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
          approved.push(`\n- ${o.link} ${o.author} `)
        }
        if(o.state === 'NEEDS_EYES') {
          eyes.push(`\n- ${o.link} ${BEERPOD_AUTHORS.filter(x => x !== o.author)}`)
        }
      })


      res.send(`*Approved: *${approved}\n*Eyes: * ${eyes}`)
  })
}