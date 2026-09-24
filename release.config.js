// Carried over from dv-scripts' semantic-release config so releases behave the
// same, except semantic-release no longer publishes to npm: CI stages the
// release with `npm stage publish` (trusted publishing, OIDC) and a maintainer
// approves it with 2FA on npmjs.com.
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
        // Only bumps the package.json version; see the workflow for staging.
        ['@semantic-release/npm', { npmPublish: false }],
        [
            '@semantic-release/git',
            {
                assets: ['package.json', 'CHANGELOG.md'],
                // This is not a JS template string, it is processed by semantic-release.
                // eslint-disable-next-line no-template-curly-in-string
                message:
                    'release(version): Release ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
            },
        ],
        '@semantic-release/github',
    ],
}
