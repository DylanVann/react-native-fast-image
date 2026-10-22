// A source's headers as native takes them: numbers and booleans as strings,
// as fetch's Headers converts them (String(), so 1e21 is "1e+21" on both
// platforms). Native sends only string values, and leaves out null and
// undefined ones (headers that aren't set). The same object when there's
// nothing to convert.
export function withStringHeaders<T>(source: T): T {
    const headers = (source as { headers?: unknown } | null | undefined)
        ?.headers
    if (
        headers == null ||
        typeof headers !== 'object' ||
        Array.isArray(headers)
    )
        return source
    let converted: Record<string, unknown> | undefined
    for (const name of Object.keys(headers)) {
        const value = (headers as Record<string, unknown>)[name]
        if (typeof value === 'number' || typeof value === 'boolean') {
            converted ??= { ...headers }
            converted[name] = String(value)
        }
    }
    return converted ? { ...source, headers: converted } : source
}
