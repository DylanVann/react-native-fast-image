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
import GithubSlugger, { slug } from 'github-slugger'
import { Application, normalizePath, type JSONOutput as J } from 'typedoc'

const root = new URL('../../', import.meta.url).pathname
const app = await Application.bootstrap({
    entryPoints: [`${root}src/index.tsx`],
    tsconfig: `${root}tsconfig.build.json`,
    blockTags: ['@default', '@example', '@platform', '@see'],
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

// By where they're declared: line, then column (an object type's fields can
// share a line).
const bySource = (a: J.Reflection, b: J.Reflection) =>
    (a.sources?.[0]?.line ?? 0) - (b.sources?.[0]?.line ?? 0) ||
    (a.sources?.[0]?.character ?? 0) - (b.sources?.[0]?.character ?? 0)

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
            // In source order (TypeDoc sorts them by name).
            const props = (t.declaration.children ?? [])
                .toSorted(bySource)
                .map(
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

// An interface's or type's own members, with their docs, in source order: only
// those with docs, unless all.
function members(name: string, prefix = '', all = false): Member[] {
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
                    (all || c.comment || c.signatures?.[0]?.comment),
            )
            .sort(bySource)
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

const code = (s: string) => `\`${s}\``
const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// On the website, a type as code, highlighted like the code blocks (see
// api.css): value types, literals, numbers, strings and type names.
const PRIMITIVES = new Set(['any', 'boolean', 'number', 'string', 'void'])
const LITERALS = new Set(['true', 'false', 'null', 'undefined'])
function typeCode(type: string) {
    const highlighted = type.replace(
        /'[^']*'|\b\d[\d.]*\b|\b[A-Za-z_]\w*\b|[^'\w]+/g,
        (token) => {
            const kind = token.startsWith("'")
                ? 's'
                : /^\d/.test(token)
                  ? 'n'
                  : PRIMITIVES.has(token)
                    ? 'k'
                    : LITERALS.has(token)
                      ? 'l'
                      : /^[A-Z]/.test(token)
                        ? 't'
                        : undefined
            return kind
                ? `<span class="tk-${kind}">${html(token)}</span>`
                : html(token)
        },
    )
    return `<code class="api-type">${highlighted}</code>`
}
// A heading per prop, the same in the README and on the website so links work
// on both (and don't change with the prop's type), and its platforms, type and
// default under it: in the README as markdown, on the website styled.
function propsSection(ms: Member[], site: boolean) {
    return ms
        .map((m) => {
            const meta = site
                ? [
                      ...m.platforms.map(
                          (p) => `<span class="api-badge">${p} only</span>`,
                      ),
                      m.optional ? 'Optional' : 'Required',
                      `Type: ${typeCode(m.type)}`,
                      m.default && `Default: ${typeCode(m.default)}`,
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

// Members as a list, each with its type, default and docs (indented to stay in
// its item when they're several paragraphs): in the README as markdown, on the
// website highlighted.
const fieldList = (ms: Member[], site: boolean) =>
    ms
        .map((m) => {
            const typed = site ? typeCode : code
            const type = [
                typed(m.type),
                m.default && `default ${typed(m.default)}`,
            ].filter(Boolean)
            const body = m.body.replace(/\n(?=.)/g, '\n    ')
            return `- ${code(m.name + (m.optional ? '?' : ''))} (${type.join(', ')})${body ? `: ${body}` : ''}`
        })
        .join('\n')

// FastImageBackground's own props: the rest are FastImage's.
const backgroundProps = members('FastImageBackgroundProps')

// FastImage's methods' signatures, by name.
const methods = new Map(
    (byName.get('FastImageStaticProperties')?.children ?? []).flatMap((c) => {
        const sig =
            c.type?.type === 'reflection'
                ? c.type.declaration.signatures?.[0]
                : undefined
        return sig ? [[c.name, sig] as const] : []
    }),
)

// Each method's heading (its name and parameters' names) and, under it, its
// parameters' and result's types, like a prop's type: in the README as
// markdown, on the website styled. The rest of a method's docs are written in
// the README.
function withMethods(markdown: string, site: boolean) {
    return markdown.replace(
        /^### `(\w+)\(.*\)`\n\n(?:(?:\*\*Parameters:\*\*|\*\*Returns:\*\*|<div class="api-meta">Returns:|<div class="api-meta">Parameters:).*\n\n)?/gm,
        (all, name: string) => {
            const sig = methods.get(name)
            if (!sig) return all
            const params = sig.parameters ?? []
            const typed = params.map(
                (p) =>
                    `${p.name}${p.flags.isOptional ? '?' : ''}: ${typeToString(p.type)}`,
            )
            const returns = typeToString(sig.type)
            const meta = site
                ? [
                      typed.length &&
                          `Parameters: ${typed.map(typeCode).join(', ')}`,
                      `Returns: ${typeCode(returns)}`,
                  ]
                : [
                      typed.length &&
                          `**Parameters:** ${typed.map(code).join(', ')}`,
                      `**Returns:** ${code(returns)}`,
                  ]
            const line = meta.filter(Boolean).join(' · ')
            return [
                `### ${code(`${name}(${params.map((p) => p.name).join(', ')})`)}`,
                site ? `<div class="api-meta">${line}</div>` : line,
                '',
            ].join('\n\n')
        },
    )
}

// The exported types the props and methods use, and the types those use, for
// the Types section. Except those documented elsewhere: Source's options are
// the source prop's, and ImageStyle is React Native's style props.
const DOCUMENTED_ELSEWHERE = new Set(['Source', 'ImageStyle'])
const typeNames = new Set<string>()
function collectTypes(t: J.SomeType | undefined) {
    if (!t) return
    switch (t.type) {
        case 'reference': {
            t.typeArguments?.forEach(collectTypes)
            const node = byName.get(t.name)
            if (
                !node ||
                DOCUMENTED_ELSEWHERE.has(t.name) ||
                typeNames.has(t.name)
            )
                return
            typeNames.add(t.name)
            node.children?.forEach((c) => collectTypes(c.type))
            return collectTypes(node.type)
        }
        case 'union':
            return t.types.forEach(collectTypes)
        case 'array':
            return collectTypes(t.elementType)
        case 'reflection':
            for (const sig of t.declaration.signatures ?? []) {
                sig.parameters?.forEach((p) => collectTypes(p.type))
                collectTypes(sig.type)
            }
            t.declaration.children?.forEach((c) => collectTypes(c.type))
    }
}
for (const name of ['FastImageProps', 'Source', 'FastImageBackgroundProps'])
    byName
        .get(name)
        ?.children?.filter((c) => !c.inheritedFrom)
        .forEach((c) => {
            collectTypes(c.type)
            // Props declared as methods, e.g. onLoad(event: OnLoadEvent).
            for (const sig of c.signatures ?? [])
                sig.parameters?.forEach((p) => collectTypes(p.type))
        })
for (const sig of methods.values()) {
    sig.parameters?.forEach((p) => collectTypes(p.type))
    collectTypes(sig.type)
}

// A heading per type, in alphabetical order, and under it its docs and either
// its fields (an object type) or its type (e.g. a union of values).
function typesSection(site: boolean) {
    return [...typeNames]
        .sort()
        .map((name) => {
            const node = byName.get(name)!
            const fields = members(name, '', true)
            const type = typeToString(node.type)
            const meta =
                !fields.length &&
                (site
                    ? `<div class="api-meta">Type: ${typeCode(type)}</div>`
                    : `**Type:** ${code(type)}`)
            return [
                `### ${code(name)}`,
                meta,
                partsToMarkdown(node.comment?.summary),
                fields.length && fieldList(fields, site),
            ]
                .filter(Boolean)
                .join('\n\n')
        })
        .join('\n\n---\n\n')
}

// On the website, the type names in the generated types (props', methods',
// types' and fields') link to their docs: in the Types section, or Source to
// the source prop. The anchors are as GitHub and Astro make them, numbered when
// headings repeat.
function withTypeLinks(markdown: string) {
    const slugger = new GithubSlugger()
    const anchors = new Map<string, string>()
    let inTypes = false
    for (const [, level, text] of markdown
        .replace(/```[\s\S]*?```/g, '')
        .matchAll(/^(#{1,6}) (.*)$/gm)) {
        const plain = text.replace(/`/g, '')
        const anchor = slugger.slug(plain)
        if (level === '##') inTypes = plain === 'Types'
        else if (inTypes && typeNames.has(plain)) anchors.set(plain, anchor)
        else if (plain === 'source' && !anchors.has('Source'))
            anchors.set('Source', anchor)
    }
    const names = new RegExp(`\\b(${[...anchors.keys()].join('|')})\\b`, 'g')
    return markdown.replace(/<code class="api-type">.*?<\/code>/g, (type) =>
        type.replace(names, (n) => `<a href="#${anchors.get(n)}">${n}</a>`),
    )
}

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
// The README with its generated API docs, as the README or the website shows
// them.
const withApi = (site: boolean) =>
    withMethods(
        withGenerated({
            props: propsSection(props, site),
            'background-props': propsSection(backgroundProps, site),
            types: typesSection(site),
        }),
        site,
    )
const updatedReadme = withApi(false)
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

// The website's pages: the README, the benchmarks and development docs beside
// it, and the guides, each doc's page named after its title (the files keep
// their names, which links elsewhere point to).
const TOP_LEVEL = ['docs/benchmarks.md', 'docs/development.md']
const titleOf = (file: string) =>
    sources.get(file)!.match(/^# (.*)$/m)?.[1] ?? file
const pageOf = (file: string) =>
    file === 'README.md'
        ? ''
        : sources.has(file)
          ? `${TOP_LEVEL.includes(file) ? '' : 'guides/'}${slug(titleOf(file))}`
          : undefined

// Links between the README and docs/ go to their pages on the website (and are
// checked), links to other files in the repo to GitHub. `file` is the page's
// path in the repo.
function rewriteLinks(markdown: string, file: string) {
    // Relative, so they work under the website's base path.
    const toRoot =
        '../'.repeat(pageOf(file)!.split('/').filter(Boolean).length) || './'
    return markdown.replace(
        // Links, and link definitions (not footnotes, [^name]: ...).
        /(\]\(|^\[(?!\^)[^\]]+\]: )([^)\s#]*)(#[^)\s]*)?/gm,
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

// The main page: the README, with the API docs as the website shows them, and
// without its title (the page's title is shown instead).
const { description } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))
const readmePage = withTypeLinks(withApi(true).replace(/^# .*\n+/m, ''))
write(
    '',
    frontmatter({
        title: 'React Native Fast Image',
        description,
        // The site's name alone, not "React Native Fast Image | React Native
        // Fast Image".
        head: [{ tag: 'title', content: 'React Native Fast Image' }],
    }) + rewriteLinks(readmePage, 'README.md'),
)

// A page per doc, titled with its first heading.
for (const file of docs) {
    const markdown = sources.get(file)!
    write(
        pageOf(file)!,
        frontmatter({ title: titleOf(file) }) +
            rewriteLinks(markdown.replace(/^# .*\n+/m, ''), file),
    )
}
