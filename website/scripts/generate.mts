// Writes the docs generated from the doc comments in src/: the README's props
// sections (between its api:props and api:background-props markers), and the
// website's pages: the README
// as the main page and each docs/*.md as a page of its own. Checks that links to
// the README's headings still exist. With --check, fails if the README is out of
// date instead of writing it.
import {
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { posix } from 'node:path'
import { slug } from 'github-slugger'
import { Application, normalizePath, type JSONOutput as J } from 'typedoc'

const root = new URL('../../', import.meta.url).pathname
const app = await Application.bootstrap({
    entryPoints: [`${root}src/index.tsx`],
    tsconfig: `${root}tsconfig.build.json`,
    blockTags: ['@default', '@example', '@platform', '@see', '@privateRemarks'],
    // Internal notes: in the source only.
    excludeTags: ['@privateRemarks'],
    logLevel: 'Error',
})
const project = await app.convert()
if (!project) process.exit(1)
const json = app.serializer.projectToObject(project, normalizePath(root))
const byName = new Map(json.children!.map((c) => [c.name, c]))

const PLATFORMS: Record<string, string> = {
    ios: 'iOS',
    android: 'Android',
    web: 'Web',
}

function typeToString(t: J.SomeType | undefined): string {
    if (!t) return 'unknown'
    switch (t.type) {
        case 'intrinsic':
            return t.name
        case 'literal':
            return typeof t.value === 'string'
                ? `'${t.value}'`
                : String(t.value)
        case 'reference':
            return (
                t.name +
                (t.typeArguments
                    ? `<${t.typeArguments.map(typeToString).join(', ')}>`
                    : '')
            )
        case 'array':
            return `${typeToString(t.elementType)}[]`
        case 'union':
            return t.types.map(typeToString).join(' | ')
        case 'reflection': {
            const sig = t.declaration.signatures?.[0]
            if (sig) return signatureToString(sig)
            const props = (t.declaration.children ?? []).map(
                (c) =>
                    `${c.name}${c.flags.isOptional ? '?' : ''}: ${typeToString(c.type)}`,
            )
            for (const i of t.declaration.indexSignatures ?? [])
                props.push(
                    `[${i.parameters![0].name}: ${typeToString(i.parameters![0].type)}]: ${typeToString(i.type)}`,
                )
            return `{ ${props.join('; ')} }`
        }
        default:
            return 'unknown'
    }
}

function signatureToString(sig: J.SignatureReflection) {
    const params = (sig.parameters ?? []).map(
        (p) =>
            `${p.name}${p.flags.isOptional ? '?' : ''}: ${typeToString(p.type)}`,
    )
    return `(${params.join(', ')}) => ${typeToString(sig.type)}`
}

// A comment's text as markdown, without the comment's line breaks within
// paragraphs and list items.
function partsToMarkdown(parts: J.CommentDisplayPart[] | undefined) {
    return (parts ?? [])
        .map((p) => {
            if (p.kind === 'code') return p.text
            if (p.kind === 'inline-tag') return `\`${p.text}\``
            return p.text.replace(
                /(?<!\n)\n(?!\n|\s*(?:[-*] |\d+\. |\||#))\s*/g,
                ' ',
            )
        })
        .join('')
        .trim()
}

const tags = (r: J.Reflection, tag: string) =>
    r.comment?.blockTags?.filter((t) => t.tag === tag) ?? []

interface Member {
    name: string
    optional: boolean
    type: string
    platforms: string[]
    default?: string
    body: string
}

// An interface's or type's own members, with their docs, in source order.
function members(name: string, prefix = ''): Member[] {
    const node = byName.get(name)
    const children =
        node?.children ??
        (node?.type?.type === 'reflection'
            ? node.type.declaration.children
            : undefined) ??
        []
    return (
        children
            // FastImage's own, not those it takes from React Native's View.
            .filter(
                (c) =>
                    !c.inheritedFrom &&
                    (c.comment || c.signatures?.[0]?.comment),
            )
            .sort(
                (a, b) =>
                    (a.sources?.[0]?.line ?? 0) - (b.sources?.[0]?.line ?? 0),
            )
            .map((c) => {
                const sig = c.signatures?.[0]
                const r = sig?.comment ? sig : c
                const type = sig ? signatureToString(sig) : typeToString(c.type)
                const optional = c.flags.isOptional ?? false
                const def = tags(r, '@default')[0]
                return {
                    name: prefix + c.name,
                    optional,
                    type,
                    platforms: tags(r, '@platform').map((t) => {
                        const p = partsToMarkdown(t.content)
                        return PLATFORMS[p] ?? p
                    }),
                    // TypeDoc wraps a plain @default value in a code block.
                    default:
                        def &&
                        partsToMarkdown(def.content).replace(
                            /^```\w*\n([\s\S]*)\n```$/,
                            '$1',
                        ),
                    body: [
                        partsToMarkdown(r.comment?.summary),
                        ...tags(r, '@example').map((t) =>
                            partsToMarkdown(t.content),
                        ),
                    ]
                        .filter(Boolean)
                        .join('\n\n'),
                }
            })
    )
}

// FastImage's props, with the source's options (source.uri etc.) after source,
// a heading level below it. Both under Components → FastImage in the README.
const props = members('FastImageProps').flatMap((m) =>
    m.name === 'source' ? [m, ...members('Source', 'source.')] : [m],
)

// A heading per prop, the same in the README and on the website so links work
// on both (and don't change with the prop's type), and its platforms, type and
// default under it: in the README as markdown, on the website styled.
const code = (s: string) => `\`${s}\``
const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
function propsSection(site: boolean) {
    return props
        .map((m) => {
            const meta = site
                ? [
                      ...m.platforms.map(
                          (p) => `<span class="api-badge">${p} only</span>`,
                      ),
                      m.optional ? 'Optional' : 'Required',
                      `Type: <code>${html(m.type)}</code>`,
                      m.default && `Default: <code>${html(m.default)}</code>`,
                  ]
                : [
                      `**Type:** ${code(m.type)}`,
                      m.default && `**Default:** ${code(m.default)}`,
                      m.platforms.length && `${m.platforms.join(', ')} only`,
                  ]
            const line = meta.filter(Boolean).join(' · ')
            return [
                `${m.name.includes('.') ? '#####' : '####'} ${code(m.name)}`,
                site ? `<div class="api-meta">${line}</div>` : line,
                m.body,
            ].join('\n\n')
        })
        .join('\n\n---\n\n')
}

// FastImageBackground's own props, as a list: the rest are FastImage's.
const backgroundProps = members('FastImageBackgroundProps')
    .map((m) => `- ${code(m.name)} (${code(m.type)}): ${m.body}`)
    .join('\n')

const readme = readFileSync(`${root}README.md`, 'utf8')
// The README with each marked section replaced.
const withGenerated = (sections: Record<string, string>) =>
    Object.entries(sections).reduce((markdown, [name, generated]) => {
        const start = `<!-- api:${name} start (generated from src/ by website/scripts/generate.mts) -->`
        const end = `<!-- api:${name} end -->`
        const [before, rest] = markdown.split(start)
        if (rest === undefined) throw new Error(`README.md has no ${start}`)
        return `${before}${start}\n\n${generated}\n\n${rest.slice(rest.indexOf(end))}`
    }, readme)
const withProps = (site: boolean) =>
    withGenerated({
        props: propsSection(site),
        'background-props': backgroundProps,
    })
const updatedReadme = withProps(false)
if (process.argv.includes('--check')) {
    if (updatedReadme !== readme) {
        console.error(
            'README.md is out of date: run `bun run generate` in website/',
        )
        process.exit(1)
    }
} else writeFileSync(`${root}README.md`, updatedReadme)

const docs = readdirSync(`${root}docs`)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`)
const sources = new Map([
    ['README.md', updatedReadme],
    ...docs.map((f) => [f, readFileSync(`${root}${f}`, 'utf8')] as const),
])

// Each page's anchors, as GitHub (and the website) make them.
const anchors = new Map(
    [...sources].map(([file, markdown]) => [
        file,
        new Set(
            [
                ...markdown
                    .replace(/```[\s\S]*?```/g, '')
                    .matchAll(/^#{1,6} (.*)$/gm),
            ].map((h) => slug(h[1].replace(/`/g, ''))),
        ),
    ]),
)

