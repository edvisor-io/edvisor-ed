const returnObject = `
  edges {
    cursor
    node {
      id
      title
      permalink
      author {login}
      reviews(first:10){
        nodes{
          author{login}
          state
          createdAt
        }
      }
    }
  }
`

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
          author {
            login
          }
          closed
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

  webClient: `
    {
      repository(owner: "edvisor-io",name:"web-client") {
        pullRequests(
          last:20
          states:OPEN
          orderBy: {
            field:CREATED_AT
            direction:DESC
          }
          before:"Y3Vyc29yOnYyOpK5MjAxOC0xMS0xOVQxMjozNzoxOS0wODowMM4N1aGn"
        ) {
          ${returnObject}
        }
      }
    }
  `,

  database: `
    query database{
      repository(owner: "edvisor-io",name:"database") {
        pullRequests(
          last:20
          states:OPEN
          orderBy: {
            field:CREATED_AT
            direction:DESC
          }
          before:"Y3Vyc29yOnYyOpK5MjAxOC0xMC0xMlQxMjozODowOC0wNzowMM4NRBeS"
        ) {
          ${returnObject}
        }
      }
    }
  `,

  apiServerV2: `
    query apiServerV2{
      repository(owner: "edvisor-io",name:"api-server-v2") {
        pullRequests(
          last:20
          states:OPEN
          orderBy: {
            field:CREATED_AT
            direction:DESC
          }
          before:"Y3Vyc29yOnYyOpK5MjAxOC0xMS0xNlQxMToxNjoxMy0wODowMM4NzmHL"
        ) {
          ${returnObject}
        }
      }
    }
  `,

  apiServer: `
    query apiServer{
      repository(owner: "edvisor-io",name:"api-server") {
        pullRequests(
          last:20
          states:OPEN
          orderBy: {
            field:CREATED_AT
            direction:DESC
          }
          before:"Y3Vyc29yOnYyOpK5MjAxOC0xMC0xMlQxODowNjo0MC0wNzowMM4NROFD"
        ) {
          ${returnObject}
        }
      }
    }
  `,

  reactWebClient: `
    query reactWebClient{
      repository(owner: "edvisor-io",name:"react-web-client") {
        pullRequests(
          last:20
          states:OPEN
          orderBy: {
            field:CREATED_AT
            direction:DESC
          }
        ) {
          ${returnObject}
        }
      }
    }
  `,

  b2c: `
    query b2cWidget{
      repository(owner: "edvisor-io",name:"b2c-widget") {
        pullRequests(
          last:20
          states:OPEN
          orderBy: {
            field:CREATED_AT
            direction:DESC
          }
        ) {
          ${returnObject}
        }
      }
    }
  `
}