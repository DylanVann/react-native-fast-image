// Carried over from dv-scripts' semantic-release config so releases behave the
// same. CI publishes with npm trusted publishing (OIDC) from the `release`
// environment, which a maintainer approves (see .github/workflows/ci.yml).
import angular from 'conventional-changelog-angular'

const MAINTAINER = 'DylanVann'
const { writer } = angular()

// A commit's author and Co-authored-by trailers, each with the GitHub account
// whose email matches.
async function commitAuthors(hash, { owner, repository }) {
    const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { authorization: `bearer ${process.env.GITHUB_TOKEN}` },
        body: JSON.stringify({
            query: `{ repository(owner: "${owner}", name: "${repository}") {
                object(expression: "${hash}") { ... on Commit {
                    authors(first: 10) { nodes { name user { login } } }
                } }
            } }`,
        }),
    })
    const { data, errors } = await response.json()
    if (errors) {
        throw new Error(
            `Could not get the authors of ${hash}: ${errors[0].message}`,
        )
    }
    return data.repository.object.authors.nodes
}

// The angular preset's release notes, with ", thanks @login" on each entry for
// the commit's authors and co-authors (a reworked community PR names its
// author in a Co-authored-by trailer), except the maintainer. Someone without
// a GitHub account is credited by name. Without GITHUB_TOKEN (a local dry
// run) there are no credits.
const writerOpts = {
    async transform(commit, context) {
        const patch = await writer.transform(commit, context)
        if (!patch || !process.env.GITHUB_TOKEN) {
            return patch
        }
        const credits = (await commitAuthors(commit.hash, context))
            .filter(({ user }) => user?.login !== MAINTAINER)
            .map(({ name, user }) =>
                user ? `[@${user.login}](${context.host}/${user.login})` : name,
            )
        return credits.length
            ? { ...patch, credits: credits.join(', ') }
            : patch
    },
    // The credit follows the references, on the same line.
    commitPartial: writer.commitPartial.replace(
        /\n\n$/,
        '{{~#if credits}}, thanks {{{credits}}}{{/if}}\n',
    ),
}

export default {
    branches: ['main'],
    plugins: [
        [
            '@semantic-release/commit-analyzer',
            {
                releaseRules: [
                    { type: 'build', release: 'patch' },
                    { type: 'ci', release: 'patch' },
                    { type: 'chore', release: 'patch' },
                    { type: 'docs', release: 'patch' },
                    { type: 'refactor', release: 'patch' },
                    { type: 'style', release: 'patch' },
                    { type: 'test', release: 'patch' },
                ],
            },
        ],
        ['@semantic-release/release-notes-generator', { writerOpts }],
        '@semantic-release/changelog',
        '@semantic-release/npm',
        [
            '@semantic-release/git',
            {
                assets: ['package.json', 'CHANGELOG.md'],
                // This is not a JS template string, it is processed by semantic-release.
                message:
                    'release(version): Release ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
            },
        ],
        '@semantic-release/github',
    ],
}
