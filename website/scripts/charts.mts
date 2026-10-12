// The benchmarks page's charts: a `<!-- chart: Grid (ms), Large (ms) -->`
// comment before a table (hidden on GitHub) becomes small multiples of that
// table's columns on the website, a strip per column and a bar per row, Fast
// Image's in the accent colour and the rest in gray, with each cell's text at
// its bar's tip. The exact figures stay in the table under it. Static HTML
// and CSS (src/styles/charts.css): the bars are percentages of the column, so
// the chart fits any width without measuring text.

const EMPHASIS = 'Fast Image'

interface Cell {
    text: string
    // The bar's end: the median, or a range's low end.
    value?: number
    // The line on from the bar: the 90th percentile, or a range's high end.
    high?: number
    unit?: string
}

const number = String.raw`(\d[\d,]*(?:\.\d+)?)`
const parseCell = (text: string): Cell => {
    const n = (s: string) => Number(s.replace(/,/g, ''))
    const pair = text.match(
        new RegExp(`^${number}\\s*(?:/|–)\\s*${number}\\s*([A-Za-z%]+)?$`),
    )
    if (pair)
        return { text, value: n(pair[1]), high: n(pair[2]), unit: pair[3] }
    const single = text.match(new RegExp(`^${number}\\s*([A-Za-z%]+)?$`))
    if (single) return { text, value: n(single[1]), unit: single[2] }
    return { text }
}

const cellsOf = (line: string) =>
    line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim())

// Round steps (1, 2 or 5 times a power of ten) up to max, as close to 4 of
// them as they come.
function ticks(max: number) {
    const power = 10 ** Math.floor(Math.log10(max / 4))
    const step = [1, 2, 5, 10]
        .map((m) => m * power)
        .reduce((best, s) =>
            Math.abs(max / s - 4) < Math.abs(max / best - 4) ? s : best,
        )
    const result = []
    for (let t = 0; t <= max; t += step) result.push(t)
    return result
}

const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const percent = (v: number, max: number) => `${+((v / max) * 100).toFixed(2)}%`
// "React Native Image" → "RN Image", for narrow charts.
const shortName = (name: string) => {
    const words = name.split(' ')
    return words.length > 2
        ? words
              .slice(0, -1)
              .map((w) => w[0])
              .join('') +
              ' ' +
              words.at(-1)
        : name
}

function chart(columns: string[], table: string[]) {
    const [header, , ...body] = table.map(cellsOf)
    const rows = body.map(([name, ...cells]) => ({
        name,
        cells: cells.map(parseCell),
    }))
    const strips = columns.map((column) => {
        const i = header.indexOf(column) - 1
        if (i < 0) throw new Error(`No column ${column} in the table`)
        const cells = rows.map((row) => row.cells[i])
        const max = Math.max(...cells.map((c) => c.high ?? c.value ?? 0))
        const [, title, headerUnit] = column.match(/^(.*?)(?: \((.*)\))?$/)!
        const unit = headerUnit ?? cells.find((c) => c.unit)?.unit ?? ''
        const detail = cells.some(
            (c) => c.high !== undefined && c.text.includes('/'),
        )
            ? `${unit}, median / 90th percentile`
            : unit
        const bars = rows.map((row, r) => {
            const cell = cells[r]
            const label =
                `<span class="chart-label">` +
                `<span class="chart-long">${escape(row.name)}</span>` +
                `<span class="chart-short">${escape(shortName(row.name))}</span></span>`
            const mark =
                row.name === EMPHASIS ? 'chart-emphasis' : 'chart-context'
            if (cell.value === undefined)
                return `${label}<span class="chart-track"><span class="chart-note">${escape(cell.text)}</span></span>`
            const end = cell.high ?? cell.value
            return (
                `${label}<span class="chart-track">` +
                `<span class="chart-bar ${mark}" style="width:${percent(cell.value, max)}"></span>` +
                (cell.high === undefined
                    ? ''
                    : `<span class="chart-range ${mark}" style="left:${percent(cell.value, max)};width:${percent(cell.high - cell.value, max)}"></span>`) +
                `<span class="chart-value${row.name === EMPHASIS ? '' : ' chart-muted'}" style="left:${percent(end, max)}">${escape(cell.text)}</span>` +
                `</span>`
            )
        })
        const axis = ticks(max)
            .map(
                (t) =>
                    `<span style="left:${percent(t, max)}">${t.toLocaleString('en-US')}</span>`,
            )
            .join('')
        return (
            `<div class="chart-strip">` +
            `<div class="chart-title">${escape(title)} <span class="chart-unit">${escape(detail)}</span></div>` +
            `<div class="chart-rows">${bars.join('')}<span class="chart-axis">${axis}</span></div>` +
            `</div>`
        )
    })
    // Room after the plot for the longest value at a bar's tip, in characters.
    const room = Math.max(
        ...columns.flatMap((column) =>
            rows
                .map((row) => row.cells[header.indexOf(column) - 1])
                .filter((cell) => cell.value !== undefined)
                .map((cell) => cell.text.length),
        ),
    )
    // Hidden from screen readers: the table under it has the same figures.
    return `<figure class="chart not-content" aria-hidden="true" style="--chart-room:${room}">${strips.join('')}</figure>`
}

// The page's markdown with each chart comment followed by its chart (one line
// of HTML: a blank line would end the HTML block).
export function withCharts(markdown: string) {
    return markdown.replace(
        /^<!-- chart: (.*) -->\n+((?:\|.*\n)+)/gm,
        (_, columns: string, table: string) =>
            `${chart(columns.split(', '), table.trim().split('\n'))}\n\n${table}`,
    )
}
