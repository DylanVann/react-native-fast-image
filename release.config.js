// Carried over from dv-scripts' semantic-release config so releases behave the
// same; publishing now uses npm trusted publishing (OIDC) instead of NPM_TOKEN.
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
                // eslint-disable-next-line no-template-curly-in-string
                message:
                    'release(version): Release ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
            },
        ],
        '@semantic-release/github',
    ],
}
