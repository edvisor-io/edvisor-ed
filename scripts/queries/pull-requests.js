const REPOSITORIES_FETCHED = 15

module.exports = {
  isPrStillOpen: (url) => `
    {
      resource(url:"${url}"){
        ... on PullRequest {
          closed
        }
      }
    }
  `,

  prInfoByurl: (url) => `
    {
      resource(url:"${url}"){
        ... on PullRequest {
          number
          baseRefName
          headRefName
          isDraft
          repository {
            name
          }
          author {
            login
          }
          closed
          labels(first:10){
            edges {
              node {
                name
              }
            }
          }
          reviews(last:50, states: [APPROVED, CHANGES_REQUESTED, DISMISSED]) {
            nodes {
              state
              submittedAt
              author {
                login
              }
            }
          }
          commits(last:1) {
            edges {
              node {
                commit{
                  committedDate
                }
              }
            }
          }
        }
      }
    }
  `,

  edvisorRepositories: `
  {
    organization(login:"edvisor-io") {
      id
      repositories(
        orderBy:{field:PUSHED_AT, direction:DESC}
        first:${REPOSITORIES_FETCHED}){
        edges {
          node {
            name
            id
            url
            pullRequests(
              first:100
              states:OPEN
              orderBy: {
                field:CREATED_AT
                direction:DESC
              }) {
                edges {
                  node {
                    permalink
                }
              }
            }
          }
        }
      }
    }

  }
  `
}
