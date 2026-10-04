import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// The README as the main page, and a page per doc in docs/ (the benchmarks,
// guides, and development), all generated into src/content/docs by
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
            // Geist and Geist Mono, self-hosted (Fontsource), before the site's
            // styles, which set them as Starlight's fonts.
            customCss: [
                '@fontsource-variable/geist',
                '@fontsource-variable/geist-mono',
                './src/styles/api.css',
                './src/styles/capsize.css',
            ],
            components: {
                Header: './src/components/Header.astro',
                MobileMenuFooter: './src/components/MobileMenuFooter.astro',
                MobileMenuToggle: './src/components/MobileMenuToggle.astro',
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
                { label: 'Benchmarks', link: '/benchmarks/' },
                {
                    label: 'Guides',
                    items: [{ autogenerate: { directory: 'guides' } }],
                },
                { label: 'Development', link: '/development/' },
            ],
        }),
    ],
})
