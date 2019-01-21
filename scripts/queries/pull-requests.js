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
          reviews(first:20) {
            edges {
              node {
                state
                submittedAt
                author {
                  login
                }
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
              last:20
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