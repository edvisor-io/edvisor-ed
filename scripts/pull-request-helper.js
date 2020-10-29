const graphql = require('graphql-request')
const pullQueries = require('./queries/pull-requests')
const Bluebird = require('bluebird')
const dotenv = require('dotenv')
dotenv.load()

const TASK_PREFIXED_BRANCH_REGEX = /^([a-z]+)[-_]?(\d+)($|_.*$)/ig

const userMap = {
  'variousauthors': 'andre', //Andre
  'stringbeans': 'john', //John
  'austin-sa-wang': 'austin', //Austin
  'yoranl': 'yoran', //Yoran
  'gabriel-schmoeller': 'Gabriel', //Gabriel
  'chernandezbl': 'Cesar', //Cesar
  'dan22-book': 'Daniel Delgadillo', //Daniel
  'IgorHorta': 'Igor Correa', //Igor
  'Mizzade': 'Mirko Lauff', // Mirko
  'GV79': 'Giavinh Lam', //Giavinh
  'oscartu2': 'Oscar Tu', //Oscar
  'hotaru355': 'kenta', //Kenta
  'mila-mamat': 'Mila mamat' //Mila
}

const LABELS = {
  NOT_READY: 'WIP',
  SO_OLD_LABEL: 'SO OLD',
}

const URL = 'https://api.github.com/graphql'

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

  const prefixTaskCode = pullRequest.headRefName.match(TASK_PREFIXED_BRANCH_REGEX)
    ? pullRequest.headRefName.replaceAll(TASK_PREFIXED_BRANCH_REGEX, '$1-$2')
    : ''

  return {
    link: url,
    baseRefName: pullRequest.baseRefName,
    headRefName: pullRequest.headRefName,
    prefixTaskCode,
    isDraft: pullRequest.isDraft,
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

const client = new graphql.GraphQLClient(URL, {
  headers: {
    'Content-Type': 'application/json',
    Authorization: `bearer ${process.env.HUBOT_GITHUB_TOKEN}`
  }
})

class edvisorPuller {
  constructor(showAll) {
    this.pullRequests = []
    this.showAll = showAll
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
    const isEmpty = (anyWithLength) => anyWithLength.length === 0
    const isNotEmpty = (anyWithLength) => !isEmpty(anyWithLength)
    const isRejected = (pullRequest) => !isEmpty(pullRequest.changeRequests)
    const isApprovalNeeded = (pullRequest) => !isRejected(pullRequest) && pullRequest.approvals < 2
    const isApproved = (pullRequest) => !isRejected(pullRequest) && pullRequest.approvals >= 2

    const isPrReadyToReview = (pullRequest) => {
      return this.showAll
        || (!pullRequest.isDraft
          && !pullRequest.labels.includes(LABELS.NOT_READY)
          && !pullRequest.labels.includes(LABELS.SO_OLD_LABEL))
    }

    const groupByTaskCode = (pullRequestList) => {
      return pullRequestList.reduce(function (groups, pr) {
        if (groups[pr.prefixTaskCode] === undefined) {
          groups[pr.prefixTaskCode] = [];
        }
        groups[pr.prefixTaskCode].push(pr);

        return groups;
      }, {});
    }

    const gitToSlackName = (gitUserName) => {
      return `@${userMap[gitUserName]}`
    }

    const gitToSlackNamesList = (gitUserNames) => {
      return gitUserNames
        .map((gitName) => gitToSlackName(gitName))
        .join(', ')
    }

    const buildPrLink = (pullRequest) => {
      return `<${pullRequest.link}|${pullRequest.repo} #${pullRequest.prNumber} >`
    }

    const buildPrAdditionalInfoText = (pullRequest) => {
      let reviews = pullRequest.approvals
      let action = 'Approved'
      if (isRejected(pullRequest)) {
        reviews = pullRequest.changeRequests
        action = 'Requests'
      }
      const slackAuthors = gitToSlackNamesList(reviews.map((review) => review.author))
      return isNotEmpty(slackAuthors) ? ` (${action} by: ${slackAuthors})` : ''
    }

    const buildPrLine = (pullRequest) => {
      const prLink = buildPrLink(pullRequest)
      const additionalInfo = buildPrAdditionalInfoText(pullRequest)
      return `    • ${prLink} ${gitToSlackName(pullRequest.author)}${additionalInfo}`
    }

    const buildTaskCodeLine = (taskCode) => {
      taskCode = isEmpty(taskCode) ? 'Others' : taskCode
      return `• *${taskCode}:*`
    }

    const buildPrsTextList = (prsGroupedByTask) => {
      const lines = []
      const taskCodes = Object.keys(prsGroupedByTask).sort().reverse()
      taskCodes.forEach((taskCode) => {
        lines.push(buildTaskCodeLine(taskCode))
        prsGroupedByTask[taskCode]
          .sort((a, b) => {
            if (a.author < b.author) return -1
            else if (a.author > b.author) return 1
            return 0
          })
          .forEach((pullRequests) => {
          lines.push(buildPrLine(pullRequests))
        })
      })

      return lines.join('\n')
    }

    const prsReadyToReview = this.pullRequests.filter(isPrReadyToReview)

    const approved = groupByTaskCode(prsReadyToReview.filter(isApproved))
    const eyesNeeded = groupByTaskCode(prsReadyToReview.filter(isApprovalNeeded))
    const changeRequest = groupByTaskCode(prsReadyToReview.filter(isRejected))

    const attachments = []

    if (isNotEmpty(approved)) {
      attachments.push({
        color: 'good',
        text: `*Approved: * \n${buildPrsTextList(approved)}`
      })
    }

    if (isNotEmpty(eyesNeeded)) {
      attachments.push({
        color: 'warning',
        text: `*Eyes Needed: * \n${buildPrsTextList(eyesNeeded)}`
      })
    }

    if (isNotEmpty(changeRequest)) {
      attachments.push({
        color: 'danger',
        text: `*Change Requests: * \n${buildPrsTextList(changeRequest)}`
      })
    }

    return attachments
  }
}

module.exports.userMap = userMap
module.exports.edvisorPuller = edvisorPuller
module.exports.sendPullRequestsToChannel = async (robot, channelId, showAll) => {
  const PullRequests = new edvisorPuller(showAll)
  await PullRequests.buildFromNothing()

  return robot.adapter.client.web.chat.postMessage(channelId, `*Pull Requests: *`, {as_user: true, attachments: PullRequests.toString()})
    .then((post) => {
      robot.adapter.client.web.reactions.add('recycle', {channel: channelId, timestamp: post.ts})
    })
}