// The website's pages: the README, guides, and the docs for contributors.
const CONTRIBUTING = ['docs/development.md']
const pageOf = (file: string) =>
    file === 'README.md'
        ? ''
        : sources.has(file)
          ? `${CONTRIBUTING.includes(file) ? 'contributing' : 'guides'}/${posix.basename(file, '.md')}`
          : undefined

// Links between the README and docs/ go to their pages on the website (and are
// checked), links to other files in the repo to GitHub. `file` is the page's
// path in the repo.
function rewriteLinks(markdown: string, file: string) {
    // Relative, so they work under the website's base path.
    const toRoot =
        '../'.repeat(pageOf(file)!.split('/').filter(Boolean).length) || './'
    return markdown.replace(
        /(\]\(|^\[[^\]]+\]: )([^)\s#]*)(#[^)\s]*)?/gm,
        (all, start, target, anchor = '') => {
            if (/^[a-z]+:/.test(target)) return all
            const resolved = target
                ? posix.normalize(posix.join(posix.dirname(file), target))
                : file
            if (
                anchor &&
                anchors.has(resolved) &&
                !anchors.get(resolved)!.has(anchor.slice(1))
            )
                console.warn(`${file}: no heading in ${resolved} for ${anchor}`)
            if (!target) return all
            const page = pageOf(resolved)
            if (page === undefined)
                return `${start}https://github.com/DylanVann/react-native-fast-image/blob/main/${resolved}${anchor}`
            return `${start}${toRoot}${page ? `${page}/` : ''}${anchor}`
        },
    )
}

const out = `${root}website/src/content/docs`
rmSync(out, { recursive: true, force: true })
const write = (page: string, content: string) => {
    const path = `${out}/${page || 'index'}.md`
    mkdirSync(posix.dirname(path), { recursive: true })
    writeFileSync(path, content)
}
const frontmatter = (fields: Record<string, unknown>) =>
    `---\n${Object.entries(fields)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join('\n')}\n---\n\n`

// The main page: the README, with the props as the website shows them, and
// without its title (the page's title is shown instead).
const { description } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))
const readmePage = withProps(true).replace(/^# .*\n+/m, '')
write(
    '',
    frontmatter({
        title: 'React Native Fast Image',
        description,
        // The site's name alone, not "React Native Fast Image | React Native
        // Fast Image".
        head: [{ tag: 'title', content: 'React Native Fast Image' }],
    }) +
        rewriteLinks(readmePage, 'README.md'),
)

// A page per doc, titled with its first heading.
for (const file of docs) {
    const markdown = sources.get(file)!
    const title = markdown.match(/^# (.*)$/m)?.[1] ?? file
    write(
        pageOf(file)!,
        frontmatter({ title }) +
            rewriteLinks(markdown.replace(/^# .*\n+/m, ''), file),
    )
}
