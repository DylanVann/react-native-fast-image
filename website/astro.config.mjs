import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// The README as the main page, and a page per doc in docs/ (guides, and the
// docs for contributors), all generated into src/content/docs by
// scripts/generate.mts.
export default defineConfig({
    site: 'https://dylanvann.github.io',
    base: '/react-native-fast-image',
    integrations: [
        starlight({
            title: 'FastImage',
            social: [
                {
                    icon: 'github',
                    label: 'GitHub',
                    href: 'https://github.com/DylanVann/react-native-fast-image',
                },
            ],
            customCss: ['./src/styles/api.css'],
            sidebar: [
                { label: 'README', link: '/' },
                {
                    label: 'Guides',
                    items: [{ autogenerate: { directory: 'guides' } }],
                },
                {
                    label: 'Contributing',
                    items: [{ autogenerate: { directory: 'contributing' } }],
                },
            ],
        }),
    ],
})
