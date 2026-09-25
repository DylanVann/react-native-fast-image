// Carried over from dv-scripts' semantic-release config so releases behave the
// same. CI publishes with npm trusted publishing (OIDC) from the `release`
// environment, which a maintainer approves (see .github/workflows/ci.yml).
module.exports = {
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
        '@semantic-release/release-notes-generator',
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
