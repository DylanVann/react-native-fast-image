import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// The README as the main page, and a page per doc in docs/ (guides, and the
// docs for contributors), all generated into src/content/docs by
// scripts/generate.mts.
export default defineConfig({
    site: 'https://react-native-fast-image.dylanvann.workers.dev',
    integrations: [
        starlight({
            title: 'React Native Fast Image',
            social: [
                {
                    icon: 'github',
                    label: 'GitHub',
                    href: 'https://github.com/DylanVann/react-native-fast-image',
                },
            ],
            customCss: ['./src/styles/api.css'],
            components: {
                Header: './src/components/Header.astro',
                ThemeSelect: './src/components/ThemeSelect.astro',
                TwoColumnContent: './src/components/TwoColumnContent.astro',
                PageSidebar: './src/components/PageSidebar.astro',
            },
            // Down to the source's options (source.uri etc.): Components →
            // FastImage → source → source.uri.
            tableOfContents: { maxHeadingLevel: 5 },
            // No "Previous"/"Next" links at the bottom of pages: the guides
            // aren't read in order.
            pagination: false,
            sidebar: [
                { label: 'Usage', link: '/' },
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
